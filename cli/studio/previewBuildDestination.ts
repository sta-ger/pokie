import {BUILT_PACKAGE_FILES, type GameBuildInfo} from "pokie";
import fs from "fs";
import path from "path";

// What a build preview needs to say about *where* a build would land and what's already there —
// computed read-only (never creates/modifies anything), mirroring the exact destination-resolution
// rules GamePackageGenerator itself applies, so a preview's answer never disagrees with what an
// actual build would do.
export type BuildDestinationPreview = {
    readonly projectRoot: string;
    // True once the destination directory exists and already has at least one entry in it -- the
    // signal an editor should surface before building, since GamePackageGenerator only ever writes
    // into a missing or empty directory (see its own doc comment) -- a destination with content
    // already in it means the real build will refuse to run at all, not merge/overwrite in place.
    readonly destinationHasContent: boolean;
    readonly createFiles: string[];
    // Always empty: a build only ever creates a brand-new set of files into an empty/missing
    // directory, never updates an existing one in place -- kept as an explicit field (rather than
    // omitted) so a preview never has to be read as silently assuming otherwise.
    readonly updateFiles: string[];
    readonly deleteFiles: string[];
    // Set only when the destination already holds a package an *older*, pre-migration "pokie build"
    // run produced (recognized via its own now-legacy src/generated/build-info.json) -- never set for
    // a destination that doesn't exist yet, is empty, or holds something else entirely. A package a
    // *current* "pokie build" produced carries no such file to recognize -- see BUILT_PACKAGE_FILES.
    readonly priorBuild?: {readonly version: string; readonly blueprintHash: string; readonly generatedAt: string};
};

export function previewBuildDestination(manifestId: string, cwd: string, outDir: string | undefined): BuildDestinationPreview {
    const projectRoot = outDir !== undefined ? path.resolve(cwd, outDir) : path.join(cwd, manifestId);
    const destinationHasContent = fs.existsSync(projectRoot) && fs.statSync(projectRoot).isDirectory() && fs.readdirSync(projectRoot).length > 0;

    const priorBuildInfo = destinationHasContent ? readPriorBuildInfo(projectRoot) : undefined;

    return {
        projectRoot,
        destinationHasContent,
        createFiles: [...BUILT_PACKAGE_FILES].sort(),
        updateFiles: [],
        deleteFiles: [],
        ...(priorBuildInfo !== undefined
            ? {priorBuild: {version: priorBuildInfo.game.version, blueprintHash: priorBuildInfo.blueprintHash, generatedAt: priorBuildInfo.generatedAt}}
            : {}),
    };
}

function readPriorBuildInfo(projectRoot: string): GameBuildInfo | undefined {
    const buildInfoPath = path.join(projectRoot, "src", "generated", "build-info.json");
    if (!fs.existsSync(buildInfoPath)) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(buildInfoPath, "utf-8"));
        if (!parsed || parsed.generatedBy !== "pokie build") {
            return undefined;
        }
        return parsed as GameBuildInfo;
    } catch {
        return undefined;
    }
}
