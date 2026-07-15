import fs from "fs";
import readline from "readline";

// One line's own raw parse outcome, before any shape-checking — "invalid-json" when the line itself isn't
// valid JSON at all (as opposed to valid JSON with the wrong shape, which callers check separately), mirroring
// the same "unreadable/invalid/ok" discrimination convention used across every other importer in this codebase
// (see StakeEngineImportBundle's own file-read-result types). "byteOffset" matches exactly what
// OutcomeLibraryBundleIndexEntry.byteOffset records for the same line, so a caller can cross-check the two.
export type RawOutcomeLine =
    | {readonly status: "ok"; readonly position: number; readonly byteOffset: number; readonly value: unknown}
    | {readonly status: "invalid-json"; readonly position: number; readonly byteOffset: number; readonly error: string};

// Streams "filePath" line by line via Node's readline over a read stream — the one place in this codebase that
// reads a file as a true, never-buffer-the-whole-thing async stream (every other exporter/importer reads a
// whole file into memory at once; a canonical outcome-library bundle's whole point is to avoid that for
// potentially very large per-mode outcome files). Shared by OutcomeLibraryBundleReader's own
// iterateModeOutcomes/readLibrary (which throw on anything other than "ok" — those callers expect an
// already-validated bundle) and OutcomeLibraryBundleValidator's deep mode (which turns each "invalid-json" or
// shape mismatch into its own distinct ValidationIssue instead).
export async function *iterateOutcomesJsonl(filePath: string): AsyncGenerator<RawOutcomeLine> {
    const stream = fs.createReadStream(filePath, {encoding: "utf-8"});
    const rl = readline.createInterface({input: stream, crlfDelay: Infinity});

    let position = 0;
    let byteOffset = 0;
    try {
        for await (const line of rl) {
            const lineByteLength = Buffer.byteLength(line, "utf-8");
            if (line.length > 0) {
                const lineByteOffset = byteOffset;
                try {
                    yield {status: "ok", position, byteOffset: lineByteOffset, value: JSON.parse(line)};
                } catch (error) {
                    yield {status: "invalid-json", position, byteOffset: lineByteOffset, error: error instanceof Error ? error.message : String(error)};
                }
                position++;
            }
            byteOffset += lineByteLength + 1;
        }
    } finally {
        rl.close();
        stream.destroy();
    }
}
