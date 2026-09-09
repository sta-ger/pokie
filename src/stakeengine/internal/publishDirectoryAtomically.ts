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
    /** Test seam at the last observation before the publication rename. */
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

export function isPublishDirectoryDestinationClaimedError(error: unknown): error is PublishDirectoryDestinationClaimedError {
    return error instanceof PublishDirectoryDestinationClaimedError;
}

// lstat is deliberate: a symlink is a claimant in its own right. stat would
// follow it and would incorrectly treat a dangling link as an absent name.
export function capturePublishDirectoryIdentity(directory: string): PublishDirectoryAtomicallyDestinationIdentity | undefined {
    try {
        const stat = fs.lstatSync(directory);
        return {device: stat.dev, inode: stat.ino};
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
    const current = capturePublishDirectoryIdentity(publication.outDir);
    if (current === undefined || current.device !== publication.identity.device || current.inode !== publication.identity.inode) return false;
    fs.rmSync(publication.outDir, {recursive: true, force: true});
    return true;
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
    const staleDir = path.join(path.dirname(outDir), `.${path.basename(outDir)}.stale-${nonce}`);
    let movedPrevious = false;

    const removeScratch = (): void => {
        try {
            removeDirectory(tempDir);
        } catch {
            // This invocation owns tempDir exclusively.
        }
        try {
            removeDirectory(staleDir);
        } catch {
            // staleDir is private and is never used for a caller path.
        }
    };

    try {
        fs.mkdirSync(tempDir, {recursive: false});
        options.writeFilesIntoTempDir(tempDir);
        options.beforeCommit?.();
        assertDestinationUnchanged(outDir, ownership, expectedAbsent, claimed);

        if (!expectedAbsent) {
            // Keep the injectable legacy seam outside the prepared payload so
            // disk-failure tests retain their recovery behaviour.
            (options.renameDirectory ?? fs.renameSync)(outDir, staleDir);
            movedPrevious = true;
        }
        try {
            (options.renameDirectory ?? fs.renameSync)(tempDir, outDir);
        } catch (error) {
            if (movedPrevious) restorePreviousDirectory(staleDir, outDir, options.renameDirectory);
            throw error;
        }

        const installedIdentity = capturePublishDirectoryIdentity(outDir);
        // A successful rename must leave our real directory at the public
        // pathname.  Treat anything else as a claimed destination rather
        // than handing an unverified path to lifecycle cleanup.
        if (installedIdentity === undefined) throw claimed(`Destination "${outDir}" disappeared while publication was being committed.`);
        const publication = {outDir, identity: installedIdentity};

        if (!movedPrevious) return withPublishedDirectoryOwnership({}, publication);
        try {
            removeDirectory(staleDir);
            return withPublishedDirectoryOwnership({}, publication);
        } catch (error) {
            return withPublishedDirectoryOwnership({
                cleanupWarning:
                    `The publish to "${options.outDir}" succeeded, but the superseded invocation-owned directory at "${staleDir}" could not be removed: ` +
                    `${error instanceof Error ? error.message : String(error)}. Remove it manually.`,
            }, publication);
        }
    } catch (error) {
        // A failure after the first rename restores only our private stale
        // path, and only when the public name is still absent.
        if (movedPrevious) restorePreviousDirectory(staleDir, outDir, options.renameDirectory);
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

function restorePreviousDirectory(
    staleDir: string,
    outDir: string,
    renameDirectory: PublishDirectoryAtomicallyOptions["renameDirectory"],
): void {
    try {
        // Never overwrite an entry that appeared after our failed commit.
        if (capturePublishDirectoryIdentity(outDir) === undefined) (renameDirectory ?? fs.renameSync)(staleDir, outDir);
    } catch {
        // The original publish failure remains authoritative.
    }
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
