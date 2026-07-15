import fs from "fs";
import path from "path";
import type {StakeEngineManifest} from "../StakeEngineManifest.js";

const MANIFEST_FILE_NAME = "pokie-manifest.json";
const GENERATED_BY = "pokie stakeengine export";

// Returns the existing directory's own pokie-manifest.json, or undefined if there's none there, it doesn't
// parse, or it wasn't written by "pokie stakeengine export" — mirrors GamePackageGenerator's own
// readPreviousBuildInfo, one level down (a Stake export directory rather than a generated game package).
function readPreviousManifest(outDir: string): StakeEngineManifest | undefined {
    const manifestPath = path.join(outDir, MANIFEST_FILE_NAME);
    if (!fs.existsSync(manifestPath)) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        if (!parsed || parsed.generatedBy !== GENERATED_BY) {
            return undefined;
        }
        return parsed as StakeEngineManifest;
    } catch {
        return undefined;
    }
}

// Refuses to export into an existing, non-empty directory unless every file about to be written is either
// absent or already known to have been produced by a prior "pokie stakeengine export" run (recognized via that
// run's own pokie-manifest.json "files" list) — same rebuild-safety guarantee, and the same reasoning, as
// GamePackageGenerator.assertSafeToRebuild: a re-export into the same --out directory overwrites cleanly, while
// a directory that happens to already have unrelated files is left untouched and reported as a conflict.
export function assertSafeToRebuildStakeEngineExport(outDir: string, aboutToWrite: readonly string[]): void {
    if (!fs.statSync(outDir).isDirectory()) {
        throw new Error(`"${outDir}" already exists and is not a directory. Choose a different --out directory or remove it first.`);
    }

    const previousManifest = readPreviousManifest(outDir);
    const knownFiles = previousManifest !== undefined && Array.isArray(previousManifest.files) ? previousManifest.files : [];

    const conflicting = aboutToWrite.filter(
        (relativePath) => !knownFiles.includes(relativePath) && fs.existsSync(path.join(outDir, relativePath)),
    );

    if (conflicting.length > 0) {
        throw new Error(
            `"${outDir}" already exists and contains file(s) "pokie stakeengine export" did not generate: ${conflicting.join(", ")}. ` +
                `Refusing to overwrite them — choose a different --out directory, remove the conflicting file(s), or point --out at a ` +
                `directory previously produced by "pokie stakeengine export" (recognized via its own pokie-manifest.json).`,
        );
    }
}
