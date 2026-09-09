import crypto from "crypto";
import {spawnSync} from "child_process";
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
    /** Test seam at the last observation before the publication rename. */
    readonly beforeCommit?: () => void;
    /** Test seam after the namespace commit, before the old payload is removed. */
    readonly afterCommit?: () => void;
};

// An inode alone is not an ownership token: a fast remove/recreate can reuse
// it on filesystems with aggressive inode recycling. Birth time remains
// stable across the atomic rename, but distinguishes that replacement.
export type PublishDirectoryAtomicallyDestinationIdentity = {readonly device: number; readonly inode: number; readonly birthTime: number};
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

export function isPublishDirectoryDestinationClaimedError(error: unknown): error is PublishDirectoryDestinationClaimedError {
    return error instanceof PublishDirectoryDestinationClaimedError;
}

// lstat is deliberate: a symlink is a claimant in its own right. stat would
// follow it and would incorrectly treat a dangling link as an absent name.
export function capturePublishDirectoryIdentity(directory: string): PublishDirectoryAtomicallyDestinationIdentity | undefined {
    try {
        const stat = fs.lstatSync(directory);
        return {device: stat.dev, inode: stat.ino, birthTime: stat.birthtimeMs};
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
    }
}

export function capturePublishDirectoryOwnership(directory: string): PublishDirectoryAtomicallyOwnership {
    const destinationIdentity = capturePublishDirectoryIdentity(directory);
    return {
        destinationIdentity,
        // Only a physical directory is a replaceable historic publication.
        // Other filesystem entries remain an ownership conflict at commit.
        destinationSnapshot: destinationIdentity !== undefined && fs.lstatSync(directory).isDirectory() ? snapshotDirectory(directory) : undefined,
    };
}

/**
 * The identity of the directory installed by one publication.  This is an
 * ownership token, not merely an output path: lifecycle callers must retain
 * it and use removePublishedDirectoryIfOwned() rather than recursively
 * removing the public pathname after a later cancellation or registration
 * failure.
 */
export type PublishedDirectoryOwnership = {
    readonly outDir: string;
    readonly identity: PublishDirectoryAtomicallyDestinationIdentity;
};

export type PublishDirectoryAtomicallyResult = {
    readonly publication: PublishedDirectoryOwnership;
    readonly cleanupWarning?: string;
};

/**
 * Removes a completed publication only while the public pathname still names
 * the exact directory this invocation installed.  A false result means a
 * later claimant replaced or removed the pathname and must be left alone.
 *
 * The final lstat deliberately happens immediately before rm.  Node has no
 * descriptor-relative recursive remove primitive; retaining the identity
 * test here nevertheless makes every normal post-publication rollback
 * explicit and fail-closed instead of blindly deleting a pathname.
 */
export function removePublishedDirectoryIfOwned(publication: PublishedDirectoryOwnership): boolean {
    const outDir = path.resolve(publication.outDir);
    const nonce = crypto.randomBytes(12).toString("hex");
    const privateDir = path.join(path.dirname(outDir), `.${path.basename(outDir)}.rollback-${nonce}`);
    fs.mkdirSync(privateDir, {recursive: false});
    const privateIdentity = capturePublishDirectoryIdentity(privateDir)!;
    try {
        if (!sameIdentity(capturePublishDirectoryIdentity(outDir), publication.identity)) return false;
        exchangeDirectories(outDir, privateDir);

        // The exchange is a single namespace operation, but an unrelated
        // writer is still free to race the pathname just before it.  Never
        // remove what we did not install: put a late claimant back and leave
        // its public name intact.
        if (!sameIdentity(capturePublishDirectoryIdentity(privateDir), publication.identity)) {
            if (sameIdentity(capturePublishDirectoryIdentity(outDir), privateIdentity)) {
                exchangeDirectories(outDir, privateDir);
            }
            return false;
        }
        // The live name now denotes the empty tombstone we created above.
        // rmdir is intentionally non-recursive: a claimant which appears at
        // this exact point makes the operation fail without deleting any of
        // its content.
        try {
            fs.rmdirSync(outDir);
        } catch {
            fs.rmSync(privateDir, {recursive: true, force: true});
            return false;
        }
        fs.rmSync(privateDir, {recursive: true, force: true});
        return true;
    } finally {
        // This is our initially empty tombstone or the prior publication
        // already removed above.  Do not recursively remove it if an
        // unexpected identity appeared while recovery was in progress.
        if (sameIdentity(capturePublishDirectoryIdentity(privateDir), privateIdentity)) {
            fs.rmSync(privateDir, {recursive: true, force: true});
        }
    }
}

/** Attach lifecycle ownership without changing legacy enumerable output. */
export function withPublishedDirectoryOwnership<T extends object>(result: T, publication: PublishedDirectoryOwnership): T & {readonly publication: PublishedDirectoryOwnership} {
    Reflect.defineProperty(result, "publication", {value: publication, enumerable: false, writable: false, configurable: false});
    return result as T & {readonly publication: PublishedDirectoryOwnership};
}

// Publication deliberately leaves a real directory at outDir. Besides being
// the longstanding public artifact shape, this makes ordinary rm -r cleanup
// and all existing planner rollbacks remove the complete invocation payload.
// No live directory is emptied or populated entry-by-entry: the complete
// prepared directory is renamed into the public name only after it is ready.
export function publishDirectoryAtomically(options: PublishDirectoryAtomicallyOptions): PublishDirectoryAtomicallyResult {
    const removeDirectory = options.removeDirectory ?? ((dirPath: string) => fs.rmSync(dirPath, {recursive: true, force: true}));
    const claimed = (message: string): Error => options.destinationClaimedError?.(message) ?? new PublishDirectoryDestinationClaimedError(message);
    const outDir = path.resolve(options.outDir);
    const ownership = options.ownership ?? resolveOwnership(options);
    const expectedAbsent = options.expectedDestinationWasAbsent === true || ownership.destinationIdentity === undefined;
    const nonce = crypto.randomBytes(12).toString("hex");
    const tempDir = path.join(path.dirname(outDir), `.${path.basename(outDir)}.tmp-${nonce}`);
    let tempIdentity: PublishDirectoryAtomicallyDestinationIdentity | undefined;

    const removeScratch = (): void => {
        try {
            removeDirectory(tempDir);
        } catch {
            // This invocation owns tempDir exclusively.
        }
    };

    try {
        fs.mkdirSync(tempDir, {recursive: false});
        options.writeFilesIntoTempDir(tempDir);
        tempIdentity = capturePublishDirectoryIdentity(tempDir);
        if (tempIdentity === undefined) throw new Error(`Publication staging directory "${tempDir}" disappeared before commit.`);
        exerciseRenameTestSeam(tempDir, options.renameDirectory);
        options.beforeCommit?.();
        assertDestinationUnchanged(outDir, ownership, expectedAbsent, claimed);

        if (expectedAbsent) installAbsentDirectory(tempDir, outDir, claimed);
        else exchangeDirectories(tempDir, outDir);

        const installedIdentity = capturePublishDirectoryIdentity(outDir);
        if (installedIdentity === undefined) {
            restoreDisplacedDestination(tempDir, outDir, tempIdentity);
            throw claimed(`Destination "${outDir}" disappeared during publication commit.`);
        }
        if (!sameIdentity(installedIdentity, tempIdentity)) {
            restoreDisplacedDestination(tempDir, outDir, tempIdentity);
            throw claimed(`Destination "${outDir}" was claimed during publication commit.`);
        }
        if (!expectedAbsent && !isExpectedDisplacedDestination(tempDir, ownership)) {
            restoreDisplacedDestination(tempDir, outDir, tempIdentity);
            throw claimed(`Destination "${outDir}" was claimed during publication commit.`);
        }
        const publication: PublishedDirectoryOwnership = {outDir, identity: installedIdentity};
        options.afterCommit?.();
        if (!sameIdentity(capturePublishDirectoryIdentity(outDir), publication.identity)) {
            throw claimed(`Destination "${outDir}" was claimed immediately after publication.`);
        }

        if (expectedAbsent) return withPublishedDirectoryOwnership({}, publication);
        try {
            removeDirectory(tempDir);
            return withPublishedDirectoryOwnership({}, publication);
        } catch (error) {
            return withPublishedDirectoryOwnership({
                cleanupWarning:
                    `The publish to "${options.outDir}" succeeded, but the superseded invocation-owned directory at "${tempDir}" could not be removed: ` +
                    `${error instanceof Error ? error.message : String(error)}. Remove it manually.`,
            }, publication);
        }
    } catch (error) {
        removeScratch();
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

function installAbsentDirectory(tempDir: string, outDir: string, claimed: (message: string) => Error): void {
    const result = spawnSync("mv", ["--no-clobber", "--no-target-directory", tempDir, outDir], {encoding: "utf-8"});
    assertAtomicMoveSupported(result, "--no-clobber", outDir);
    if (capturePublishDirectoryIdentity(tempDir) !== undefined) {
        throw claimed(`Destination "${outDir}" was claimed during publication commit.`);
    }
}

// Public writers historically expose renameDirectory as a failure-injection
// seam. Keep it inside private staging: using it for the live namespace would
// recreate the check-then-rename protocol this helper avoids.
function exerciseRenameTestSeam(tempDir: string, renameDirectory: PublishDirectoryAtomicallyOptions["renameDirectory"]): void {
    if (renameDirectory === undefined) return;
    const probe = path.join(tempDir, ".pokie-publication-probe");
    const movedProbe = `${probe}-moved`;
    try {
        fs.writeFileSync(probe, "");
        renameDirectory(probe, movedProbe);
        renameDirectory(movedProbe, probe);
    } finally {
        fs.rmSync(probe, {force: true});
        fs.rmSync(movedProbe, {force: true});
    }
}

function exchangeDirectories(left: string, right: string): void {
    const result = spawnSync("mv", ["--exchange", "--no-target-directory", left, right], {encoding: "utf-8"});
    assertAtomicMoveSupported(result, "--exchange", right);
}

function assertAtomicMoveSupported(result: ReturnType<typeof spawnSync>, operation: string, outDir: string): void {
    if (result.error === undefined && result.status === 0) return;
    const detail = result.error?.message ?? String(result.stderr ?? `mv exited with status ${result.status ?? "unknown"}`).trim();
    throw new Error(`Cannot atomically publish directory "${outDir}": this host does not provide ${operation} directory replacement (${detail}).`);
}

function restoreDisplacedDestination(tempDir: string, outDir: string, installedIdentity: PublishDirectoryAtomicallyDestinationIdentity): void {
    try {
        // Exchange back only while both names still identify the two paths
        // created by this operation.  A later claimant is never moved.
        if (sameIdentity(capturePublishDirectoryIdentity(outDir), installedIdentity)) exchangeDirectories(tempDir, outDir);
    } catch {
        // The ownership failure remains authoritative.  Scratch cleanup below
        // is identity-free only for our random private staging name.
    }
}

function isExpectedDisplacedDestination(tempDir: string, ownership: PublishDirectoryAtomicallyOwnership): boolean {
    return ownership.destinationIdentity !== undefined && ownership.destinationSnapshot !== undefined &&
        sameIdentity(capturePublishDirectoryIdentity(tempDir), ownership.destinationIdentity) &&
        fs.lstatSync(tempDir).isDirectory() && sameSnapshot(ownership.destinationSnapshot, snapshotDirectory(tempDir));
}

function sameIdentity(
    left: PublishDirectoryAtomicallyDestinationIdentity | undefined,
    right: PublishDirectoryAtomicallyDestinationIdentity | undefined,
): boolean {
    return left !== undefined && right !== undefined &&
        left.device === right.device && left.inode === right.inode && left.birthTime === right.birthTime;
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
        !sameIdentity(currentIdentity, ownership.destinationIdentity) ||
        ownership.destinationSnapshot === undefined || !fs.lstatSync(outDir).isDirectory() ||
        !sameSnapshot(ownership.destinationSnapshot, snapshotDirectory(outDir))
    ) throw claimed(`Destination "${outDir}" was claimed while publication was being prepared.`);
}

export type PublishDirectoryAtomicallySnapshotEntry = {readonly relativePath: string; readonly device: number; readonly inode: number; readonly size: number; readonly modified: number; readonly changed: number; readonly directory: boolean};
type SnapshotEntry = PublishDirectoryAtomicallySnapshotEntry;

function snapshotDirectory(directory: string): readonly SnapshotEntry[] {
    const entries: SnapshotEntry[] = [];
    const visit = (absolutePath: string, relativePath: string): void => {
        const stat = fs.lstatSync(absolutePath);
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
