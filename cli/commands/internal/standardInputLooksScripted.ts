import fs from "fs";

// A redirected regular file or a pipe is the documented "printf ... | pokie create" workflow; a TTY is
// the ordinary interactive workflow. /dev/null or a closed stdin is neither, so callers can still show
// their helpful guidance instead of an immediate, confusing "Cancelled." from readline's EOF.
export function standardInputLooksScripted(): boolean {
    try {
        const stat = fs.fstatSync(0);
        return stat.isFIFO() || stat.isFile();
    } catch {
        return false;
    }
}
