import {existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {constants, runInNewContext, runInThisContext} from "node:vm";

const root = resolve(__dirname, "../../../..");
const audit = resolve(root, "scripts/p8-04-studio-polish-browser-audit.mjs");

describe("P8-04 Studio polish browser audit", () => {
    jest.setTimeout(300_000);

    it("drives the built Studio through rendered project and durable-job workflows at every required viewport", () => {
        // This is deliberately not a jsdom component assertion. The audit
        // starts dist/cli/pokie.js and Chromium, then uses only CDP browser
        // input against the rendered Studio UI. Its production invocation
        // writes the committed evidence directory; the Jest run isolates its
        // disposable screenshots so a verification run cannot rewrite it.
        expect(existsSync(resolve(root, "dist/cli/pokie.js"))).toBe(true);
        const evidence = mkdtempSync(resolve(tmpdir(), "pokie-p8-04-evidence-"));
        const offset = process.pid % 1_000;
        try {
            const result = spawnSync(process.execPath, [audit], {
                cwd: root,
                encoding: "utf8",
                timeout: 270_000,
                env: {
                    ...process.env,
                    P8_04_EVIDENCE_DIR: evidence,
                    P8_04_STUDIO_PORT: String(32_000 + offset),
                    P8_04_CHROME_PORT: String(9_300 + offset),
                },
            });
            expect(result.error).toBeUndefined();
            const transcript = readFileSync(resolve(evidence, "AUDIT-TRANSCRIPT.txt"), "utf8");
            if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}\n${transcript}`);
            const readiness = "LIFECYCLE guided creation: visible enabled Create game action after successful automatic validation";
            expect(transcript).toContain(readiness);
            expect(transcript.indexOf(readiness)).toBeLessThan(transcript.indexOf("CLICK Create game"));
            expect(transcript.match(/CLICK Create game/g)).toHaveLength(1);
            expect(transcript).toContain("WORKFLOW created, registered, and opened a real long-named project");
            expect(transcript).toContain("LIFECYCLE queued/running simulation: visible enabled button action Cancel");
            expect(transcript).toContain("LIFECYCLE simulation cancellation confirmation: visible enabled button action Confirm");
            expect(transcript).toContain("LIFECYCLE cancelling simulation: primary Cancel is hidden; retained cancellation controls are disabled");
            expect(transcript).toContain("LIFECYCLE cancelling/cancelled simulation: action Cancel is no longer visible");
            expect(transcript).toContain("LIFECYCLE completed simulation report: visible enabled button action Repeat simulation");
            expect(transcript).toContain("WORKFLOW cancelled the rendered simulation");
            expect(transcript).toContain("WORKFLOW completed a second real simulation");
            expect(transcript).toContain("VIEWPORT wide desktop: 1440x900; document overflow=false");
            expect(transcript).toContain("VIEWPORT compact desktop: 1024x768; document overflow=false");
            expect(transcript).toContain("VIEWPORT small viewport: 390x844; document overflow=false");
            for (const screenshot of [
                "wide-project-overview.png",
                "compact-simulation-running.png",
                "compact-simulation-cancelled.png",
                "wide-simulation-completed.png",
                "small-navigation.png",
            ]) {
                expect(existsSync(resolve(evidence, screenshot))).toBe(true);
            }
        } finally {
            rmSync(evidence, {recursive: true, force: true});
        }
    });
});


describe("P8-04 cancellation collection boundaries", () => {
    type EvaluateControl = (expression: string) => unknown;
    let helpers: {
        assertP804CancellingActions: (evaluate: EvaluateControl) => Promise<void>;
        waitForP804CancellationDialogClosed: (evaluate: EvaluateControl, timeout?: number) => Promise<void>;
    };
    const evaluate: EvaluateControl = (expression) => runInNewContext(expression, {document});
    const renderedButton = (id: string, disabled = false) => {
        const button = document.createElement("button");
        button.id = id;
        button.textContent = "Cancel";
        button.disabled = disabled;
        button.getClientRects = () => [{width: 100, height: 30}] as unknown as DOMRectList;
        document.body.append(button);
        return button;
    };

    beforeAll(async () => {
        helpers = await runInThisContext(`import(${JSON.stringify(pathToFileURL(audit).href)})`, {
            importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
        }) as typeof helpers;
    });
    afterEach(() => document.body.replaceChildren());

    it("allows the retained disabled job-card control during cleanup", async () => {
        renderedButton("durable-job-cancel", true);
        await expect(helpers.assertP804CancellingActions(evaluate)).resolves.toBeUndefined();
    });

    it.each(["simulation-cancel", "durable-job-cancel"])("rejects a retained enabled %s control during cleanup", async (id) => {
        renderedButton(id);
        await expect(helpers.assertP804CancellingActions(evaluate)).rejects.toThrow(/Cancel action/);
    });

    it("rejects a visible primary Cancel even when disabled", async () => {
        renderedButton("simulation-cancel", true);
        await expect(helpers.assertP804CancellingActions(evaluate)).rejects.toThrow(/primary Cancel action/);
    });

    it("waits for the confirmation exit transition without mistaking its dismiss button for a job control", async () => {
        const dismiss = renderedButton("simulation-cancel-dismiss");
        let observations = 0;
        await helpers.waitForP804CancellationDialogClosed((expression) => {
            if (++observations === 2) dismiss.remove();
            return evaluate(expression);
        }, 1_000);
        expect(observations).toBe(2);
    });

    it("fails if the confirmation stays open", async () => {
        renderedButton("simulation-cancel-confirm");
        await expect(helpers.waitForP804CancellationDialogClosed(evaluate, 0)).rejects.toThrow(/confirmation to close/);
    });
});
