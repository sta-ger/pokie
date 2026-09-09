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
     * Test-only commit-boundary seam. It runs strictly after the final
     * ownership assertion and immediately before the live commit syscall.
     * Keeping it here (rather than in the scratch rename seam) lets callers
     * exercise a claimant arriving in the actual publication window.
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

// The public name is an atomically-installed symbolic link to an immutable
// invocation-owned payload directory.  This is deliberately not a directory
// exchange: exchange has no compare-and-swap ownership predicate, so a
// claimant arriving after a last identity check can be exchanged into cleanup.
//
// Installing the first link uses link(2), whose EEXIST result is the namespace
// operation itself proving that a claimant won.  Re-publishing replaces only a
// previous POKIE link with rename(2).  A late caller-owned *directory* cannot
// be the target of that rename, so the kernel rejects it before either
// directory is moved or modified.  Readers consequently see either the old
// complete payload or the new complete payload, never an entry-by-entry live
// directory mutation.
export function publishDirectoryAtomically(options: PublishDirectoryAtomicallyOptions): PublishDirectoryAtomicallyResult {
    const removeDirectory = options.removeDirectory ?? ((dirPath: string) => fs.rmSync(dirPath, {recursive: true, force: true}));
    const claimed = (message: string): Error => options.destinationClaimedError?.(message) ?? new PublishDirectoryDestinationClaimedError(message);
    const outDir = path.resolve(options.outDir);
    const capturedOwnership = options.ownership ?? resolveOwnership(options);
    // An explicitly rewritable empty directory contains no reader-visible
    // generation. Remove it *before* preparing the new generation, then use
    // the same no-replace link commit as an originally absent destination.
    // This is important: the final ownership observation and commit never
    // operate on an empty directory that a late caller could replace.
    const initiallyEmptyDestination = options.expectedDestinationWasAbsent !== true &&
        capturedOwnership.destinationIdentity !== undefined && capturedOwnership.destinationSnapshot?.length === 1;
    if (initiallyEmptyDestination) removeInitiallyEmptyDestination(outDir, claimed);
    const ownership = initiallyEmptyDestination
        ? {destinationIdentity: undefined, destinationSnapshot: undefined}
        : capturedOwnership;
    const expectedAbsent = options.expectedDestinationWasAbsent === true || ownership.destinationIdentity === undefined;
    const nonce = crypto.randomBytes(12).toString("hex");
    // Payloads deliberately live under a private sibling name rather than a
    // ``<destination>.tmp-*`` convention: they are the immutable live
    // generation behind the public link, not recoverable scratch/stale
    // output. They are removed on supersession.
    const payloadDir = path.join(path.dirname(outDir), `.pokie-publication-${path.basename(outDir)}-${nonce}`);
    const linkPath = `${outDir}.link-${nonce}`;
    const priorPayload = expectedAbsent ? undefined : readManagedPublicationPayload(outDir);
    const priorPayloadIdentity = priorPayload === undefined ? undefined : capturePublishDirectoryIdentity(priorPayload);
    const removeInvocationScratch = (): void => {
        try {
            fs.rmSync(linkPath, {force: true});
        } catch {
            // The link is this invocation's scratch name only.
        }
        try {
            removeDirectory(payloadDir);
        } catch {
            // This invocation owns only its adjacent payload directory.
        }
    };

    try {
        fs.mkdirSync(payloadDir, {recursive: false});
        options.writeFilesIntoTempDir(payloadDir);
        // Construct every invocation-owned name before the final observation.
        // The next namespace operation after beforeCommit is therefore the
        // live, ownership-conditioned commit itself.
        fs.symlinkSync(payloadDir, linkPath, "dir");
        assertDestinationUnchanged(outDir, ownership, expectedAbsent, claimed);
        // Keep the historical injectable rename seam at the final ownership
        // boundary. Besides retaining disk-failure coverage, this lets callers
        // prove that a destination claimed immediately before commit is never
        // exchanged or cleaned up by this invocation.
        exerciseRenameTestSeam(payloadDir, options.renameDirectory);
        // This runs strictly after the final observation and immediately
        // before the real namespace operation.  It is intentionally the test
        // seam for the former check-to-exchange race.
        options.beforeCommit?.();
        if (expectedAbsent) installAbsentDirectory(linkPath, outDir, claimed);
        else replaceManagedPublicationLink(linkPath, outDir, priorPayload, priorPayloadIdentity, removeDirectory, claimed);

        // The old immutable payload is invocation-owned and no longer visible
        // after the link commit. Failing to remove it cannot undo publication.
        try {
            if (priorPayload !== undefined) removeDirectory(priorPayload);
            return {};
        } catch (error) {
            return {
                cleanupWarning:
                    `The publish to "${options.outDir}" succeeded, but the superseded invocation-owned directory at "${priorPayload}" could not be removed: ` +
                    `${error instanceof Error ? error.message : String(error)}. Remove it manually.`,
            };
        }
    } catch (error) {
        removeInvocationScratch();
        if (initiallyEmptyDestination) restoreInitiallyEmptyDestination(outDir);
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

function installAbsentDirectory(linkPath: string, outDir: string, claimed: (message: string) => Error): void {
    try {
        // link(2) is an atomic no-replace namespace operation. It leaves the
        // claimant completely untouched when the destination already exists.
        fs.linkSync(linkPath, outDir);
        fs.unlinkSync(linkPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw claimed(`Destination "${outDir}" was claimed while publication was being prepared.`);
        }
        throw new PublishDirectoryPublicationPlatformError(
            `Cannot atomically publish directory "${outDir}": this host does not provide the required no-replace link operation ` +
            `(${error instanceof Error ? error.message : String(error)}).`,
        );
    }
}

function replaceManagedPublicationLink(
    linkPath: string,
    outDir: string,
    priorPayload: string | undefined,
    priorPayloadIdentity: PublishDirectoryAtomicallyDestinationIdentity | undefined,
    removeDirectory: (dirPath: string) => void,
    claimed: (message: string) => Error,
): void {
    if (priorPayload === undefined) {
        throw claimed(`Destination "${outDir}" is not an invocation-owned atomic publication link.`);
    }
    try {
        // rename(2) atomically switches one link for another. Crucially, it
        // cannot replace a late claimant's directory (EISDIR/ENOTDIR), unlike
        // RENAME_EXCHANGE which would move that directory into our cleanup.
        fs.renameSync(linkPath, outDir);
    } catch (error) {
        if (isDirectoryAt(outDir)) {
            // A late claimant may have removed the old public link. Its
            // payload was still ours, but it is now unreachable, so remove it
            // only after confirming the random invocation path still names
            // the same directory. Never let this best-effort cleanup alter
            // the claimed-destination result or touch the claimant.
            removePayloadIfStillOwned(priorPayload, priorPayloadIdentity, removeDirectory);
            throw claimed(`Destination "${outDir}" was claimed while publication was being prepared.`);
        }
        throw error;
    }
}

function readManagedPublicationPayload(outDir: string): string | undefined {
    try {
        if (!fs.lstatSync(outDir).isSymbolicLink()) return undefined;
        const payload = path.resolve(path.dirname(outDir), fs.readlinkSync(outDir));
        const expectedPrefix = `.pokie-publication-${path.basename(outDir)}-`;
        if (path.dirname(payload) !== path.dirname(outDir) || !path.basename(payload).startsWith(expectedPrefix) || !fs.statSync(payload).isDirectory()) {
            return undefined;
        }
        return payload;
    } catch {
        return undefined;
    }
}

function removeInitiallyEmptyDestination(outDir: string, claimed: (message: string) => Error): void {
    try {
        fs.rmdirSync(outDir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOTEMPTY" || (error as NodeJS.ErrnoException).code === "ENOENT") {
            throw claimed(`Destination "${outDir}" was claimed while publication was being prepared.`);
        }
        throw error;
    }
}

function restoreInitiallyEmptyDestination(outDir: string): void {
    try {
        // mkdir(2) is no-replace, so an external claimant that arrived during
        // a failed/cancelled invocation remains untouched.
        fs.mkdirSync(outDir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
}

function isDirectoryAt(directory: string): boolean {
    try {
        return fs.lstatSync(directory).isDirectory();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

function removePayloadIfStillOwned(
    payloadDir: string | undefined,
    expectedIdentity: PublishDirectoryAtomicallyDestinationIdentity | undefined,
    removeDirectory: (dirPath: string) => void,
): void {
    if (payloadDir === undefined || expectedIdentity === undefined) return;
    const currentIdentity = capturePublishDirectoryIdentity(payloadDir);
    if (currentIdentity === undefined || currentIdentity.device !== expectedIdentity.device || currentIdentity.inode !== expectedIdentity.inode) return;
    try {
        removeDirectory(payloadDir);
    } catch {
        // The caller-owned destination is the terminal outcome.  A failed
        // best-effort cleanup never changes it into a publication failure.
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
