import crypto from "crypto";
import fs from "fs";
import path from "path";

export type PublishDirectoryAtomicallyOptions = {
    readonly outDir: string;
    readonly writeFilesIntoTempDir: (tempDir: string) => void;
    readonly renameDirectory?: (from: string, to: string) => void;
    readonly removeDirectory?: (dirPath: string) => void;
    readonly destinationClaimedError?: (message: string) => Error;
    // Callers with an asynchronous preparation phase capture this before
    // staging so an output claimed during that phase is not accepted merely
    // because it happens to exist when reservation starts.
    readonly expectedDestinationIdentity?: PublishDirectoryAtomicallyDestinationIdentity | undefined;
    readonly expectedDestinationWasAbsent?: boolean;
    // Full baseline captured before an async publisher starts preparing data.
    // Identity-only checks cannot see a late write into an existing directory.
    readonly ownership?: PublishDirectoryAtomicallyOwnership;
};

export type PublishDirectoryAtomicallyDestinationIdentity = {readonly device: number; readonly inode: number};

export type PublishDirectoryAtomicallyOwnership = {
    readonly destinationIdentity: PublishDirectoryAtomicallyDestinationIdentity | undefined;
    readonly destinationSnapshot: readonly SnapshotEntry[] | undefined;
};

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
    return {
        destinationIdentity,
        destinationSnapshot: destinationIdentity === undefined ? undefined : snapshotDirectory(directory),
    };
}

export type PublishDirectoryAtomicallyResult = {readonly cleanupWarning?: string};

type DirectoryReservation = {
    readonly verifyDirectory: (directory: string) => void;
    readonly verifyCommittedDirectory: (directory: string) => void;
    readonly verifyDirectoryForFd: () => void;
    readonly release: () => void;
    readonly directoryFd: number;
    readonly directoryIdentity: PublishDirectoryAtomicallyDestinationIdentity;
    readonly createdDirectory: boolean;
    readonly markerName: string;
};

// A directory rename has no compare-and-swap form. In particular, renaming a
// reserved directory aside makes a claimant which wins the check/rename gap
// part of our transaction. Do not ever rename the destination itself. Instead
// keep an fd for the reserved inode and do all commit work through that fd.
// On Linux /proc/self/fd keeps referring to that inode even if another process
// unlinks and recreates the destination pathname. Thus a late pathname owner
// is never moved, replaced, or cleaned up by this invocation.
export function publishDirectoryAtomically(options: PublishDirectoryAtomicallyOptions): PublishDirectoryAtomicallyResult {
    const renameDirectory = options.renameDirectory ?? ((from: string, to: string) => fs.renameSync(from, to));
    const removeDirectory = options.removeDirectory ?? ((dirPath: string) => fs.rmSync(dirPath, {recursive: true, force: true}));
    const claimed = (message: string): Error => options.destinationClaimedError?.(message) ?? new Error(message);
    const removeBestEffort = (directory: string): void => {
        try {
            removeDirectory(directory);
        } catch {
            // scratch cleanup only.
        }
    };

    const reservation = reserveDirectory(
        options.outDir,
        claimed,
        options.ownership?.destinationIdentity ?? options.expectedDestinationIdentity,
        options.ownership?.destinationSnapshot,
        options.expectedDestinationWasAbsent === true || (options.ownership !== undefined && options.ownership.destinationIdentity === undefined),
    );
    const tempDir = `${options.outDir}.tmp-${crypto.randomBytes(6).toString("hex")}`;
    try {
        fs.mkdirSync(tempDir, {recursive: true});
        options.writeFilesIntoTempDir(tempDir);
    } catch (error) {
        removeBestEffort(tempDir);
        reservation.release();
        throw error;
    }

    try {
        reservation.verifyDirectory(options.outDir);
        commitIntoReservedDirectory(tempDir, reservation, renameDirectory, claimed);
        reservation.verifyCommittedDirectory(options.outDir);
        removeBestEffort(tempDir);
        reservation.release();
        return {};
    } catch (error) {
        removeBestEffort(tempDir);
        // release only ever removes our marker from the inode acquired by this
        // invocation. If the pathname now names somebody else's directory it
        // is not traversed or modified.
        let reportedError = error;
        try {
            reservation.verifyCommittedDirectory(options.outDir);
        } catch (ownershipError) {
            // A syscall through the held descriptor can legitimately fail
            // ENOENT after the pathname owner removed the old inode. Surface
            // the ownership result, not that implementation detail.
            reportedError = ownershipError;
        }
        reservation.release();
        throw reportedError;
    }
}

function commitIntoReservedDirectory(
    tempDir: string,
    reservation: DirectoryReservation,
    renameDirectory: (from: string, to: string) => void,
    claimed: (message: string) => Error,
): void {
    const fdDirectory = `/proc/self/fd/${reservation.directoryFd}`;
    if (!fs.existsSync(fdDirectory)) {
        throw claimed(`Destination "${tempDir}" reservation was lost before publication commit.`);
    }
    const backupName = `.pokie-publication-backup-${crypto.randomBytes(12).toString("hex")}`;
    const backupDir = path.join(fdDirectory, backupName);
    const installed: string[] = [];
    const moved: string[] = [];
    try {
        fs.mkdirSync(backupDir);
        // The publishers all emit a flat directory. Refuse a nested payload
        // rather than recursively walking an untrusted destination after the
        // ownership decision.
        const payloadEntries = fs.readdirSync(tempDir);
        if (payloadEntries.some((entry) => !fs.lstatSync(path.join(tempDir, entry)).isFile())) {
            throw new Error(`Atomic publication payload for "${tempDir}" must contain files only.`);
        }
        reservation.verifyDirectoryForFd();
        for (const entry of fs.readdirSync(fdDirectory)) {
            if (entry === reservation.markerName || entry === backupName) continue;
            reservation.verifyDirectoryForFd();
            renameDirectory(path.join(fdDirectory, entry), path.join(backupDir, entry));
            moved.push(entry);
        }
        for (const entry of payloadEntries) {
            reservation.verifyDirectoryForFd();
            renameDirectory(path.join(tempDir, entry), path.join(fdDirectory, entry));
            installed.push(entry);
        }
        reservation.verifyDirectoryForFd();
        fs.rmSync(backupDir, {recursive: true, force: true});
    } catch (error) {
        // All paths below are reached through the held descriptor. They cannot
        // resolve to a late replacement at outDir.
        for (const entry of installed.reverse()) {
            try {
                fs.rmSync(path.join(fdDirectory, entry), {force: true});
            } catch {
                // owned scratch
            }
        }
        for (const entry of moved.reverse()) {
            const original = path.join(fdDirectory, entry);
            const saved = path.join(backupDir, entry);
            try {
                if (!fs.existsSync(original) && fs.existsSync(saved)) renameDirectory(saved, original);
            } catch {
                // a claimant at the original name wins
            }
        }
        try {
            fs.rmSync(backupDir, {recursive: true, force: true});
        } catch {
            // owned scratch
        }
        throw error;
    }
}

function reserveDirectory(
    outDir: string,
    claimed: (message: string) => Error,
    expectedIdentity: PublishDirectoryAtomicallyDestinationIdentity | undefined,
    expectedSnapshot: readonly SnapshotEntry[] | undefined,
    expectedAbsent: boolean,
): DirectoryReservation {
    const markerName = `.pokie-publication-reservation-${crypto.randomBytes(12).toString("hex")}`;
    const markerPath = path.join(outDir, markerName);
    let createdDirectory = false;
    try {
        fs.mkdirSync(outDir);
        createdDirectory = true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const currentIdentity = capturePublishDirectoryIdentity(outDir);
    if (currentIdentity === undefined || !fs.statSync(outDir).isDirectory()) throw claimed(`Destination "${outDir}" is not a directory and cannot be reserved for publication.`);
    if (expectedIdentity !== undefined && (expectedIdentity.device !== currentIdentity.device || expectedIdentity.inode !== currentIdentity.inode)) {
        if (createdDirectory) {
            try {
                fs.rmdirSync(outDir);
            } catch {
                // late owner keeps it.
            }
        }
        throw claimed(`Destination "${outDir}" was claimed while publication was being prepared.`);
    }
    if (expectedSnapshot !== undefined && !sameSnapshot(expectedSnapshot, snapshotDirectory(outDir))) {
        if (createdDirectory) {
            try {
                fs.rmdirSync(outDir);
            } catch {
                // late owner keeps it.
            }
        }
        throw claimed(`Destination "${outDir}" was claimed while publication was being prepared.`);
    }
    if (expectedAbsent && !createdDirectory) {
        // An absent destination at preflight was claimed by another actor.
        throw claimed(`Destination "${outDir}" was claimed while publication was being prepared.`);
    }
    try {
        fs.writeFileSync(markerPath, markerName, {encoding: "utf-8", flag: "wx"});
    } catch (error) {
        if (createdDirectory) {
            try {
                fs.rmdirSync(outDir);
            } catch {
                // late owner keeps it.
            }
        }
        throw claimed(`Destination "${outDir}" was claimed while publication was being prepared: ${error instanceof Error ? error.message : String(error)}`);
    }
    const snapshot = snapshotDirectory(outDir);
    const directoryFd = fs.openSync(outDir, "r");
    const reservedStat = fs.fstatSync(directoryFd);
    const directoryIdentity = {device: reservedStat.dev, inode: reservedStat.ino};

    const verifyDirectory = (directory: string): void => {
        try {
            const identity = capturePublishDirectoryIdentity(directory);
            if (
                identity === undefined ||
                identity.device !== directoryIdentity.device ||
                identity.inode !== directoryIdentity.inode ||
                fs.readFileSync(path.join(directory, markerName), "utf-8") !== markerName ||
                !sameSnapshot(snapshot, snapshotDirectory(directory))
            ) {
                throw new Error("reservation marker or reserved directory contents changed");
            }
        } catch (error) {
            throw claimed(`Destination "${outDir}" was claimed while publication was being prepared: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const fdDirectory = `/proc/self/fd/${directoryFd}`;
    const verifyDirectoryForFd = (): void => {
        try {
            const stat = fs.fstatSync(directoryFd);
            if (
                stat.dev !== directoryIdentity.device || stat.ino !== directoryIdentity.inode ||
                fs.readFileSync(path.join(fdDirectory, markerName), "utf-8") !== markerName
            ) {
                throw new Error("reservation marker or reserved directory contents changed");
            }
        } catch (error) {
            throw claimed(`Destination "${outDir}" was claimed while publication was being prepared: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    return {
        verifyDirectory,
        verifyCommittedDirectory: (directory: string): void => {
            try {
                const identity = capturePublishDirectoryIdentity(directory);
                if (identity === undefined || identity.device !== directoryIdentity.device || identity.inode !== directoryIdentity.inode || fs.readFileSync(path.join(directory, markerName), "utf-8") !== markerName) {
                    throw new Error("reservation marker or reserved directory changed");
                }
            } catch (error) {
                throw claimed(`Destination "${outDir}" was claimed while publication was being prepared; destination claimed during publication commit: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        verifyDirectoryForFd,
        directoryFd,
        directoryIdentity,
        createdDirectory,
        markerName,
        release: () => {
            // The marker is the only path owned by this invocation. Never
            // recursively clean a destination pathname: it may now belong to
            // another actor. The fd remains bound to the reserved inode.
            try {
                fs.rmSync(path.join(fdDirectory, markerName), {force: true});
            } catch {
                // best effort.
            }
            if (createdDirectory) {
                try {
                    const current = capturePublishDirectoryIdentity(outDir);
                    if (current !== undefined && current.device === directoryIdentity.device && current.inode === directoryIdentity.inode) {
                        fs.rmdirSync(outDir);
                    }
                } catch {
                    // it acquired contents.
                }
            }
            try {
                fs.closeSync(directoryFd);
            } catch {
                // best effort
            }
        },
    };
}


type SnapshotEntry = {readonly relativePath: string; readonly device: number; readonly inode: number; readonly size: number; readonly modified: number; readonly changed: number; readonly directory: boolean};

function snapshotDirectory(directory: string): readonly SnapshotEntry[] {
    const entries: SnapshotEntry[] = [];
    const visit = (absolutePath: string, relativePath: string): void => {
        const stat = fs.statSync(absolutePath);
        // Renaming a directory legitimately changes the directory inode's
        // ctime. Its children still make additions/removals observable, so
        // only retain file timestamps in the ownership fingerprint.
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
