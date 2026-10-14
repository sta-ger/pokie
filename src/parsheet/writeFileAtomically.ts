import crypto from "crypto";
import fs from "fs";
import path from "path";

// Writes via a temporary file in the *same* directory as `filePath`, then renames it into place —
// `fs.rename` within one directory is a single atomic filesystem operation on every platform Node
// supports, so a reader can never observe a partially-written file at `filePath`, and a process crash
// mid-write leaves the original `filePath` (if any) completely untouched. `write(tempPath)` does the
// actual writing (e.g. `workbook.xlsx.writeFile(tempPath)`); if it throws, or the rename itself fails,
// the temp file is removed and the error is rethrown — `filePath` is never touched in that case.
export async function writeFileAtomically(filePath: string, write: (tempPath: string) => Promise<void>, beforeCommit?: () => void, overwrite = true): Promise<void> {
    const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${crypto.randomBytes(6).toString("hex")}`);
    try {
        await write(tempPath);
        beforeCommit?.();
        if (overwrite) await fs.promises.rename(tempPath, filePath);
        else {
            // Hard-link publication is atomic and refuses an occupied destination. Existing edit
            // callers keep rename/overwrite semantics; new workbook artifacts use this branch.
            await fs.promises.link(tempPath, filePath);
            await fs.promises.rm(tempPath, {force: true});
        }
    } catch (error) {
        await fs.promises.rm(tempPath, {force: true});
        throw error;
    }
}
