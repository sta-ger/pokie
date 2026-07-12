import path from "path";

// True when `candidate` is `root` itself or a descendant of it. Shared containment check: originally
// inlined in StudioServer.resolveStaticFilePath (guarding the studio-client static asset root), reused
// by the blueprint load/save/build-outDir path guards (see cli/studio/blueprint/StudioBlueprintService)
// to keep a user-supplied blueprint path from resolving into Studio's own internal directories.
export function isPathWithin(root: string, candidate: string): boolean {
    const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
    return candidate === root || candidate.startsWith(rootWithSep);
}
