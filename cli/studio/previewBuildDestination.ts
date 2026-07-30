import {GENERATED_PACKAGE_FILES, type GameBuildInfo} from "pokie";
import fs from "fs";
import path from "path";

// What a build preview needs to say about *where* a build would land and what's already there —
// computed read-only (never creates/modifies anything), mirroring the exact destination-resolution
// and previous-build-recognition rules GamePackageGenerator itself applies (see its own
// readPreviousBuildInfo doc comment), so a preview's answer never disagrees with what an actual build
// would do.
export type BuildDestinationPreview = {
    readonly projectRoot: string;
    // True once the destination directory exists and already has at least one entry in it — the signal
    // an editor should confirm on before building, since anything landing there overwrites/coexists with
    // whatever's already there rather than starting from nothing.
    readonly destinationHasContent: boolean;
    readonly createFiles: string[];
    readonly updateFiles: string[];
    // Always empty today: GamePackageGenerator only ever writes GENERATED_PACKAGE_FILES's own fixed
    // paths and never removes anything else already at the destination — kept as an explicit field
    // (rather than omitted) so a preview never has to be read as "silently assuming build never
    // deletes", and so a future generator that ever did remove a stale generated file has somewhere to
    // report it without changing this type's shape.
    readonly deleteFiles: string[];
    // Set only when the destination already holds a package a *previous* "pokie build" run produced
    // (recognized the same way GamePackageGenerator's own rebuild-safety check recognizes one) — never
    // set for a destination that doesn't exist yet, is empty, or holds something else entirely.
    readonly priorBuild?: {readonly version: string; readonly blueprintHash: string; readonly generatedAt: string};
};

export function previewBuildDestination(manifestId: string, cwd: string, outDir: string | undefined): BuildDestinationPreview {
    const projectRoot = outDir !== undefined ? path.resolve(cwd, outDir) : path.join(cwd, manifestId);
    const destinationHasContent = fs.existsSync(projectRoot) && fs.statSync(projectRoot).isDirectory() && fs.readdirSync(projectRoot).length > 0;

    const createFiles: string[] = [];
    const updateFiles: string[] = [];
    for (const relativePath of GENERATED_PACKAGE_FILES) {
        const exists = fs.existsSync(path.join(projectRoot, ...relativePath.split("/")));
        (exists ? updateFiles : createFiles).push(relativePath);
    }

    const priorBuildInfo = destinationHasContent ? readPriorBuildInfo(projectRoot) : undefined;

    return {
        projectRoot,
        destinationHasContent,
        createFiles: createFiles.sort(),
        updateFiles: updateFiles.sort(),
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
