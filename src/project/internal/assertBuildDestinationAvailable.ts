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
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }

    if (kind === "file") {
        throw new BuildConflictError(
            `"${destinationPath}" already exists. "pokie build" never overwrites an existing file -- choose a different --out path or remove it first.`,
        );
    }

    if (!fs.statSync(destinationPath).isDirectory()) {
        throw new BuildConflictError(
            `"${destinationPath}" already exists and is not a directory. Choose a different --out path or remove it first.`,
        );
    }

    if (fs.readdirSync(destinationPath).length > 0) {
        throw new BuildConflictError(
            `"${destinationPath}" already exists and is not empty. "pokie build" always writes a brand-new output into a missing or empty directory -- choose a different --out path or remove it first.`,
        );
    }
}
