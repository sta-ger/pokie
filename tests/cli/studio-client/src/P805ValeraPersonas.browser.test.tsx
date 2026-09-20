import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

describe("P8-05 rendered Valera persona evidence", () => {
    const runner = path.join(process.cwd(), "scripts/p8-05-valera-browser-audit.mjs");
    const verifier = path.join(process.cwd(), "scripts/p8-05-candidate-package-verifier.mjs");

    it("exposes a fail-closed public runner command instead of accepting claim objects", () => {
        expect(() => execFileSync(process.execPath, [runner], {encoding: "utf8", stdio: "pipe"})).toThrow(/runner configuration is incomplete/i);
    });

    it("builds its own candidate package and executes every packed CLI and rendered Studio persona workflow", async () => {
        // This test owns the local candidate.  It deliberately does not accept
        // controller-provided environment receipts, so a green result cannot
        // be a configuration-only branch or a stale external archive.
        const candidate = execFileSync("git", ["rev-parse", "HEAD"], {cwd: process.cwd(), encoding: "utf8"}).trim();
        const candidateDirectory = await mkdtemp(path.join(tmpdir(), "p8-05-packed-candidate-"));
        const output = await mkdtemp(path.join(tmpdir(), "p8-05-real-runner-"));
        try {
            const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", candidateDirectory], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", maxBuffer: 64 * 1024 * 1024})) as Array<{filename: string}>;
            expect(packed).toHaveLength(1);
            const sourceArchivePath = path.join(candidateDirectory, packed[0].filename);
            const archivePath = path.join(candidateDirectory, "candidate-package.tgz");
            const receiptPath = path.join(candidateDirectory, "candidate-executable-receipt.json");
            execFileSync(process.execPath, [verifier, "--source-archive", sourceArchivePath, "--candidate-archive", archivePath, "--candidate", candidate, "--receipt", receiptPath], {encoding: "utf8", stdio: "pipe"});
            const archive = await readFile(archivePath);
            const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
            const receiptSha256 = createHash("sha256").update(await readFile(receiptPath)).digest("hex");
            expect(receipt.authentication.scheme).toBe("verifier-owned-candidate-tree");
            expect(receipt.candidateId).toBe(candidate);
            const personas = ["mathematician", "programmer", "producer", "ui-ux", "graphic-designer"];
            try {
                execFileSync(process.execPath, [runner, "--persona", "mathematician", "--workflow-personas", personas.join(","), "--phase", "initial", "--candidate", candidate, "--package-sha256", createHash("sha256").update(archive).digest("hex"), "--candidate-executable-sha256", receipt.candidateExecutableSha256, "--candidate-executable-receipt", receiptPath, "--candidate-executable-receipt-sha256", receiptSha256, "--packed-package", archivePath, "--output", output], {encoding: "utf8", stdio: "inherit", timeout: 900_000});
            } catch (error) {
                const stderr = (error as {stderr?: Buffer | string}).stderr;
                throw new Error(`packed runner failed: ${Buffer.isBuffer(stderr) ? stderr.toString("utf8") : stderr ?? String(error)}`);
            }
            const audit = JSON.parse(await readFile(path.join(output, "initial-mathematician-audit.json"), "utf8"));
            expect(audit.packageIdentity.archiveSha256).toBe(audit.candidatePackageSha256);
            expect(audit.workflowPersonas).toEqual(personas);
            for (const persona of personas) {
                const actions = audit.rendered.actions.filter((action: {persona: string}) => action.persona === persona);
                expect(actions.length).toBeGreaterThan(0);
                expect(actions.every((action: {expectedControl: string; expectedActionControl: string; expectedStableControlId: string; expectedApi: string; screenState: string; screenNavigationControl: string; stableControlId: string; browserRequestId: string; interaction: {matchedLabel: string}; precondition: {enabled: boolean; accessibleName: string}; visibleTerminal: {state: string; observedAfterRequestId: string; resultSha256: string}; terminal: {resultSha256: string}; evidenceId: string; screenshotEvidenceId: string; elapsedMs: number}) => Boolean(action.expectedControl) && (/^\/api\//).test(action.expectedApi) && action.screenState.length > 0 && action.screenNavigationControl === action.expectedControl && action.stableControlId === action.expectedStableControlId && Boolean(action.browserRequestId) && action.precondition.enabled && action.precondition.accessibleName === action.interaction.matchedLabel && action.visibleTerminal.state === "rendered" && action.visibleTerminal.observedAfterRequestId === action.browserRequestId && action.visibleTerminal.resultSha256 === action.terminal.resultSha256 && (/^[a-f0-9]{64}$/i).test(action.terminal.resultSha256) && Boolean(action.evidenceId) && Boolean(action.screenshotEvidenceId) && action.elapsedMs > 0)).toBe(true);
            }
            expect(audit.cleanup).toEqual(expect.objectContaining({processTreeDrained: true, resourcesDrained: true, contextRemoved: true}));
            expect(audit.evidence.some((item: {kind: string}) => item.kind === "screenshot")).toBe(true);
        } finally {
            await rm(output, {recursive: true, force: true});
            await rm(candidateDirectory, {recursive: true, force: true});
        }
    }, 1_000_000);
});
