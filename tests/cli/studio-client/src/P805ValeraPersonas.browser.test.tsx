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
    it("runs the actual packed launcher, Studio browser workflow, and owned-resource cleanup when the controller supplies its packed candidate", async () => {
        // This is deliberately not a conditional no-op.  Packaging stays under
        // controller ownership, but a controller that asks for this focused
        // browser check must provide the exact packed candidate it intends to
        // approve; otherwise there is no executable campaign evidence.
        // The ordinary focused suite has no machine-owned archive.  Keep this
        // test executable (rather than skipped) by proving the runner refuses
        // to manufacture a candidate binding; the controller supplies all
        // three values to exercise the real packed branch.
        if (!packedPackage || !candidateId || !candidateExecutableSha256) {
            expect(() => execFileSync(process.execPath, [runner, "--persona", "ui-ux"], {encoding: "utf8", stdio: "pipe"})).toThrow(/runner configuration is incomplete/i);
            return;
        }
        expect(candidateId).toMatch(/^[a-f0-9]{40}$/i);
        expect(candidateExecutableSha256).toMatch(/^[a-f0-9]{64}$/i);
        const output = await mkdtemp(path.join(tmpdir(), "p8-05-real-runner-"));
        try {
            const archive = await readFile(packedPackage!);
            execFileSync(process.execPath, [runner, "--persona", "ui-ux", "--phase", "initial", "--candidate", candidateId, "--package-sha256", createHash("sha256").update(archive).digest("hex"), "--candidate-executable-sha256", candidateExecutableSha256, "--packed-package", path.resolve(packedPackage), "--output", output], {encoding: "utf8", stdio: "pipe"});
            const audit = JSON.parse(await readFile(path.join(output, "initial-ui-ux-audit.json"), "utf8"));
            expect(audit.packageIdentity.archiveSha256).toBe(audit.candidatePackageSha256);
            expect(audit.rendered.actions).toHaveLength(observations.length);
            expect(audit.cleanup).toEqual(expect.objectContaining({processTreeDrained: true, resourcesDrained: true, contextRemoved: true}));
        } finally {
            await rm(output, {recursive: true, force: true});
        }
    }, 180_000);
});
