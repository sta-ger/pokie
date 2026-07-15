import fs from "fs";
import path from "path";
import type {ExternalGeneratedArtifact} from "./ExternalGeneratedArtifact.js";

export type ExternalDeploymentFileWriter = (filePath: string, data: string | Buffer) => void;

// Writes an already-generated (and ideally already-validated — see ExternalArtifactValidator) artifact set to
// plain local files under outDir, one file at a time, in "artifacts" order — no atomicity, no rollback: a
// failure partway through leaves outDir with whatever prefix of "artifacts" had already been written. This is
// the low-level primitive both `LocalFileExternalDeploymentRuntimeAdapter` (via
// atomicallyWriteExternalDeploymentArtifactsToDirectory, which wraps a call to this function against a scratch
// temp directory to get atomicity) and any other target-specific transport are free to build on directly.
//
// Every "relativePath" is resolved against outDir and then checked to still be inside it — a relativePath
// containing ".." (or an absolute path) throws rather than silently writing outside outDir, the same
// path-traversal guard StandardExternalArtifactValidator applies before generation output is ever handed here.
// Returns the absolute paths actually written, in the same order as "artifacts".
//
// "writeFile" defaults to a real fs.writeFileSync call and is only ever overridden in tests, to deterministically
// simulate a write failing partway through a batch without relying on filesystem permissions/quotas.
export function writeExternalDeploymentArtifactsToDirectory(
    artifacts: readonly ExternalGeneratedArtifact[],
    outDir: string,
    writeFile: ExternalDeploymentFileWriter = (filePath, data) => fs.writeFileSync(filePath, data),
): readonly string[] {
    const resolvedOutDir = path.resolve(outDir);
    const written: string[] = [];

    for (const artifact of artifacts) {
        const resolvedPath = path.resolve(resolvedOutDir, artifact.relativePath);
        const relativeToOutDir = path.relative(resolvedOutDir, resolvedPath);
        if (relativeToOutDir.startsWith("..") || path.isAbsolute(relativeToOutDir)) {
            throw new Error(`External artifact relativePath "${artifact.relativePath}" escapes the output directory "${resolvedOutDir}".`);
        }

        fs.mkdirSync(path.dirname(resolvedPath), {recursive: true});
        writeFile(resolvedPath, artifact.content);
        written.push(resolvedPath);
    }

    return written;
}
