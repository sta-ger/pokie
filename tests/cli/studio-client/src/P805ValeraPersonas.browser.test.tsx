import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

describe("P8-05 rendered Valera persona evidence", () => {
    const observations = ["onboarding-terminology-forms-progress", "reload-reconnect-recovery-cancellation-project-switch", "keyboard-responsive-accessibility"];
    const audit = () => ({persona: "ui-ux", candidatePackageSha256: "a".repeat(64), packageIdentity: {archiveSha256: "a".repeat(64), installedCli: "/packed/node_modules/.bin/pokie", installedPackageJsonSha256: "b".repeat(64)}, cleanup: {processTreeDrained: true, resourcesDrained: true, contextRemoved: true, evidenceId: "cleanup"}, rendered: {execution: "packed-public-cli-built-studio-rendered-controls", viewports: ["wide", "compact", "narrow"], measurements: {consoleExceptions: 0, unhandledRequestFailures: 0, documentOverflow: false, inaccessiblePrimaryActions: 0, unexplainedDisabledControls: 0}, actions: observations.map((observation, index) => ({observation, evidenceId: `state-${index}`, screenshotEvidenceId: `shot-${index}`, viewport: ["wide", "compact", "narrow"][index], elapsedMs: 1, interaction: {control: "Run workflow", outcome: "observed"}})), recovery: {reloadReconnect: {observed: true, evidenceId: "e"}, projectSwitch: {observed: true, evidenceId: "e"}, staleResponseIsolation: {observed: true, evidenceId: "e"}, unsavedWorkProtection: {observed: true, evidenceId: "e"}, serverRestart: {observed: true, evidenceId: "e"}}, jobs: {success: {observed: true, evidenceId: "e"}, actionableFailure: {observed: true, evidenceId: "e"}, cooperativeCancellation: {observed: true, evidenceId: "e"}, retryWithoutPartialArtifacts: {observed: true, evidenceId: "e"}}}});
    const invoke = (value: unknown) => execFileSync(process.execPath, ["--input-type=module", "--eval", `import {validateP805RenderedPersonaAudit as validate} from ${JSON.stringify(path.join(process.cwd(), "scripts/p8-05-valera-browser-audit.mjs"))}; validate(${JSON.stringify(value)});`], {encoding: "utf8", stdio: "pipe"});

    it("accepts only the real packed-launcher rendered-browser contract", () => {
        expect(() => invoke(audit())).not.toThrow();
        const invalid = audit();
        invalid.rendered.execution = "component-fixture";
        expect(() => invoke(invalid)).toThrow(/public-browser/i);
    });

    it("rejects claim-only recovery and lifecycle observations", () => {
        const invalid = audit();
        invalid.rendered.jobs.cooperativeCancellation.observed = false;
        expect(() => invoke(invalid)).toThrow(/measured success\/failure\/cancellation\/retry/i);
    });

    it("rejects an audit whose action was not an executed rendered control", () => {
        const invalid = audit();
        Reflect.deleteProperty(invalid.rendered.actions[0], "interaction");
        expect(() => invoke(invalid)).toThrow(/executed action evidence/i);
    });

    const packedPackage = process.env.P805_PACKED_PACKAGE;
    const candidateId = process.env.P805_CANDIDATE;
    const executePackedAudit = packedPackage && candidateId && (/^[a-f0-9]{40}$/i).test(candidateId) ? it : it.skip;

    executePackedAudit("runs the actual packed launcher, Studio browser workflow, and owned-resource cleanup", async () => {
        // The controller provides a freshly packed candidate.  This test intentionally does
        // not manufacture an archive: npm-pack/release ownership stays with the controller.
        const {runP805ValeraBrowserAudit} = await import("../../../../../scripts/p8-05-valera-browser-audit.mjs");
        const output = await mkdtemp(path.join(tmpdir(), "p8-05-real-runner-"));
        try {
            const archive = await readFile(packedPackage!);
            const audit = await runP805ValeraBrowserAudit({persona: "ui-ux", phase: "initial", candidateId, candidatePackageSha256: createHash("sha256").update(archive).digest("hex"), packedPackage: path.resolve(packedPackage!), output});
            expect(audit.packageIdentity.archiveSha256).toBe(audit.candidatePackageSha256);
            expect(audit.rendered.actions).toHaveLength(observations.length);
            expect(audit.cleanup).toEqual(expect.objectContaining({processTreeDrained: true, resourcesDrained: true, contextRemoved: true}));
        } finally {
            await rm(output, {recursive: true, force: true});
        }
    }, 180_000);
});
