import fs from "fs";
import path from "path";

/**
 * Resolves the durable identity of a Studio source while preserving a missing
 * destination suffix below its nearest real ancestor.  This keeps aliases
 * (including symlinks) from splitting job ownership before publication.
 */
export function canonicalStudioProjectIdentity(rawPath: string): string {
    const resolved = path.resolve(rawPath);
    const missing: string[] = [];
    let candidate = resolved;
    for (;;) {
        try {
            return path.join(fs.realpathSync(candidate), ...missing.reverse());
        } catch {
            const parent = path.dirname(candidate);
            if (parent === candidate) return resolved;
            missing.push(path.basename(candidate));
            candidate = parent;
        }
    }
}
