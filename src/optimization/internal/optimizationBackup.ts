import crypto from "crypto";
import fs from "fs";
import path from "path";

export type OptimizationBackupFile = {
    readonly file: string;
    readonly before: Buffer;
};

export type OptimizationBackup = {
    readonly filename: string;
    readonly path: string;
    readonly content: string;
    readonly sha256: string;
};

/**
 * A portable, human-readable snapshot of the authored files Apply is about to replace. It is written
 * before the source mutation and lives outside the browser, so it remains usable after a Studio restart,
 * a different browser, or a cleared localStorage. Contents are base64 because the optimizer can touch
 * more than one authored file (a TypeScript package has two).
 */
export function writeOptimizationBackup(
    projectRoot: string,
    jobId: string,
    files: readonly OptimizationBackupFile[],
    now = new Date(),
): OptimizationBackup {
    if (files.length === 0) throw new Error("No authored files were available for the pre-apply backup.");
    const base = fs.statSync(projectRoot).isFile() ? path.dirname(projectRoot) : projectRoot;
    const directory = path.join(base, ".pokie", "optimization-backups");
    fs.mkdirSync(directory, {recursive: true});
    const safeJobId = jobId.replace(/[^A-Za-z0-9_-]/g, "_");
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const filename = `optimization-${safeJobId}-${stamp}.json`;
    const payload = {
        kind: "pokie-optimization-pre-apply-backup",
        schemaVersion: 1,
        createdAt: now.toISOString(),
        jobId,
        projectRoot,
        files: files.map((item) => {
            const relative = path.relative(base, item.file);
            return {
                path: relative.startsWith("..") ? item.file : relative.split(path.sep).join("/"),
                sha256: `sha256:${crypto.createHash("sha256").update(item.before).digest("hex")}`,
                contentBase64: item.before.toString("base64"),
            };
        }),
    };
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    const target = path.join(directory, filename);
    fs.writeFileSync(target, content, {encoding: "utf8", mode: 0o600});
    return {
        filename,
        path: target,
        content,
        sha256: `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`,
    };
}
