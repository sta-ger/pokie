import fs from "fs";
import path from "path";

// Writes a complete artifact next to its requested destination and only then replaces the destination.
// A failed render/write therefore cannot leave a truncated JSON/Markdown/HTML report at --out. Keeping this
// boundary small also lets command tests inject a simple writer without needing filesystem fixtures.
export function writeOutputFileAtomically(file: string, contents: string): void {
    if (contents.trim().length === 0) {
        throw new Error("Refusing to write an empty report artifact.");
    }

    const directory = path.dirname(file);
    let temporaryDirectory: string | undefined;
    try {
        temporaryDirectory = fs.mkdtempSync(path.join(directory, ".pokie-report-"));
        const temporaryFile = path.join(temporaryDirectory, path.basename(file));
        fs.writeFileSync(temporaryFile, contents, "utf-8");
        fs.renameSync(temporaryFile, file);
    } finally {
        if (temporaryDirectory !== undefined) {
            fs.rmSync(temporaryDirectory, {recursive: true, force: true});
        }
    }
}
