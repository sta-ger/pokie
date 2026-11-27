import fs from "fs";
import path from "path";

// Node's `mkdirSync(path, {recursive: true})` can spin indefinitely on filesystems that reject a
// missing child with ENOENT while the parent itself exists (observed on /proc). Walk the existing
// ancestors ourselves and use plain one-level mkdir calls so an unwritable destination fails fast
// with the filesystem's own error instead of hanging the CLI.
export function ensureDirectoryExists(directory: string): void {
    const missing: string[] = [];
    let current = path.resolve(directory);
    for (;;) {
        try {
            if (!fs.statSync(current).isDirectory()) {
                throw new Error(`"${current}" already exists and is not a directory.`);
            }
            break;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            // ENOTDIR means an ancestor is a regular file; walk up so the loop's own
            // "exists and is not a directory" check can name that ancestor.
            if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
            const parent = path.dirname(current);
            if (parent === current) throw error;
            missing.unshift(current);
            current = parent;
        }
    }
    for (const target of missing) {
        try {
            fs.mkdirSync(target);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            if (!fs.statSync(target).isDirectory()) throw error;
        }
    }
}
