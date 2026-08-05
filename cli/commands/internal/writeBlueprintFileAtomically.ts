import crypto from "crypto";
import fs from "fs";
import path from "path";

export type BlueprintFileWriteResult = {readonly status: "ok"} | {readonly status: "conflict"};

export type BlueprintStagingWriter = (stagingPath: string, contents: string) => void;
export type BlueprintDestinationLinker = (stagingPath: string, filePath: string) => void;
export type BlueprintPathUnlinker = (targetPath: string) => void;
export type BlueprintDirectoryCreator = (dirPath: string) => void;

// Publishes a brand-new Blueprint file with create-only, no-clobber semantics -- never a plain
// fs.existsSync() check followed later by an unconditional write, which leaves a window between the two
// calls for something else (a racing "pokie create" run, a hand-created file) to land at filePath first,
// or for a write failure/rejection mid-save to leave a truncated file sitting at the real destination.
//
// The full contents are written to a private staging file *beside* filePath first, so the actual commit
// below is a same-directory filesystem operation and a reader can only ever observe the complete old
// state or the complete new one, never a partially-written destination. Publishing then happens via
// fs.linkSync -- a second name for the staging file's own inode -- which the kernel itself refuses with
// EEXIST if filePath already exists, even if it only appeared after an earlier, separate exists() check
// already ran; that refusal, not the earlier check, is the actual conflict-at-commit-time guarantee.
// Every path out of this function (a successful publish, a write failure, a losing race at the link)
// removes the staging file, so neither a partial destination nor leftover staging residue ever survives
// this call.
export function writeBlueprintFileAtomically(
    filePath: string,
    contents: string,
    write: BlueprintStagingWriter = (stagingPath, text) => fs.writeFileSync(stagingPath, text, "utf-8"),
    link: BlueprintDestinationLinker = fs.linkSync,
    unlink: BlueprintPathUnlinker = fs.unlinkSync,
    mkdir: BlueprintDirectoryCreator = (dirPath) => fs.mkdirSync(dirPath, {recursive: true}),
): BlueprintFileWriteResult {
    const dir = path.dirname(filePath);
    if (dir && dir !== ".") {
        mkdir(dir);
    }
    const stagingPath = path.join(dir, `.${path.basename(filePath)}.staging-${crypto.randomBytes(6).toString("hex")}`);

    try {
        write(stagingPath, contents);
    } catch (error) {
        removeBestEffort(stagingPath, unlink);
        throw error;
    }

    try {
        link(stagingPath, filePath);
    } catch (error) {
        removeBestEffort(stagingPath, unlink);
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            return {status: "conflict"};
        }
        throw error;
    }

    removeBestEffort(stagingPath, unlink);
    return {status: "ok"};
}

function removeBestEffort(stagingPath: string, unlink: BlueprintPathUnlinker): void {
    try {
        unlink(stagingPath);
    } catch {
        // Best-effort only -- the destination is already durably correct (or was never touched) by the
        // time this runs; a leftover staging file at this point is cosmetic, not a correctness problem.
    }
}
