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
    readonly releaseAt: (directory: string) => void;
};

// A directory rename has no compare-and-swap form. Checking a marker before
// rename is therefore insufficient: another writer can replace the path
// between that check and rename. We reserve from the start of publication and
// verify the exact reserved directory only after it has been atomically moved
// aside. A failed verification is restored before the temp can be published.
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
        reservation.releaseAt(options.outDir);
        throw error;
    }

    const stalePath = `${options.outDir}.stale-${crypto.randomBytes(6).toString("hex")}`;
    try {
        // This validates the baseline captured before the caller's own work.
        // An initially empty directory that acquired a caller file must not be
        // adopted merely because it is still the same inode.
        reservation.verifyDirectory(options.outDir);
        renameDirectory(options.outDir, stalePath);
    } catch (error) {
        removeBestEffort(tempDir);
        // If a claimant appeared after the reservation check, it wins.  Only
        // restore our old directory into a pathname which is still absent.
        if (fs.existsSync(stalePath) && !fs.existsSync(options.outDir)) {
            try {
                renameDirectory(stalePath, options.outDir);
            } catch {
                // The original ownership failure is more useful to callers.
            }
        }
        reservation.releaseAt(fs.existsSync(options.outDir) ? options.outDir : stalePath);
        throw error;
    }

    try {
        // This is deliberately after rename. A late claimant is in stalePath
        // and is restored intact instead of being overwritten.
        reservation.verifyDirectory(stalePath);
    } catch (error) {
        try {
            renameDirectory(stalePath, options.outDir);
        } finally {
            removeBestEffort(tempDir);
        }
        reservation.releaseAt(options.outDir);
        throw error;
    }

    // Remove only our marker, now from the private stale directory. The old
    // output remains available until the new directory is live.
    reservation.releaseAt(stalePath);
    try {
        // POSIX rename replaces an empty directory.  Check before the rename
        // rather than treating a failed rename as the ownership protocol.
        if (fs.existsSync(options.outDir)) {
            throw claimed(`Destination "${options.outDir}" was claimed during publication commit.`);
        }
        renameDirectory(tempDir, options.outDir);
    } catch (publishError) {
        // Never overwrite a destination which appeared in the commit gap.
        if (fs.existsSync(options.outDir)) {
            removeBestEffort(tempDir);
            // stalePath was proven invocation-owned before commit.  Do not
            // strand it after a claimant wins the final gap.
            removeBestEffort(stalePath);
            throw publishError;
        }
        try {
            renameDirectory(stalePath, options.outDir);
        } catch (restoreError) {
            removeBestEffort(tempDir);
            throw new Error(
                `Failed to publish "${options.outDir}", and failed to restore the previous directory afterward: ` +
                `${publishError instanceof Error ? publishError.message : String(publishError)}; restore failure: ` +
                `${restoreError instanceof Error ? restoreError.message : String(restoreError)}. The previous directory's contents are still intact at "${stalePath}".`,
            );
        }
        removeBestEffort(tempDir);
        throw publishError;
    }

    try {
        removeDirectory(stalePath);
        return {};
    } catch (error) {
        return {cleanupWarning: `The publish to "${options.outDir}" succeeded, but the previous directory's stale backup at "${stalePath}" could not be removed: ${error instanceof Error ? error.message : String(error)}. Remove it manually.`};
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

    return {
        verifyDirectory: (directory) => {
            try {
                if (fs.readFileSync(path.join(directory, markerName), "utf-8") !== markerName || !sameSnapshot(snapshot, snapshotDirectory(directory))) {
                    throw new Error("reservation marker or reserved directory contents changed");
                }
            } catch (error) {
                throw claimed(`Destination "${outDir}" was claimed while publication was being prepared: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        releaseAt: (directory) => {
            // The marker is the only path owned by this invocation. Never
            // recursively clean a destination: it may now belong to another actor.
            try {
                fs.rmSync(path.join(directory, markerName), {force: true});
            } catch {
                // best effort.
            }
            if (createdDirectory && directory === outDir) {
                try {
                    fs.rmdirSync(directory);
                } catch {
                    // it acquired contents.
                }
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
