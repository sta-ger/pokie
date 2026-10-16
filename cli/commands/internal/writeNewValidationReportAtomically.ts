import fs from "fs";
import path from "path";

/** Reports use new destinations; a hard link publishes complete bytes without overwriting aliases. */
export function writeNewValidationReportAtomically(file: string, contents: string): void {
    let staging: string | undefined;
    try {
        staging = fs.mkdtempSync(path.join(path.dirname(file), ".pokie-validate-"));
        const temporaryFile = path.join(staging, "report.json");
        fs.writeFileSync(temporaryFile, contents, "utf8");
        fs.linkSync(temporaryFile, file);
    } finally {
        if (staging) fs.rmSync(staging, {recursive: true, force: true});
    }
}
