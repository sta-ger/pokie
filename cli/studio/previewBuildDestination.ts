import {BUILT_PACKAGE_FILES, assertPreparedArtifactDestinationAvailable, resolveGamePackageDestination} from "pokie";
import fs from "fs";
import path from "path";

// Advisory only: execution rechecks the same shared publication guard.
export type BuildDestinationPreview = {
    readonly projectRoot: string;
    // Legacy clients conservatively block any unavailable destination; state explains why.
    readonly destinationHasContent: boolean;
    readonly destinationState: "missing" | "empty" | "occupied" | "file" | "unsafe" | "unreadable";
    readonly destinationError?: string;
    readonly createFiles: string[];
    readonly updateFiles: string[];
    readonly deleteFiles: string[];
};

export function previewBuildDestination(
    manifestId: string,
    cwd: string,
    outDir: string | undefined,
    sourcePath?: string,
    protectedRoot?: string,
): BuildDestinationPreview {
    let projectRoot = path.resolve(cwd, outDir ?? manifestId);
    let destinationState: BuildDestinationPreview["destinationState"] = "missing";
    let destinationError: string | undefined;
    try {
        projectRoot = resolveGamePackageDestination(manifestId, cwd, outDir);
        let stat: fs.Stats | undefined;
        try {
            stat = fs.statSync(projectRoot);
        } catch (error) {
            // existsSync hides EACCES/ENOTDIR, which must not look like a new path.
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (stat !== undefined) {
            if (!stat.isDirectory()) destinationState = "file";
            else destinationState = fs.readdirSync(projectRoot).length > 0 ? "occupied" : "empty";
        }
        if (protectedRoot !== undefined) {
            try {
                assertPreparedArtifactDestinationAvailable(protectedRoot, projectRoot, "directory");
            } catch (error) {
                if (error instanceof Error && (/source itself|inside source/).test(error.message)) {
                    throw new Error(`"${projectRoot}" resolves inside POKIE Studio's own internal directory. Choose a separate output directory.`);
                }
                throw error;
            }
        }
        assertPreparedArtifactDestinationAvailable(sourcePath === undefined ? undefined : path.resolve(cwd, sourcePath), projectRoot, "directory");
    } catch (error) {
        destinationError = error instanceof Error ? error.message : String(error);
        if ((/not a valid directory name|source itself|inside source|internal directory/).test(destinationError)) destinationState = "unsafe";
        else if (destinationState !== "file" && destinationState !== "occupied") destinationState = "unreadable";
    }
    return {
        projectRoot,
        destinationHasContent: destinationError !== undefined,
        destinationState,
        ...(destinationError === undefined ? {} : {destinationError}),
        createFiles: destinationError === undefined ? [...BUILT_PACKAGE_FILES].sort() : [],
        updateFiles: [],
        deleteFiles: [],
    };
}
