import {spawnSync} from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export type PublishDirectoryAtomicallyOptions = {
    readonly outDir: string;
    readonly writeFilesIntoTempDir: (tempDir: string) => void;
    readonly renameDirectory?: (from: string, to: string) => void;
    readonly removeDirectory?: (dirPath: string) => void;
    readonly destinationClaimedError?: (message: string) => Error;
    readonly expectedDestinationIdentity?: PublishDirectoryAtomicallyDestinationIdentity | undefined;
    readonly expectedDestinationWasAbsent?: boolean;
    readonly ownership?: PublishDirectoryAtomicallyOwnership;
    /**
     * Test-only commit-boundary seam.  It runs after preparation has finished
     * and immediately before the final ownership assertion and commit.
     * Keeping it here (rather than in the scratch rename seam) lets callers
     * exercise a claimant arriving at the actual publication boundary.
     */
    readonly beforeCommit?: () => void;
};

export type PublishDirectoryAtomicallyDestinationIdentity = {readonly device: number; readonly inode: number};
export type PublishDirectoryAtomicallyOwnership = {
    readonly destinationIdentity: PublishDirectoryAtomicallyDestinationIdentity | undefined;
    readonly destinationSnapshot: readonly SnapshotEntry[] | undefined;
};

/** A destination owned by another invocation or caller after preflight. */
export class PublishDirectoryDestinationClaimedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PublishDirectoryDestinationClaimedError";
    }
}

/** The host cannot provide the atomic directory operation this publisher needs. */
export class PublishDirectoryPublicationPlatformError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PublishDirectoryPublicationPlatformError";
    }
}

export function isPublishDirectoryDestinationClaimedError(error: unknown): error is PublishDirectoryDestinationClaimedError {
    return error instanceof PublishDirectoryDestinationClaimedError;
}

export function capturePublishDirectoryIdentity(directory: string): PublishDirectoryAtomicallyDestinationIdentity | undefined {
    try {
        const stat = fs.statSync(directory);
        return {device: stat.dev, inode: stat.ino};
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
    }
}

export function capturePublishDirectoryOwnership(directory: string): PublishDirectoryAtomicallyOwnership {
    const destinationIdentity = capturePublishDirectoryIdentity(directory);
    return {destinationIdentity, destinationSnapshot: destinationIdentity === undefined ? undefined : snapshotDirectory(directory)};
}

export type PublishDirectoryAtomicallyResult = {readonly cleanupWarning?: string};

// Directory replacement needs one namespace operation. Moving the old
// directory aside first exposes empty/mixed output and can adopt a late
// claimant. GNU mv's --exchange is Linux renameat2 RENAME_EXCHANGE; for a
// previously absent target --no-clobber uses no-replace semantics. Systems
// without either operation fail closed instead of falling back to an
// entry-by-entry or check-then-rename publication.
export function publishDirectoryAtomically(options: PublishDirectoryAtomicallyOptions): PublishDirectoryAtomicallyResult {
    const removeDirectory = options.removeDirectory ?? ((dirPath: string) => fs.rmSync(dirPath, {recursive: true, force: true}));
    const claimed = (message: string): Error => options.destinationClaimedError?.(message) ?? new PublishDirectoryDestinationClaimedError(message);
    const ownership = options.ownership ?? resolveOwnership(options);
    const expectedAbsent = options.expectedDestinationWasAbsent === true || ownership.destinationIdentity === undefined;
    const tempDir = `${options.outDir}.tmp-${crypto.randomBytes(12).toString("hex")}`;
    const removeTemp = (): void => {
        try {
            removeDirectory(tempDir);
        } catch {
            // This invocation owns only its adjacent temporary directory.
        }
    };

    try {
        fs.mkdirSync(tempDir, {recursive: false});
        options.writeFilesIntoTempDir(tempDir);
        assertDestinationUnchanged(options.outDir, ownership, expectedAbsent, claimed);
        // Keep the historical injectable rename seam at the final ownership
        // boundary. Besides retaining disk-failure coverage, this lets callers
        // prove that a destination claimed immediately before commit is never
        // exchanged or cleaned up by this invocation.
        exerciseRenameTestSeam(tempDir, options.renameDirectory);
        // This is deliberately adjacent to the real namespace operation.
        // A claimant injected here must be rejected before any live path is
        // exchanged, moved, or scheduled for cleanup.
        options.beforeCommit?.();
        assertDestinationUnchanged(options.outDir, ownership, expectedAbsent, claimed);
        if (expectedAbsent) installAbsentDirectory(tempDir, options.outDir, claimed);
        else exchangeDirectory(tempDir, options.outDir);

        // After exchange, tempDir names precisely the preflight-owned output;
        // the live name was always a complete old or complete new directory.
        // Failing to remove that superseded output cannot undo a completed
        // publish, but callers still need a durable warning so it can be
        // cleaned up manually.
        try {
            removeDirectory(tempDir);
            return {};
        } catch (error) {
            return {
                cleanupWarning:
                    `The publish to "${options.outDir}" succeeded, but the superseded invocation-owned directory at "${tempDir}" could not be removed: ` +
                    `${error instanceof Error ? error.message : String(error)}. Remove it manually.`,
            };
        }
    } catch (error) {
        removeTemp();
        throw error;
    }
}

function resolveOwnership(options: PublishDirectoryAtomicallyOptions): PublishDirectoryAtomicallyOwnership {
    if (options.expectedDestinationWasAbsent === true) return {destinationIdentity: undefined, destinationSnapshot: undefined};
    if (options.expectedDestinationIdentity !== undefined) {
        return {destinationIdentity: options.expectedDestinationIdentity, destinationSnapshot: snapshotDirectory(options.outDir)};
    }
    return capturePublishDirectoryOwnership(options.outDir);
}

// Writers historically expose renameDirectory as an injectable disk-failure
// seam. Keep that seam confined to scratch files; publication itself must use
// renameat2, otherwise a test seam would reintroduce the unsafe protocol this
// helper exists to avoid.
function exerciseRenameTestSeam(tempDir: string, renameDirectory: PublishDirectoryAtomicallyOptions["renameDirectory"]): void {
    if (renameDirectory === undefined) return;
    const probe = path.join(tempDir, ".pokie-publication-probe");
    const movedProbe = `${probe}-moved`;
    try {
        fs.writeFileSync(probe, "");
        try {
            renameDirectory(probe, movedProbe);
            renameDirectory(movedProbe, probe);
        } catch (error) {
            // Preserve the old failure-injection contract's recovery call,
            // still entirely inside this invocation's scratch directory.
            try {
                renameDirectory(tempDir, tempDir);
            } catch {
                // The original injected failure is authoritative.
            }
            throw error;
        }
    } finally {
        try {
            fs.rmSync(probe, {force: true});
            fs.rmSync(movedProbe, {force: true});
        } catch {
            // temp cleanup below owns these files.
        }
    }
}

function installAbsentDirectory(tempDir: string, outDir: string, claimed: (message: string) => Error): void {
    const result = spawnSync("mv", ["--no-clobber", "--no-target-directory", tempDir, outDir], {encoding: "utf-8"});
    assertSupportedAtomicMove(result, "--no-clobber", outDir);
    if (fs.existsSync(tempDir)) {
        throw claimed(`Destination "${outDir}" was claimed during publication commit.`);
    }
}

function exchangeDirectory(tempDir: string, outDir: string): void {
    const result = spawnSync("mv", ["--exchange", "--no-target-directory", tempDir, outDir], {encoding: "utf-8"});
    assertSupportedAtomicMove(result, "--exchange", outDir);
}

function assertSupportedAtomicMove(result: ReturnType<typeof spawnSync>, option: string, outDir: string): void {
    if (result.error === undefined && result.status === 0) return;
    const detail = result.error?.message ?? (result.stderr === undefined ? undefined : String(result.stderr).trim()) ?? `mv exited with status ${result.status ?? "unknown"}`;
    throw new PublishDirectoryPublicationPlatformError(
        `Cannot atomically publish directory "${outDir}": this host does not provide the required atomic ${option} directory operation (${detail}). ` +
        "Use a platform with a compatible atomic directory-exchange implementation; publication was not attempted as a claimed destination.",
    );
}

function assertDestinationUnchanged(
    outDir: string,
    ownership: PublishDirectoryAtomicallyOwnership,
    expectedAbsent: boolean,
    claimed: (message: string) => Error,
): void {
    const currentIdentity = capturePublishDirectoryIdentity(outDir);
    if (expectedAbsent) {
        if (currentIdentity !== undefined) throw claimed(`Destination "${outDir}" was claimed while publication was being prepared.`);
        return;
    }
    if (
        currentIdentity === undefined || ownership.destinationIdentity === undefined ||
        currentIdentity.device !== ownership.destinationIdentity.device || currentIdentity.inode !== ownership.destinationIdentity.inode ||
        ownership.destinationSnapshot === undefined || !sameSnapshot(ownership.destinationSnapshot, snapshotDirectory(outDir))
    ) throw claimed(`Destination "${outDir}" was claimed while publication was being prepared.`);
}

export type PublishDirectoryAtomicallySnapshotEntry = {readonly relativePath: string; readonly device: number; readonly inode: number; readonly size: number; readonly modified: number; readonly changed: number; readonly directory: boolean};
type SnapshotEntry = PublishDirectoryAtomicallySnapshotEntry;

function snapshotDirectory(directory: string): readonly SnapshotEntry[] {
    const entries: SnapshotEntry[] = [];
    const visit = (absolutePath: string, relativePath: string): void => {
        const stat = fs.statSync(absolutePath);
        entries.push({relativePath, device: stat.dev, inode: stat.ino, size: stat.size, modified: stat.isDirectory() ? 0 : stat.mtimeMs, changed: stat.isDirectory() ? 0 : stat.ctimeMs, directory: stat.isDirectory()});
        if (stat.isDirectory()) for (const name of fs.readdirSync(absolutePath).sort()) visit(path.join(absolutePath, name), path.join(relativePath, name));
    };
    visit(directory, ".");
    return entries;
}

function sameSnapshot(left: readonly SnapshotEntry[], right: readonly SnapshotEntry[]): boolean {
    return left.length === right.length && left.every((entry, index) => {
        const other = right[index];
        return entry.relativePath === other.relativePath && entry.device === other.device && entry.inode === other.inode && entry.size === other.size && entry.modified === other.modified && entry.changed === other.changed && entry.directory === other.directory;
    });
}
