import fs from "node:fs";
import path from "node:path";

export function selectPackedArchive(directory: string, stdout: string): string {
    const packRoot = fs.realpathSync(directory);
    const archives = fs.readdirSync(packRoot).filter(filename => filename.endsWith(".tgz"));
    const diagnostic = `npm pack stdout:\n${stdout}`;
    if (archives.length !== 1) {
        throw new Error(`Expected exactly one npm pack archive in ${packRoot}; found ${archives.length}: ${JSON.stringify(archives)}.\n${diagnostic}`);
    }
    const archive = path.join(packRoot, archives[0]);
    // A directory entry is never parsed from lifecycle logs. Reject aliases as
    // well, so npm install can only consume a regular file owned by this pack.
    if (!fs.lstatSync(archive).isFile() || path.dirname(fs.realpathSync(archive)) !== packRoot) {
        throw new Error(`npm pack archive must be a regular file inside ${packRoot}: ${archive}.\n${diagnostic}`);
    }
    return archive;
}
