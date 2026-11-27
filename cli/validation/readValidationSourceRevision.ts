import crypto from "crypto";
import fs from "fs";
import path from "path";

export type ValidationSourceSnapshot = {
    revision: string;
    entries: Map<string, string>;
};

/** Bounded local-source identity around independently acquired validation adapters.
 * Dependency installations are external collaborators, not a proof about executable fidelity.
 * ctime/inode detect replacement even when a writer restores the original bytes/mtime.
 */
export function readValidationSourceSnapshot(source: string): ValidationSourceSnapshot {
    const hash = crypto.createHash("sha256");
    const entries = new Map<string, string>();
    let count = 0;
    const ancestors = new Set<string>();
    const visit = (target: string): void => {
        if (++count > 10000) throw new Error("Source revision inventory exceeds validation limits.");
        hash.update(target + "\0");
        let stat: fs.BigIntStats;
        try {
            stat = fs.lstatSync(target, {bigint: true});
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            entries.set(target, "missing");
            hash.update("missing\0");
            return;
        }
        if (stat.isSymbolicLink()) {
            const link = fs.readlinkSync(target);
            const fingerprint = `link:${link}`;
            entries.set(target, fingerprint);
            hash.update(fingerprint + "\0");
            const resolved = fs.realpathSync(target);
            if (ancestors.has(resolved)) throw new Error("Cyclic validation source inventory.");
            visit(resolved);
        } else if (stat.isDirectory()) {
            if (ancestors.has(target)) throw new Error("Cyclic validation source inventory.");
            ancestors.add(target);
            const fingerprint = `directory:${stat.dev}:${stat.ino}`;
            entries.set(target, fingerprint);
            hash.update(fingerprint + "\0");
            const children = fs.readdirSync(target);
            if (children.length > 10000 - count) throw new Error("Source revision inventory exceeds validation limits.");
            for (const child of children.sort()) if (!["node_modules", ".git"].includes(child)) visit(path.join(target, child));
            ancestors.delete(target);
        } else {
            const fingerprint = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
            entries.set(target, fingerprint);
            hash.update(fingerprint + "\0");
        }
    };
    visit(path.resolve(source));
    if (path.extname(source).toLowerCase() === ".wasm") visit(path.resolve(source + ".pokie-wasm.json"));
    return {revision: hash.digest("hex"), entries};
}

export function readValidationSourceRevision(source: string): string {
    return readValidationSourceSnapshot(source).revision;
}

/** Human-readable changed entries, relative to the source root when possible. */
export function describeValidationSourceChanges(
    before: ValidationSourceSnapshot,
    after: ValidationSourceSnapshot,
    source: string,
): string[] {
    const root = path.resolve(source);
    let displayRoot = path.dirname(root);
    try {
        if (fs.statSync(root).isDirectory()) displayRoot = root;
    } catch {
        // A removed source is still reportable by relative path from its former parent.
    }
    const changes: string[] = [];
    for (const key of [...new Set([...before.entries.keys(), ...after.entries.keys()])].sort()) {
        const left = before.entries.get(key);
        const right = after.entries.get(key);
        if (left === right) continue;
        const display = path.relative(displayRoot, key) || path.basename(key);
        if (left === undefined) changes.push(`added ${display}`);
        else if (right === undefined) changes.push(`removed ${display}`);
        else changes.push(`modified ${display}`);
    }
    return changes;
}
