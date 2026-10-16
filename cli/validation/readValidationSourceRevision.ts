import crypto from "crypto";
import fs from "fs";
import path from "path";

/** Bounded local-source identity around independently acquired validation adapters.
 * Dependency installations are external collaborators, not a proof about executable fidelity.
 * ctime/inode detect replacement even when a writer restores the original bytes/mtime.
 */
export function readValidationSourceRevision(source: string): string {
    const hash = crypto.createHash("sha256");
    let entries = 0;
    const ancestors = new Set<string>();
    const visit = (target: string): void => {
        if (++entries > 10000) throw new Error("Source revision inventory exceeds validation limits.");
        hash.update(target + "\0");
        let stat: fs.BigIntStats;
        try {
            stat = fs.lstatSync(target, {bigint: true});
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            hash.update("missing\0");
            return;
        }
        if (stat.isSymbolicLink()) {
            hash.update(fs.readlinkSync(target));
            const resolved = fs.realpathSync(target);
            if (ancestors.has(resolved)) throw new Error("Cyclic validation source inventory.");
            visit(resolved);
        } else if (stat.isDirectory()) {
            if (ancestors.has(target)) throw new Error("Cyclic validation source inventory.");
            ancestors.add(target);
            hash.update(`directory:${stat.dev}:${stat.ino}\0`);
            const children = fs.readdirSync(target);
            if (children.length > 10000 - entries) throw new Error("Source revision inventory exceeds validation limits.");
            for (const child of children.sort()) if (!["node_modules", ".git"].includes(child)) visit(path.join(target, child));
            ancestors.delete(target);
        } else {
            hash.update(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}\0`);
        }
    };
    visit(path.resolve(source));
    if (path.extname(source).toLowerCase() === ".wasm") visit(path.resolve(source + ".pokie-wasm.json"));
    return hash.digest("hex");
}
