import fs from "fs";

// A dangling symbolic link is still an existing directory entry. fs.existsSync() follows the link and
// reports false for it, which lets a create-only preflight proceed and a later plain write create the
// link's target outside the requested path. lstat() answers the question those checks actually mean:
// is this destination name already occupied by anything -- a file, a folder, or a link?
//
// Errors such as EACCES/ENOTDIR intentionally read as "not occupied", the same way fs.existsSync()
// treats them; callers publish/create-only afterwards, where the real filesystem error is reported.
export function pathEntryExists(targetPath: string): boolean {
    try {
        fs.lstatSync(targetPath);
        return true;
    } catch {
        return false;
    }
}
