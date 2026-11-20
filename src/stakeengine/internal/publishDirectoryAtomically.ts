import crypto from "crypto";
import {spawnSync} from "child_process";
import fs from "fs";
import path from "path";

export type PublishDirectoryAtomicallyOptions = {
    readonly outDir: string;
    /** New-or-empty workflow: retain a caller-owned empty directory inode and publish manifest last. */
    readonly preserveEmptyDestination?: boolean;
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
    /** Test seam for the host move primitive; production uses the system mv. */
    readonly runMove?: AtomicMoveRunning;
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
    readonly retainEmptyDirectory?: boolean;
    readonly members?: readonly {name: string; identity: PublishDirectoryAtomicallyDestinationIdentity; hash: string}[];
};

export type PublishDirectoryAtomicallyResult = {
    readonly publication: PublishedDirectoryOwnership;
    readonly cleanupWarning?: string;
};

export type AtomicMoveResult = {error?: Error; status?: number | null; stderr?: string | Buffer | null};
export type AtomicMoveRunning = (
    command: string,
    args: readonly string[],
    options: {encoding: "utf-8"},
) => AtomicMoveResult;

// Proves the exact directory move primitive publication will need *before* a caller spends time
// generating/compressing an artifact. The probes live beside the requested destination, so they
// exercise its actual filesystem and the same system `mv`, but never inspect, rename, or create the
// public pathname itself. `expectedDestinationWasAbsent` selects the eventual commit operation:
// no-clobber install for a new destination, exchange for a replacement.
export function preflightAtomicDirectoryPublication(
    outDir: string,
    expectedDestinationWasAbsent: boolean,
    runMove: AtomicMoveRunning = spawnSync,
): void {
    const destination = path.resolve(outDir);
    const parent = path.dirname(destination);
    fs.mkdirSync(parent, {recursive: true});
    const probeRoot = path.join(parent, `.${path.basename(destination)}.atomic-preflight-${crypto.randomBytes(12).toString("hex")}`);
    fs.mkdirSync(probeRoot, {recursive: false});
    try {
        if (expectedDestinationWasAbsent) {
            const source = path.join(probeRoot, "source");
            const target = path.join(probeRoot, "target");
            fs.mkdirSync(source);
            const result = runMove("mv", ["--no-clobber", "--no-target-directory", source, target], {encoding: "utf-8"});
            if (moveSucceeded(result) && capturePublishDirectoryIdentity(source) === undefined && capturePublishDirectoryIdentity(target) !== undefined) {
                return;
            }
            probePortableAbsentInstall(probeRoot, destination);
            return;
        }

        const left = path.join(probeRoot, "left");
        const right = path.join(probeRoot, "right");
        fs.mkdirSync(left);
        fs.mkdirSync(right);
        const leftIdentity = capturePublishDirectoryIdentity(left)!;
        const rightIdentity = capturePublishDirectoryIdentity(right)!;
        const result = runMove("mv", ["--exchange", "--no-target-directory", left, right], {encoding: "utf-8"});
        if (moveSucceeded(result) && sameIdentity(capturePublishDirectoryIdentity(left), rightIdentity) && sameIdentity(capturePublishDirectoryIdentity(right), leftIdentity)) {
            return;
        }
        try {
            exchangeDirectoriesPortable(left, right);
            if (!sameIdentity(capturePublishDirectoryIdentity(left), rightIdentity) || !sameIdentity(capturePublishDirectoryIdentity(right), leftIdentity)) {
                throw new Error("the portable replacement probe did not exchange the two directories");
            }
        } catch (error) {
            throw new Error(`Cannot publish directory "${destination}": this host supports neither mv --exchange nor a same-directory replacement fallback (${errorMessage(error)}).`);
        }
    } finally {
        fs.rmSync(probeRoot, {recursive: true, force: true});
    }
}

function probePortableAbsentInstall(probeRoot: string, destination: string): void {
    const source = path.join(probeRoot, "portable-source");
    const target = path.join(probeRoot, "portable-target");
    fs.mkdirSync(source);
    try {
        fs.renameSync(source, target);
    } catch (error) {
        throw new Error(`Cannot publish directory "${destination}": this host supports neither mv --no-clobber nor a same-directory directory rename (${errorMessage(error)}).`);
    }
    if (capturePublishDirectoryIdentity(source) !== undefined || capturePublishDirectoryIdentity(target) === undefined) {
        throw new Error(`Cannot publish directory "${destination}": the portable same-directory rename did not install the probe directory.`);
    }
}

function moveSucceeded(result: AtomicMoveResult): boolean {
    return result.error === undefined && result.status === 0;
}

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
export function removePublishedDirectoryIfOwned(publication: PublishedDirectoryOwnership, runMove: AtomicMoveRunning = spawnSync): boolean {
    const outDir = path.resolve(publication.outDir);
    if (publication.members !== undefined) {
        if (!sameIdentity(capturePublishDirectoryIdentity(outDir), publication.identity)) return false;
        for (const member of [...publication.members].reverse()) {
            if (publishedMemberMatches(outDir, member)) fs.unlinkSync(path.join(outDir, member.name));
        }
        if (!publication.retainEmptyDirectory) {
            try {
                fs.rmdirSync(outDir);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOTEMPTY") return false;
                throw error;

            }
        }
        return true;
    }
    const nonce = crypto.randomBytes(12).toString("hex");
    const privateDir = path.join(path.dirname(outDir), `.${path.basename(outDir)}.rollback-${nonce}`);
    fs.mkdirSync(privateDir, {recursive: false});
    const privateIdentity = capturePublishDirectoryIdentity(privateDir)!;
    try {
        if (!sameIdentity(capturePublishDirectoryIdentity(outDir), publication.identity)) return false;
        exchangeDirectories(outDir, privateDir, runMove);

        // The exchange is a single namespace operation, but an unrelated
        // writer is still free to race the pathname just before it.  Never
        // remove what we did not install: put a late claimant back and leave
        // its public name intact.
        if (!sameIdentity(capturePublishDirectoryIdentity(privateDir), publication.identity)) {
            if (sameIdentity(capturePublishDirectoryIdentity(outDir), privateIdentity)) {
                exchangeDirectories(outDir, privateDir, runMove);
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
//
// Replacement is a single atomic exchange where the host provides
// `mv --exchange`. Hosts without it use a same-directory rename fallback: the
// public name is briefly absent while the old directory is moved aside and the
// staged directory is moved in. The fallback never exposes a partial payload
// and restores the old directory if the publish rename fails.
export function publishDirectoryAtomically(options: PublishDirectoryAtomicallyOptions): PublishDirectoryAtomicallyResult {
    const runMove = options.runMove ?? spawnSync;
    const removeDirectory = options.removeDirectory ?? ((dirPath: string) => fs.rmSync(dirPath, {recursive: true, force: true}));
    const claimed = (message: string): Error => options.destinationClaimedError?.(message) ?? new PublishDirectoryDestinationClaimedError(message);
    const outDir = path.resolve(options.outDir);
    const ownership = options.ownership ?? resolveOwnership(options);
    const expectedAbsent = options.expectedDestinationWasAbsent === true || ownership.destinationIdentity === undefined;
    const nonce = crypto.randomBytes(12).toString("hex");
    const tempDir = path.join(path.dirname(outDir), `.${path.basename(outDir)}.tmp-${nonce}`);
    let tempIdentity: PublishDirectoryAtomicallyDestinationIdentity | undefined;
    let installedPublication: PublishedDirectoryOwnership | undefined;

    const removeScratch = (): void => {
        try {
            removeDirectory(tempDir);
        } catch (error) {
            if (options.preserveEmptyDestination) throw new Error(`Publication scratch cleanup failed at "${tempDir}": ${error instanceof Error ? error.message : String(error)}`);
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

        if (options.preserveEmptyDestination && !expectedAbsent) {
            if (fs.readdirSync(outDir).length !== 0) throw claimed(`Destination "${outDir}" is no longer empty.`);
            const members: {name: string; identity: PublishDirectoryAtomicallyDestinationIdentity; hash: string}[] = [];
            const publication: PublishedDirectoryOwnership = {outDir, identity: ownership.destinationIdentity!, members, retainEmptyDirectory: true};
            try {
                const names = fs.readdirSync(tempDir).sort((a, b) => {
                    if (a === "index.json") return 1;
                    if (b === "index.json") return -1;
                    return a.localeCompare(b);
                });
                for (const name of names) {
                    if (!sameIdentity(capturePublishDirectoryIdentity(outDir), publication.identity) || fs.readdirSync(outDir).some(entry => !members.some(member => member.name === entry))) throw claimed(`Destination "${outDir}" was claimed during publication.`);
                    const source = path.join(tempDir, name);
                    if (!fs.lstatSync(source).isFile()) throw new Error("Empty-directory publication supports physical files only.");
                    const identity = capturePublishDirectoryIdentity(source)!;
                    const hash = crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");
                    fs.linkSync(source, path.join(outDir, name));
                    members.push({name, identity, hash});
                }
                options.afterCommit?.();
                if (!publishedMembersMatch(publication)) throw claimed(`Destination "${outDir}" was claimed at commit (member identity or contents changed).`);
                removeDirectory(tempDir);
                if (!publishedMembersMatch(publication)) throw claimed(`Destination "${outDir}" changed before publication completed.`);
                return withPublishedDirectoryOwnership({}, publication);
            } catch (error) {
                if (!removePublishedDirectoryIfOwned(publication)) throw new Error(`Publication rollback cleanup failed at "${outDir}"; ownership changed. Original error: ${String(error)}`);
                throw error;
            }
        }
        const newMembers = options.preserveEmptyDestination ? fs.readdirSync(tempDir).map(name => ({name, identity: capturePublishDirectoryIdentity(path.join(tempDir, name))!, hash: crypto.createHash("sha256").update(fs.readFileSync(path.join(tempDir, name))).digest("hex")})) : undefined;
        if (expectedAbsent) installAbsentDirectory(tempDir, outDir, claimed, runMove);
        else exchangeDirectories(tempDir, outDir, runMove);

        const installedIdentity = capturePublishDirectoryIdentity(outDir);
        if (installedIdentity === undefined) {
            restoreDisplacedDestination(tempDir, outDir, tempIdentity, runMove);
            throw claimed(`Destination "${outDir}" disappeared during publication commit.`);
        }
        if (!sameIdentity(installedIdentity, tempIdentity)) {
            restoreDisplacedDestination(tempDir, outDir, tempIdentity, runMove);
            throw claimed(`Destination "${outDir}" was claimed during publication commit.`);
        }
        if (!expectedAbsent && !isExpectedDisplacedDestination(tempDir, ownership)) {
            restoreDisplacedDestination(tempDir, outDir, tempIdentity, runMove);
            throw claimed(`Destination "${outDir}" was claimed during publication commit.`);
        }
        const publication: PublishedDirectoryOwnership = {outDir, identity: installedIdentity, ...(newMembers ? {members: newMembers} : {})};
        installedPublication = publication;
        options.afterCommit?.();
        if (!sameIdentity(capturePublishDirectoryIdentity(outDir), publication.identity) || (publication.members !== undefined && !publishedMembersMatch(publication))) {
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
        if (options.preserveEmptyDestination && installedPublication && !removePublishedDirectoryIfOwned(installedPublication, runMove)) throw new Error(`Publication rollback cleanup failed at "${outDir}"; ownership changed. Original error: ${String(error)}`);
        // Once the staging name has been exchanged or renamed, it may hold the
        // displaced destination. Never delete that payload: only the staging
        // directory itself is safe to discard here.
        const currentTempIdentity = capturePublishDirectoryIdentity(tempDir);
        const tempHoldsDisplacedDestination = !expectedAbsent && sameIdentity(currentTempIdentity, ownership.destinationIdentity);
        if (!tempHoldsDisplacedDestination) removeScratch();
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

function installAbsentDirectory(
    tempDir: string,
    outDir: string,
    claimed: (message: string) => Error,
    runMove: AtomicMoveRunning,
): void {
    const tempIdentity = capturePublishDirectoryIdentity(tempDir);
    const result = runMove("mv", ["--no-clobber", "--no-target-directory", tempDir, outDir], {encoding: "utf-8"});
    if (moveSucceeded(result)) {
        if (capturePublishDirectoryIdentity(tempDir) === undefined && sameIdentity(capturePublishDirectoryIdentity(outDir), tempIdentity)) return;
        throw claimed(`Destination "${outDir}" was claimed during publication commit.`);
    }

    // Portable fallback for hosts whose mv lacks --no-clobber. There is no
    // portable no-clobber rename primitive, so a writer creating the name
    // between the check and the rename can still win; the common case is safe
    // and the caller's identity check still rejects a changed destination.
    if (capturePublishDirectoryIdentity(outDir) !== undefined) throw claimed(`Destination "${outDir}" was claimed during publication commit.`);
    fs.renameSync(tempDir, outDir);
    if (capturePublishDirectoryIdentity(tempDir) !== undefined || !sameIdentity(capturePublishDirectoryIdentity(outDir), tempIdentity)) {
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

function exchangeDirectories(left: string, right: string, runMove: AtomicMoveRunning = spawnSync): void {
    const result = runMove("mv", ["--exchange", "--no-target-directory", left, right], {encoding: "utf-8"});
    if (moveSucceeded(result)) return;
    exchangeDirectoriesPortable(left, right);
}

// Portable equivalent of mv --exchange: move the old destination aside, move
// the staged directory into the public name, then move the old payload into
// the staging name. The final namespace state matches the exchange operation;
// the middle step necessarily leaves the public name briefly absent.
function exchangeDirectoriesPortable(left: string, right: string): void {
    const leftIdentity = capturePublishDirectoryIdentity(left);
    const rightIdentity = capturePublishDirectoryIdentity(right);
    if (leftIdentity === undefined || rightIdentity === undefined) {
        throw new Error(`Cannot replace directory "${right}": both the staged and destination directories must exist.`);
    }
    const swap = path.join(path.dirname(right), `.${path.basename(right)}.swap-${crypto.randomBytes(12).toString("hex")}`);
    try {
        fs.renameSync(right, swap);
    } catch (error) {
        throw new Error(`Cannot replace directory "${right}": ${errorMessage(error)}`);
    }

    try {
        if (!sameIdentity(capturePublishDirectoryIdentity(swap), rightIdentity)) {
            if (capturePublishDirectoryIdentity(right) === undefined) fs.renameSync(swap, right);
            throw new Error(`Cannot replace directory "${right}": destination changed during publication.`);
        }
        fs.renameSync(left, right);
    } catch (error) {
        const restored = restorePortableExchange(left, right, swap, leftIdentity, rightIdentity);
        if (!restored && sameIdentity(capturePublishDirectoryIdentity(swap), rightIdentity)) {
            throw new Error(`Cannot replace directory "${right}": ${errorMessage(error)}. The previous directory remains at "${swap}".`);
        }
        throw error instanceof Error ? error : new Error(String(error));
    }

    try {
        fs.renameSync(swap, left);
    } catch (error) {
        if (capturePublishDirectoryIdentity(left) === undefined) {
            try {
                fs.renameSync(right, left);
            } catch {
                // Leave both paths for recovery.
            }
        }
        if (capturePublishDirectoryIdentity(right) === undefined) {
            try {
                fs.renameSync(swap, right);
            } catch {
                // Leave the displaced directory at its private name.
            }
        }
        if (sameIdentity(capturePublishDirectoryIdentity(swap), rightIdentity)) {
            throw new Error(`Cannot replace directory "${right}": ${errorMessage(error)}. The previous directory remains at "${swap}".`);
        }
        throw error instanceof Error ? error : new Error(String(error));
    }
}

function restorePortableExchange(
    left: string,
    right: string,
    swap: string,
    leftIdentity: PublishDirectoryAtomicallyDestinationIdentity,
    rightIdentity: PublishDirectoryAtomicallyDestinationIdentity,
): boolean {
    try {
        if (!sameIdentity(capturePublishDirectoryIdentity(swap), rightIdentity)) return false;
        const currentRight = capturePublishDirectoryIdentity(right);
        if (currentRight === undefined) {
            fs.renameSync(swap, right);
            return true;
        }
        if (sameIdentity(currentRight, leftIdentity) && capturePublishDirectoryIdentity(left) === undefined) {
            fs.renameSync(right, left);
            fs.renameSync(swap, right);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

function restoreDisplacedDestination(
    tempDir: string,
    outDir: string,
    installedIdentity: PublishDirectoryAtomicallyDestinationIdentity | undefined,
    runMove: AtomicMoveRunning,
): void {
    if (installedIdentity === undefined) return;
    try {
        // Exchange back only while both names still identify the two paths
        // created by this operation.  A later claimant is never moved.
        if (sameIdentity(capturePublishDirectoryIdentity(outDir), installedIdentity)) exchangeDirectories(tempDir, outDir, runMove);
    } catch {
        // The ownership failure remains authoritative. The caller retains any
        // displaced destination rather than deleting it.
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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

function publishedMemberMatches(outDir: string, member: NonNullable<PublishedDirectoryOwnership["members"]>[number]): boolean {
    const file = path.join(outDir, member.name);
    if (!sameIdentity(capturePublishDirectoryIdentity(file), member.identity)) return false;
    return fs.lstatSync(file).isFile() && crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") === member.hash;
}

function publishedMembersMatch(publication: PublishedDirectoryOwnership): boolean {
    if (!sameIdentity(capturePublishDirectoryIdentity(publication.outDir), publication.identity)) return false;
    const names = fs.readdirSync(publication.outDir);
    const members = publication.members!;
    return names.length === members.length && members.every(member => names.includes(member.name) && publishedMemberMatches(publication.outDir, member));
}
