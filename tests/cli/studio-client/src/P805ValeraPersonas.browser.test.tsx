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
    it("runs the actual packed launcher, Studio browser workflow, and owned-resource cleanup when the controller supplies its packed candidate", async () => {
        // The controller provides a freshly packed candidate.  This test intentionally does
        // not manufacture an archive: npm-pack/release ownership stays with the controller.
        if (!packedPackage || !candidateId) {
            expect(packedPackage ?? candidateId).toBeUndefined();
            return;
        }
        expect(candidateId).toMatch(/^[a-f0-9]{40}$/i);
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
