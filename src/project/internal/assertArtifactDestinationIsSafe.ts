import fs from "fs";
import path from "path";
import {ArtifactBuildConflictError} from "../ArtifactBuildConflictError.js";

function resolveThroughExistingAncestor(targetPath: string): string {
    const suffix: string[] = [];
    let current = path.resolve(targetPath);
    while (!fs.existsSync(current)) {
        const parent = path.dirname(current);
        if (parent === current) break;
        suffix.unshift(path.basename(current));
        current = parent;
    }
    return path.join(fs.existsSync(current) ? fs.realpathSync(current) : current, ...suffix);
}

function isSameOrDescendant(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

// A build must never place its output over its own source, nor below a source directory.  Resolve both
// paths through their existing ancestors first: a lexical `source/out` check alone misses an `out` path
// reached through a symlink, which could otherwise let a builder publish into the source it is reading.
export function assertArtifactDestinationIsSafe(sourcePath: string, destinationPath: string): void {
    const source = resolveThroughExistingAncestor(sourcePath);
    const destination = resolveThroughExistingAncestor(destinationPath);
    const sourceIsDirectory = fs.existsSync(sourcePath) && fs.statSync(sourcePath).isDirectory();

    if (source === destination || (sourceIsDirectory && isSameOrDescendant(destination, source))) {
        throw new ArtifactBuildConflictError(
            `Artifact destination "${destinationPath}" is the source itself or lies inside source "${sourcePath}". Choose a separate output path.`,
        );
    }
}
