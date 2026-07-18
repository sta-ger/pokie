import fs from "fs";

export type LockOpener = (lockPath: string) => void;
export type LockReleaser = (lockPath: string) => void;

// A dependency-free mutual-exclusion primitive built on the one atomic guarantee every POSIX filesystem
// already gives for free: opening a file with O_CREAT|O_EXCL either creates it or fails with EEXIST, with
// the kernel itself — not two racing reads of "does this exist yet" — deciding which of two simultaneous
// callers wins. That's a real ownership handoff, not a compare-then-write built from two separate calls
// (a read to decide, then later, unrelated, a write) with a window between them for another cooperating
// caller to land in. Everything applyGameBlueprintToProject does to commit or roll back a source
// blueprint happens while holding this lock, so two overlapping applies against the same source can never
// interleave their commits.
//
// This only coordinates *cooperating* callers — anything going through applyGameBlueprintToProject. It
// can't stop an uncooperative writer (a text editor's save, another tool entirely) that never asks for
// the lock in the first place; no application-level lock can, short of an OS-enforced mandatory lock,
// which isn't portable and would be a much larger change than this stabilization pass calls for. That
// residual case is handled separately — see restoreSourceIfUnchanged — by making every real write this
// module performs re-verify content immediately beforehand, so an edit that does slip past this lock is
// still never silently destroyed; it turns the operation into an explicit error instead.
export function withExclusiveLock<T>(
    lockPath: string,
    work: () => T,
    open: LockOpener = (path) => fs.closeSync(fs.openSync(path, "wx")),
    release: LockReleaser = (path) => fs.unlinkSync(path),
): T {
    try {
        open(lockPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new Error(`Another apply is already in progress for this project's blueprint (lock held at "${lockPath}"). Try again shortly.`);
        }
        throw error;
    }
    try {
        return work();
    } finally {
        try {
            release(lockPath);
        } catch {
            // Best-effort: if this fails, the lock file leaks and blocks future applies until removed by
            // hand, but the work itself (success or failure) already completed by this point.
        }
    }
}
