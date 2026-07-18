import crypto from "crypto";
import fs from "fs";
import {computeGameBlueprintHash} from "pokie";

export type SourceRenamer = (from: string, to: string) => void;
export type SourceLinker = (existingPath: string, newPath: string) => void;
export type SourceUnlinker = (targetPath: string) => void;
export type SourceReader = (filePath: string) => string;

export type PublishSourceBlueprintResult =
    | {readonly status: "ok"; readonly capturedPath: string}
    | {readonly status: "conflict"; readonly currentHash: string}
    | {readonly status: "error"; readonly error: string};

// Publishes a new source blueprint as a genuine ownership-based filesystem transaction — not a hash read
// followed later by an unconditional rename, which is a compare-then-write with a real gap between the
// two calls no matter how few statements separate them, and can never be more than "probably fine" for a
// writer that never asked for applyGameBlueprintToProject's own exclusive lock (a hand edit saved from a
// text editor, another tool entirely).
//
//   1. *Capture* whatever is currently at sourcePath by renaming it — not copying, not reading first —
//      to a private path nothing else knows about. rename() is atomic at the filesystem level: the
//      instant it returns, sourcePath is empty, and nothing else can simultaneously be looking at "the
//      old content is still there". This is what a separate readFile() can never give you — the content
//      verified in step 2 below is exactly the content that was actually removed from sourcePath, not a
//      snapshot from some window of time earlier that a later rename just trusts.
//   2. Hash exactly what was captured and compare it to expectedHash. A mismatch means an external edit
//      had already landed *before* this call even started capturing — restore it (see restoreCapture)
//      and report a conflict; nothing has been published.
//   3. Publish the new content with *no-replace* semantics: fs.linkSync (create a second name for the
//      same inode) fails with EEXIST if sourcePath already has something at it, unlike fs.renameSync's
//      always-overwrite behavior. Since sourcePath is empty from step 1, this only fails if something
//      else wrote a *new* file there in the exact window between capture and publish — precisely the
//      race a plain rename would silently clobber. On that failure, this reports an error and touches
//      nothing further: the captured original stays exactly where step 1 put it, and whatever the
//      external writer put at sourcePath stays exactly as they left it.
//
// Whatever this function reports, sourcePath afterward holds either the newly published blueprint, the
// restored pre-publish original, or an external writer's own new content — never a silent mix, and the
// pre-existing content this call captured is always still recoverable at its captured path if this call
// itself couldn't put it back.
export function publishSourceBlueprint(
    sourcePath: string,
    newContentPath: string,
    expectedHash: string,
    rename: SourceRenamer = fs.renameSync,
    link: SourceLinker = fs.linkSync,
    unlink: SourceUnlinker = fs.unlinkSync,
    readFile: SourceReader = (filePath) => fs.readFileSync(filePath, "utf-8"),
): PublishSourceBlueprintResult {
    const capturedPath = `${sourcePath}.captured-${crypto.randomBytes(6).toString("hex")}`;

    try {
        rename(sourcePath, capturedPath);
    } catch (error) {
        return {status: "error", error: `Failed to capture "${sourcePath}" for publishing: ${message(error)}`};
    }

    let capturedHash: string;
    try {
        const capturedText = readFile(capturedPath);
        capturedHash = computeGameBlueprintHash(JSON.parse(capturedText));
    } catch (error) {
        return {
            status: "error",
            error: `Captured "${sourcePath}" but failed to read it back: ${message(error)}. It is preserved at "${capturedPath}" for manual recovery.`,
        };
    }

    if (capturedHash !== expectedHash) {
        const restore = restoreCapture(capturedPath, sourcePath, link, unlink);
        if (restore.status === "restore-conflict") {
            return {
                status: "error",
                error:
                    `The source blueprint changed externally before this apply could publish its own edit, and a ` +
                    `second external write landed at "${sourcePath}" before the original could be restored. The ` +
                    `original this apply captured is preserved at "${capturedPath}"; whatever is now at "${sourcePath}" ` +
                    `was left untouched.`,
            };
        }
        return {status: "conflict", currentHash: capturedHash};
    }

    try {
        link(newContentPath, sourcePath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            return {
                status: "error",
                error:
                    `An external write landed at "${sourcePath}" while this apply was publishing its own edit. ` +
                    `Nothing was overwritten: the pre-apply original this apply captured is preserved at ` +
                    `"${capturedPath}", and whatever is now at "${sourcePath}" was left untouched.`,
            };
        }
        const restore = restoreCapture(capturedPath, sourcePath, link, unlink);
        if (restore.status === "restore-conflict") {
            return {
                status: "error",
                error:
                    `Failed to publish the new source blueprint (${message(error)}), and a second external write ` +
                    `landed at "${sourcePath}" before the pre-apply original could be restored. That original is ` +
                    `preserved at "${capturedPath}"; whatever is now at "${sourcePath}" was left untouched.`,
            };
        }
        return {status: "error", error: `Failed to publish the new source blueprint: ${message(error)}. The pre-apply original was restored.`};
    }
    unlink(newContentPath);

    return {status: "ok", capturedPath};
}

type RestoreResult = {readonly status: "restored"} | {readonly status: "restore-conflict"};

// Puts a just-captured original back with the same no-replace guarantee publishing itself uses: if
// something else wrote a *new* file to sourcePath in the window between this call's own capture and this
// restore attempt, linking fails with EEXIST instead of silently overwriting it — the captured original
// stays exactly where it was captured to, recoverable by hand, and the second writer's content is left
// exactly as they put it.
function restoreCapture(capturedPath: string, sourcePath: string, link: SourceLinker, unlink: SourceUnlinker): RestoreResult {
    try {
        link(capturedPath, sourcePath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            return {status: "restore-conflict"};
        }
        throw error;
    }
    unlink(capturedPath);
    return {status: "restored"};
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
