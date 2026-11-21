import fs from "fs";
import path from "path";

// Resolve as much of a planned path as already exists. This follows a directory symlink even when its
// requested descendant has not been created yet, so an output cannot be smuggled into an input source
// through a symlink alias.
export function canonicalPlannedPath(file: string): string {
    const resolved = path.resolve(file);
    let existingAncestor = resolved;
    const missingParts: string[] = [];
    let reachedRoot = false;
    while (!reachedRoot) {
        try {
            return path.join(fs.realpathSync(existingAncestor), ...missingParts.reverse());
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                return resolved;
            }
            const parent = path.dirname(existingAncestor);
            if (parent === existingAncestor) {
                reachedRoot = true;
                continue;
            }
            missingParts.push(path.basename(existingAncestor));
            existingAncestor = parent;
        }
    }
    return resolved;
}
