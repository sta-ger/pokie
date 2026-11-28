import fs from "fs";
import {BuildConflictError} from "../BuildConflictError.js";

// The one "never overwrite silently" precondition every concrete BuildOutputBuilder enforces before publishing --
// the same missing-or-empty bar GamePackageGenerator's own assertMissingOrEmpty already enforces for
// "tsPackage", applied uniformly (via BuildConflictError, not a bare Error) to every other target so
// "pokie build" never has a per-target-different overwrite policy. "file" targets (parWorkbook) must simply not
// exist yet -- there's no "empty file" equivalent.
export function assertBuildDestinationAvailable(destinationPath: string, kind: "file" | "directory"): void {
    try {
        fs.lstatSync(destinationPath);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return;
        // A destination that cannot even be inspected is caller input, not an internal failure. Keep the
        // shared conflict type so planners, CLI diagnostics and Studio's preflight all take the same path.
        if (code === "ENOTDIR") {
            throw new BuildConflictError(`"${destinationPath}" is inside a file, not a folder. Choose a different output path.`);
        }
        if (code === "ENAMETOOLONG") {
            throw new BuildConflictError(`"${destinationPath}" is too long for this filesystem. Use a shorter output path.`);
        }
        if (code === "EACCES" || code === "EPERM") {
            throw new BuildConflictError(`POKIE doesn't have permission to use "${destinationPath}". Choose a different output path or fix its permissions.`);
        }
        if (code === "EROFS") {
            throw new BuildConflictError(`"${destinationPath}" is on a read-only location. Choose a writable output path.`);
        }
        throw error;
    }

    if (kind === "file") {
        throw new BuildConflictError(
            `"${destinationPath}" already exists. POKIE never overwrites an existing file -- choose a different --out path or remove it first.`,
        );
    }

    if (!fs.statSync(destinationPath).isDirectory()) {
        throw new BuildConflictError(
            `"${destinationPath}" already exists and is not a directory. Choose a different --out path or remove it first.`,
        );
    }

    if (fs.readdirSync(destinationPath).length > 0) {
        throw new BuildConflictError(
            `"${destinationPath}" already exists and is not empty. POKIE always writes a brand-new output into a missing or empty directory -- choose a different --out path or remove it first.`,
        );
    }
}
