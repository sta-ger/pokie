import crypto from "crypto";
import fs from "fs";
import path from "path";

// Writes via a temporary file in the *same* directory as `filePath`, then renames it into place —
// `fs.rename` within one directory is a single atomic filesystem operation on every platform Node
// supports, so a reader can never observe a partially-written file at `filePath`, and a process crash
// mid-write leaves the original `filePath` (if any) completely untouched. `write(tempPath)` does the
// actual writing (e.g. `workbook.xlsx.writeFile(tempPath)`); if it throws, or the rename itself fails,
// the temp file is removed and the error is rethrown — `filePath` is never touched in that case.
export async function writeFileAtomically(filePath: string, write: (tempPath: string) => Promise<void>, beforeCommit?: () => void, overwrite?: boolean, afterCommit?: (publication: {readonly path: string; readonly dev: number; readonly ino: number}) => void): Promise<void> {
    const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${crypto.randomBytes(6).toString("hex")}`);
    let published: fs.Stats | undefined;
    try {
        await write(tempPath);
        beforeCommit?.();
        if (overwrite !== false) await fs.promises.rename(tempPath, filePath);
        else {
            // Hard-link publication is atomic and refuses an occupied destination. Existing edit
            // callers keep rename/overwrite semantics; new workbook artifacts use this branch.
            const identity = await fs.promises.stat(tempPath);
            await fs.promises.link(tempPath, filePath);
            published = identity;
            afterCommit?.({path: path.resolve(filePath), dev: identity.dev, ino: identity.ino});
            await fs.promises.rm(tempPath, {force: true});
        }
    } catch (error) {
        if (published !== undefined) {
            try {
                const current = await fs.promises.lstat(filePath);
                if (current.dev === published.dev && current.ino === published.ino) await fs.promises.rm(filePath, {force: true});
            } catch (cleanupError) {
                if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") throw cleanupError;
            }
        }
        await fs.promises.rm(tempPath, {force: true});
        throw error;
    }
}
