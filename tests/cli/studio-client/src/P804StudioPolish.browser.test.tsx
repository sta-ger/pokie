import {existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";

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
            expect(result.status).toBe(0);
            const transcript = readFileSync(resolve(evidence, "AUDIT-TRANSCRIPT.txt"), "utf8");
            expect(transcript).toContain("WORKFLOW created, registered, and opened a real long-named project");
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
