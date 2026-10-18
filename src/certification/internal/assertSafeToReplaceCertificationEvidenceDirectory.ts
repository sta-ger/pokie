import fs from "fs";

/** New-or-empty only. A generatedBy claim never authorizes deletion of caller data. */
export function assertSafeToReplaceCertificationEvidenceDirectory(outDir: string): void {
    let destination: fs.Stats;
    try {
        destination = fs.lstatSync(outDir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }
    if (destination.isSymbolicLink() || !destination.isDirectory() || fs.readdirSync(outDir).length) throw new Error(`"${outDir}" already exists and is not an empty physical directory. Choose a new or empty --out directory; existing evidence and user artifacts are never replaced.`);
}
