import fs from "fs";
import path from "path";
import type {ExternalGeneratedArtifact} from "./ExternalGeneratedArtifact.js";

// Writes an already-generated (and ideally already-validated — see ExternalArtifactValidator) artifact set to
// plain local files under outDir. This is the one concrete, generic piece of "publish to a transport" this SDK
// ships (see ExternalDeploymentRuntimeAdapter's own doc comment on why a live push to any real RGS/aggregator
// is out of scope) — LocalFileExternalDeploymentRuntimeAdapter is built directly on top of it.
//
// Deliberately simple compared to StakeEngineExporter's own atomic temp-dir-then-rename publish: this SDK's own
// generation step is already fully in-memory and side-effect-free (see ExternalArtifactGenerator), so a target
// that needs atomic publish semantics can build its own temp-directory swap around this helper (or bypass it
// entirely) — that's a target-specific transport policy, not something a generic SDK-wide write helper should
// impose on every target.
//
// Every "relativePath" is resolved against outDir and then checked to still be inside it — a relativePath
// containing ".." (or an absolute path) throws rather than silently writing outside outDir, the same
// path-traversal guard StandardExternalArtifactValidator applies before generation output is ever handed here.
// Returns the absolute paths actually written, in the same order as "artifacts".
export function writeExternalDeploymentArtifactsToDirectory(artifacts: readonly ExternalGeneratedArtifact[], outDir: string): readonly string[] {
    const resolvedOutDir = path.resolve(outDir);
    const written: string[] = [];

    for (const artifact of artifacts) {
        const resolvedPath = path.resolve(resolvedOutDir, artifact.relativePath);
        const relativeToOutDir = path.relative(resolvedOutDir, resolvedPath);
        if (relativeToOutDir.startsWith("..") || path.isAbsolute(relativeToOutDir)) {
            throw new Error(`External artifact relativePath "${artifact.relativePath}" escapes the output directory "${resolvedOutDir}".`);
        }

        fs.mkdirSync(path.dirname(resolvedPath), {recursive: true});
        fs.writeFileSync(resolvedPath, artifact.content);
        written.push(resolvedPath);
    }

    return written;
}
