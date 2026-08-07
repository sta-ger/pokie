import fs from "fs";
import {ArtifactBuildConflictError} from "../ArtifactBuildConflictError.js";

// The one "never overwrite silently" precondition every concrete ArtifactBuilder enforces before publishing --
// the same missing-or-empty bar GamePackageGenerator's own assertMissingOrEmpty already enforces for
// "tsPackage", applied uniformly (via ArtifactBuildConflictError, not a bare Error) to every other target so
// "pokie build" never has a per-target-different overwrite policy. "file" targets (parWorkbook) must simply not
// exist yet -- there's no "empty file" equivalent.
export function assertArtifactDestinationAvailable(destinationPath: string, kind: "file" | "directory"): void {
    if (!fs.existsSync(destinationPath)) {
        return;
    }

    if (kind === "file") {
        throw new ArtifactBuildConflictError(
            `"${destinationPath}" already exists. "pokie build" never overwrites an existing file -- choose a different --out path or remove it first.`,
        );
    }

    if (!fs.statSync(destinationPath).isDirectory()) {
        throw new ArtifactBuildConflictError(
            `"${destinationPath}" already exists and is not a directory. Choose a different --out path or remove it first.`,
        );
    }

    if (fs.readdirSync(destinationPath).length > 0) {
        throw new ArtifactBuildConflictError(
            `"${destinationPath}" already exists and is not empty. "pokie build" always writes a brand-new artifact into a missing or empty directory -- choose a different --out path or remove it first.`,
        );
    }
}
