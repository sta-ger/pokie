import crypto from "crypto";
import fs from "fs";

export type PublishDirectoryAtomicallyOptions = {
    readonly outDir: string;
    // Writes every file this publish needs into the given (already-created) temporary directory. Must not touch
    // outDir itself — that's this function's own job, only once every file here has been written successfully.
    readonly writeFilesIntoTempDir: (tempDir: string) => void;
    readonly renameDirectory?: (from: string, to: string) => void;
    readonly removeDirectory?: (dirPath: string) => void;
};

export type PublishDirectoryAtomicallyResult = {
    // Set when the publish itself succeeded but a purely cosmetic post-publish cleanup step (removing the
    // superseded stale backup) failed — never a reason to treat the publish as failed, since outDir is already
    // fully live by that point.
    readonly cleanupWarning?: string;
};

// Publishes a directory's worth of files as "outDir" as close to one atomic step as the filesystem allows:
// build everything into a fresh temp sibling directory first, then swap it into place — never writing anything
// into outDir directly. Shared by StakeEngineExporter and StakeEngineImportWriter so the two can never disagree
// on what "atomic, no-partial-state, no-stale-leftovers" directory publishing means.
//
// If outDir doesn't exist yet, a single rename does it. If it does (a re-publish), the existing directory is
// first renamed out of the way to a ".stale-<random>" sibling (itself a single atomic rename — from that
// instant on, outDir simply doesn't exist for a moment, never a partially-updated one), then the temp directory
// is renamed into outDir. A reader can therefore only ever observe the complete old directory or the complete
// new one, never a mix of the two — and since the new directory is built entirely fresh, anything that existed
// in the old one but isn't part of this publish (a mode's now-removed library, say) is simply gone afterward.
//
// Three distinct failure modes get three distinct treatments:
//   - writing into the temp directory failing (a validation error, a disk write failing, ...) leaves outDir
//     completely untouched — the temp directory is removed best-effort and the error rethrown.
//   - the *publish* rename (tempDir -> outDir) failing after the old directory was already moved aside is a
//     real failure — the old directory is restored back to outDir (a third rename) before the error propagates.
//     If that restore itself also fails (the one truly unrecoverable case), the thrown error names the
//     ".stale-<random>" path the old directory's contents are still sitting at, so it can be restored by hand.
//   - removing the now-superseded stale directory, *after* the new one is already live at outDir, is pure
//     cleanup — a failure there is reported via "cleanupWarning" instead of thrown, and the stale directory is
//     simply left behind for manual removal.
// Every branch also guarantees the temp directory itself never lingers past the call that created it (removed
// best-effort, without ever masking whichever error is actually being thrown/returned).
export function publishDirectoryAtomically(options: PublishDirectoryAtomicallyOptions): PublishDirectoryAtomicallyResult {
    const renameDirectory = options.renameDirectory ?? ((from: string, to: string) => fs.renameSync(from, to));
    const removeDirectory = options.removeDirectory ?? ((dirPath: string) => fs.rmSync(dirPath, {recursive: true, force: true}));
    const outDir = options.outDir;

    const removeBestEffort = (dirPath: string): void => {
        try {
            removeDirectory(dirPath);
        } catch {
            // best-effort only.
        }
    };

    const tempDir = `${outDir}.tmp-${crypto.randomBytes(6).toString("hex")}`;
    try {
        fs.mkdirSync(tempDir, {recursive: true});
        options.writeFilesIntoTempDir(tempDir);
    } catch (error) {
        removeBestEffort(tempDir);
        throw error;
    }

    if (!fs.existsSync(outDir)) {
        try {
            renameDirectory(tempDir, outDir);
        } catch (error) {
            removeBestEffort(tempDir);
            throw error;
        }
        return {};
    }

    const stalePath = `${outDir}.stale-${crypto.randomBytes(6).toString("hex")}`;
    try {
        renameDirectory(outDir, stalePath);
    } catch (error) {
        // outDir was never actually moved — nothing to restore, just clean up the orphaned temp directory.
        removeBestEffort(tempDir);
        throw error;
    }

    try {
        renameDirectory(tempDir, outDir);
    } catch (publishError) {
        try {
            renameDirectory(stalePath, outDir);
        } catch (restoreError) {
            removeBestEffort(tempDir);
            throw new Error(
                `Failed to publish "${outDir}", and failed to restore the previous directory afterward: ` +
                    `${publishError instanceof Error ? publishError.message : String(publishError)}; restore failure: ` +
                    `${restoreError instanceof Error ? restoreError.message : String(restoreError)}. The previous directory's ` +
                    `contents are still intact at "${stalePath}" — rename it back to "${outDir}" by hand.`,
            );
        }
        removeBestEffort(tempDir);
        throw publishError;
    }

    try {
        removeDirectory(stalePath);
        return {};
    } catch (error) {
        return {
            cleanupWarning:
                `The publish to "${outDir}" succeeded, but the previous directory's stale backup at "${stalePath}" could not be removed: ` +
                `${error instanceof Error ? error.message : String(error)}. Remove it manually.`,
        };
    }
}
