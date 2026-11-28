import fs from "fs";
import {describeDestinationFilesystemProblem} from "./describeDestinationFilesystemProblem.js";

// Every CLI command that accepts an explicit --out path writes a single file. Reject a folder (and
// translate a filesystem failure while inspecting it) before an atomic writer stages a temp sibling and
// fails with a raw EISDIR/ENOTDIR rename message. An absent path is the normal new-file case.
export function assertDestinationIsAFile(file: string): void {
    let stat: fs.Stats;
    try {
        stat = fs.statSync(file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        const problem = describeDestinationFilesystemProblem(file, error);
        if (problem !== undefined) throw new Error(problem);
        throw error;
    }
    if (stat.isDirectory()) {
        throw new Error(`"${file}" is a folder, not a file. Choose a different file path.`);
    }
}
