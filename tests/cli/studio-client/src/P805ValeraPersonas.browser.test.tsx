import {execFileSync} from "node:child_process";
import path from "node:path";

describe("P8-05 rendered Valera persona evidence", () => {
    const audit = () => ({persona: "ui-ux", rendered: {execution: "packed-public-cli-built-studio-rendered-controls", viewports: ["wide", "narrow"], consoleExceptions: 0, unhandledRequestFailures: 0, documentOverflow: false, inaccessiblePrimaryActions: 0, unexplainedDisabledControls: 0, recovery: {reloadReconnect: true, projectSwitch: true, staleResponseIsolation: true, unsavedWorkProtection: true, serverRestart: true}, jobs: {success: true, actionableFailure: true, cooperativeCancellation: true, retryWithoutPartialArtifacts: true}}});
    const invoke = (value: unknown) => execFileSync(process.execPath, ["--input-type=module", "--eval", `import {validateP805RenderedPersonaAudit as validate} from ${JSON.stringify(path.join(process.cwd(), "scripts/p8-05-valera-browser-audit.mjs"))}; validate(${JSON.stringify(value)});`], {encoding: "utf8", stdio: "pipe"});

    it("accepts only the real packed-launcher rendered-browser contract", () => {
        expect(() => invoke(audit())).not.toThrow();
        const invalid = audit();
        invalid.rendered.execution = "component-fixture";
        expect(() => invoke(invalid)).toThrow(/public-browser/i);
    });

    it("rejects claim-only recovery and lifecycle observations", () => {
        const invalid = audit();
        invalid.rendered.jobs.cooperativeCancellation = false;
        expect(() => invoke(invalid)).toThrow(/success\/failure\/cancellation\/retry/i);
    });
});
