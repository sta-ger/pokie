import crypto from "crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {writeOptimizationBackup} from "../../src/optimization/internal/optimizationBackup.js";

describe("writeOptimizationBackup", () => {
    it("writes a portable pre-apply snapshot with relative paths and verifiable bytes", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-optimization-backup-"));
        try {
            const file = path.join(root, "blueprint.json");
            const before = Buffer.from('{"info":{"id":"demo"}}\n');
            fs.writeFileSync(file, before);
            const backup = writeOptimizationBackup(root, "job/with unsafe chars", [{file, before: Buffer.from(before)}], new Date("2026-11-24T12:34:56.789Z"));

            expect(backup.filename).toBe("optimization-job_with_unsafe_chars-2026-11-24T12-34-56-789Z.json");
            expect(backup.path).toBe(path.join(root, ".pokie", "optimization-backups", backup.filename));
            expect(fs.existsSync(backup.path)).toBe(true);
            expect(backup.sha256).toBe(`sha256:${crypto.createHash("sha256").update(backup.content).digest("hex")}`);

            const payload = JSON.parse(fs.readFileSync(backup.path, "utf8"));
            expect(payload).toMatchObject({
                kind: "pokie-optimization-pre-apply-backup",
                schemaVersion: 1,
                jobId: "job/with unsafe chars",
                projectRoot: root,
            });
            expect(payload.files).toHaveLength(1);
            expect(payload.files[0].path).toBe("blueprint.json");
            expect(Buffer.from(payload.files[0].contentBase64, "base64")).toEqual(before);
            expect(payload.files[0].sha256).toBe(`sha256:${crypto.createHash("sha256").update(before).digest("hex")}`);
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    it("places the backup beside a file-backed Blueprint project", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-optimization-backup-file-"));
        try {
            const file = path.join(root, "single-blueprint.json");
            fs.writeFileSync(file, "{}\n");
            const backup = writeOptimizationBackup(file, "job-1", [{file, before: Buffer.from("{}\n")}], new Date("2026-11-24T12:34:56.789Z"));
            expect(path.dirname(backup.path)).toBe(path.join(root, ".pokie", "optimization-backups"));
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    it("refuses to report a backup with no authored bytes", () => {
        expect(() => writeOptimizationBackup("/tmp/does-not-matter", "job-1", [])).toThrow("No authored files were available");
    });
});
