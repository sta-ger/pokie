import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

describe("P8-05 rendered Valera persona evidence", () => {
    const observations = ["onboarding-terminology-forms-progress", "reload-reconnect-recovery-cancellation-project-switch", "keyboard-responsive-accessibility"];
    const runner = path.join(process.cwd(), "scripts/p8-05-valera-browser-audit.mjs");

    it("exposes a fail-closed public runner command instead of accepting claim objects", () => {
        expect(() => execFileSync(process.execPath, [runner], {encoding: "utf8", stdio: "pipe"})).toThrow(/runner configuration is incomplete/i);
    });

    const packedPackage = process.env.P805_PACKED_PACKAGE;
    const candidateId = process.env.P805_CANDIDATE;
    const candidateExecutableSha256 = process.env.P805_CANDIDATE_EXECUTABLE_SHA256;
    const candidateExecutableReceipt = process.env.P805_CANDIDATE_EXECUTABLE_RECEIPT;
    const candidateExecutableReceiptSha256 = process.env.P805_CANDIDATE_EXECUTABLE_RECEIPT_SHA256;
    it("runs the actual packed launcher, Studio browser workflow, and owned-resource cleanup", async () => {
        // The controller supplies a verifier-owned archive and executable
        // receipt.  There is intentionally no configuration-error branch: a
        // green result must have launched the installed CLI and Studio.
        expect(packedPackage).toEqual(expect.any(String));
        expect(candidateId).toEqual(expect.any(String));
        expect(candidateExecutableSha256).toEqual(expect.any(String));
        expect(candidateExecutableReceipt).toEqual(expect.any(String));
        expect(candidateExecutableReceiptSha256).toEqual(expect.any(String));
        expect(candidateId).toMatch(/^[a-f0-9]{40}$/i);
        expect(candidateExecutableSha256).toMatch(/^[a-f0-9]{64}$/i);
        expect(candidateExecutableReceiptSha256).toMatch(/^[a-f0-9]{64}$/i);
        const output = await mkdtemp(path.join(tmpdir(), "p8-05-real-runner-"));
        try {
            const archive = await readFile(packedPackage!);
            execFileSync(process.execPath, [runner, "--persona", "ui-ux", "--phase", "initial", "--candidate", candidateId, "--package-sha256", createHash("sha256").update(archive).digest("hex"), "--candidate-executable-sha256", candidateExecutableSha256, "--candidate-executable-receipt", path.resolve(candidateExecutableReceipt), "--candidate-executable-receipt-sha256", candidateExecutableReceiptSha256, "--packed-package", path.resolve(packedPackage), "--output", output], {encoding: "utf8", stdio: "pipe"});
            const audit = JSON.parse(await readFile(path.join(output, "initial-ui-ux-audit.json"), "utf8"));
            expect(audit.packageIdentity.archiveSha256).toBe(audit.candidatePackageSha256);
            expect(audit.rendered.actions).toHaveLength(observations.length);
            expect(audit.cleanup).toEqual(expect.objectContaining({processTreeDrained: true, resourcesDrained: true, contextRemoved: true}));
        } finally {
            await rm(output, {recursive: true, force: true});
        }
    }, 180_000);
});
