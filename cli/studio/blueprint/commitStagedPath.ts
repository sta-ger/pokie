import crypto from "crypto";
import fs from "fs";

export type StagedPathRenamer = (from: string, to: string) => void;
export type StagedPathRemover = (targetPath: string) => void;

export type CommitStagedPathResult = {
    // Where the previous content (if any) was moved aside to -- undefined when `realPath` didn't
    // exist yet, in which case there's nothing to restore beyond removing what this call published.
    readonly stalePath: string | undefined;
};

// Same "rename aside, rename in, restore on failure" idea publishDirectoryAtomically uses for a whole
// directory (fs.rename works identically for a single file) -- split into three separate steps
// (commit / restore / finalizeBackup below) instead of one all-in-one call, because this is the
// "commit" half of a *two*-resource transaction (see applyGameBlueprintToProject.ts): the caller needs
// to defer finalizing or rolling back until it knows whether the *other* resource committed too, which
// publishDirectoryAtomically's own all-in-one API (it deletes its stale backup itself, before
// returning) has no way to defer.
export function commitStagedPath(realPath: string, stagedPath: string, rename: StagedPathRenamer = fs.renameSync): CommitStagedPathResult {
    if (!fs.existsSync(realPath)) {
        rename(stagedPath, realPath);
        return {stalePath: undefined};
    }

    const stalePath = `${realPath}.stale-${crypto.randomBytes(6).toString("hex")}`;
    rename(realPath, stalePath);
    try {
        rename(stagedPath, realPath);
    } catch (commitError) {
        try {
            rename(stalePath, realPath);
        } catch (restoreError) {
            throw new Error(
                `Failed to commit "${realPath}", and failed to restore its previous content afterward: ` +
                    `${commitError instanceof Error ? commitError.message : String(commitError)}; restore failure: ` +
                    `${restoreError instanceof Error ? restoreError.message : String(restoreError)}. The previous content ` +
                    `is still intact at "${stalePath}" — rename it back to "${realPath}" by hand.`,
            );
        }
        throw commitError;
    }
    return {stalePath};
}

// Rolls a resource commitStagedPath already committed back to what it held before -- used when a
// *different* resource in the same transaction failed to commit, so this one must not end up ahead of
// it. `stalePath === undefined` means `realPath` didn't exist before the commit being rolled back, so
// "restoring" means removing what was just published there.
export function restoreStagedPath(
    realPath: string,
    stalePath: string | undefined,
    rename: StagedPathRenamer = fs.renameSync,
    remove: StagedPathRemover = (targetPath) => fs.rmSync(targetPath, {recursive: true, force: true}),
): void {
    try {
        remove(realPath);
        if (stalePath !== undefined) {
            rename(stalePath, realPath);
        }
    } catch (error) {
        const recovery = stalePath !== undefined ? ` The previous content is still intact at "${stalePath}" — rename it back to "${realPath}" by hand.` : "";
        throw new Error(`Failed to roll "${realPath}" back to its previous state: ${error instanceof Error ? error.message : String(error)}.${recovery}`);
    }
}

export type RestoreSourceIfUnchangedResult =
    | {readonly status: "restored"}
    // Something wrote different content to `realPath` after this transaction's own commit and before
    // this rollback ran -- despite the exclusive lock applyGameBlueprintToProject holds for its own
    // commit/rollback sequence, a writer that never asked for that lock (a hand edit, another tool
    // entirely) can still land here. Blindly restoring would silently destroy it, so this leaves
    // `realPath` exactly as found instead and reports it, rather than throwing: an uncooperative edit
    // surviving untouched is the whole point, not a failure of this rollback step.
    | {readonly status: "external-edit-preserved"; readonly stalePath: string | undefined};

// Same idea as restoreStagedPath, but conditional: only restores `realPath` from its stale backup if its
// *current* content still equals what this transaction itself last wrote there. Generated package files
// never need this (nothing but "pokie build" itself ever writes them), but the source blueprint is a
// file a person edits directly, so a plain "delete whatever's there now and rename the backup over it"
// rollback is exactly the kind of silent-overwrite this stabilization pass exists to close.
export function restoreSourceIfUnchanged(
    realPath: string,
    stalePath: string | undefined,
    expectedCurrentContent: string,
    readFile: (filePath: string) => string,
    rename: StagedPathRenamer = fs.renameSync,
    remove: StagedPathRemover = (targetPath) => fs.rmSync(targetPath, {recursive: true, force: true}),
): RestoreSourceIfUnchangedResult {
    let currentContent: string | undefined;
    try {
        currentContent = readFile(realPath);
    } catch {
        currentContent = undefined;
    }
    if (currentContent !== expectedCurrentContent) {
        return {status: "external-edit-preserved", stalePath};
    }

    try {
        remove(realPath);
        if (stalePath !== undefined) {
            rename(stalePath, realPath);
        }
    } catch (error) {
        const recovery = stalePath !== undefined ? ` The previous content is still intact at "${stalePath}" — rename it back to "${realPath}" by hand.` : "";
        throw new Error(`Failed to roll "${realPath}" back to its previous state: ${error instanceof Error ? error.message : String(error)}.${recovery}`);
    }
    return {status: "restored"};
}

// Best-effort cleanup of a stale backup once the resource it belongs to is confirmed committed for
// good (every resource in the transaction succeeded) -- a failure here is cosmetic, same as
// publishDirectoryAtomically's own "cleanupWarning" convention: never a reason to treat the commit
// itself as failed. Returns a warning message instead of throwing.
export function finalizeStagedPathBackup(
    stalePath: string | undefined,
    remove: StagedPathRemover = (targetPath) => fs.rmSync(targetPath, {recursive: true, force: true}),
): string | undefined {
    if (stalePath === undefined) {
        return undefined;
    }
    try {
        remove(stalePath);
        return undefined;
    } catch (error) {
        return `The stale backup at "${stalePath}" could not be removed: ${error instanceof Error ? error.message : String(error)}. Remove it manually.`;
    }
}
