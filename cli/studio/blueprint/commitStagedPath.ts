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
