import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ExternalGeneratedArtifact} from "./ExternalGeneratedArtifact.js";
import {writeExternalDeploymentArtifactsToDirectory, type ExternalDeploymentFileWriter} from "./writeExternalDeploymentArtifactsToDirectory.js";

export type AtomicExternalDeploymentWriteDependencies = {
    readonly writeFile?: ExternalDeploymentFileWriter;
    readonly renameDirectory?: (from: string, to: string) => void;
    readonly removeDirectory?: (dirPath: string) => void;
};

export type AtomicExternalDeploymentWriteResult = {
    readonly written: readonly string[];
    readonly issues: readonly ValidationIssue[];
};

// The atomic counterpart to writeExternalDeploymentArtifactsToDirectory — what
// LocalFileExternalDeploymentRuntimeAdapter actually calls. Builds the entire artifact set into a fresh
// temporary sibling directory first (never touching outDir itself), and only swaps it into place (a directory
// rename) once every file has been written successfully — the exact same publish strategy
// StakeEngineExporter.exportToDirectory uses for its own output directory, applied here to an arbitrary
// ExternalGeneratedArtifact set instead of Stake's fixed file list. That gives three guarantees:
//
//   - **A failure anywhere before the swap** (a write failing partway through the temp directory) **leaves an
//     existing outDir completely untouched**, byte for byte, and the temp directory is removed before the error
//     propagates — no partial result is ever visible at outDir, and nothing is left behind.
//   - **A failure during the swap itself** either leaves outDir exactly as it was (the "move outDir aside"
//     rename failing) or is rolled back to exactly as it was (the publish rename failing, restored via a third
//     rename) before the error propagates — with the one genuinely unrecoverable exception of the rollback
//     rename *itself* also failing, in which case the previous directory's contents are still intact at a
//     `.stale-<random>` sibling path and the thrown error says exactly where.
//   - **A successful swap's only remaining step** — removing the now-superseded stale directory — is cosmetic:
//     a failure there is reported as a warning-severity `ValidationIssue` in the returned "issues", never thrown
//     (the delivery itself already succeeded by that point).
//
// "dependencies" defaults to real fs.*Sync calls and exists only so tests can deterministically simulate a
// specific write/rename failing, the same reason StakeEngineExporter's own constructor accepts injectable
// writeFile/renameDirectory/removeDirectory.
export function atomicallyWriteExternalDeploymentArtifactsToDirectory(
    artifacts: readonly ExternalGeneratedArtifact[],
    outDir: string,
    dependencies: AtomicExternalDeploymentWriteDependencies = {},
): AtomicExternalDeploymentWriteResult {
    const writeFile = dependencies.writeFile ?? ((filePath, data) => fs.writeFileSync(filePath, data));
    const renameDirectory = dependencies.renameDirectory ?? ((from, to) => fs.renameSync(from, to));
    const removeDirectory = dependencies.removeDirectory ?? ((dirPath) => fs.rmSync(dirPath, {recursive: true, force: true}));
    const removeBestEffort = (dirPath: string): void => {
        try {
            removeDirectory(dirPath);
        } catch {
            // best-effort only — never lets a secondary cleanup failure mask the real error being thrown.
        }
    };

    const resolvedOutDir = path.resolve(outDir);
    const tempDir = `${resolvedOutDir}.tmp-${crypto.randomBytes(6).toString("hex")}`;

    let writtenUnderTemp: readonly string[];
    try {
        fs.mkdirSync(tempDir, {recursive: true});
        writtenUnderTemp = writeExternalDeploymentArtifactsToDirectory(artifacts, tempDir, writeFile);
    } catch (error) {
        removeBestEffort(tempDir);
        throw error;
    }
    const written = writtenUnderTemp.map((writtenPath) => path.join(resolvedOutDir, path.relative(tempDir, writtenPath)));

    const issue = swapDirectoryIntoPlace(tempDir, resolvedOutDir, renameDirectory, removeDirectory, removeBestEffort);
    return {written, issues: issue !== undefined ? [issue] : []};
}

function swapDirectoryIntoPlace(
    tempDir: string,
    outDir: string,
    renameDirectory: (from: string, to: string) => void,
    removeDirectory: (dirPath: string) => void,
    removeBestEffort: (dirPath: string) => void,
): ValidationIssue | undefined {
    if (!fs.existsSync(outDir)) {
        try {
            renameDirectory(tempDir, outDir);
        } catch (error) {
            removeBestEffort(tempDir);
            throw error;
        }
        return undefined;
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
                `Failed to publish external deployment artifacts to "${outDir}", and failed to restore the previous directory afterward: ` +
                    `${publishError instanceof Error ? publishError.message : String(publishError)}; restore failure: ` +
                    `${restoreError instanceof Error ? restoreError.message : String(restoreError)}. The previous directory's contents are ` +
                    `still intact at "${stalePath}" — rename it back to "${outDir}" by hand.`,
            );
        }
        removeBestEffort(tempDir);
        throw publishError;
    }

    try {
        removeDirectory(stalePath);
        return undefined;
    } catch (error) {
        return {
            code: "external-deployment-stale-output-cleanup-failed",
            severity: "warning",
            message:
                `Delivery to "${outDir}" succeeded, but the previous directory's stale backup at "${stalePath}" could not be removed: ` +
                `${error instanceof Error ? error.message : String(error)}. Remove it manually.`,
            details: {stalePath},
        };
    }
}
