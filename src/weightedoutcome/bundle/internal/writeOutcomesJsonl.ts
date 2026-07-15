import fs from "fs";
import {toCanonicalJson} from "../../../json/toCanonicalJson.js";
import type {WeightedOutcome} from "../../WeightedOutcome.js";
import type {OutcomeLibraryBundleIndexEntry} from "../OutcomeLibraryBundleModeIndex.js";

// Streams one mode's outcomes to "filePath" one canonical-JSON line at a time via a single open file
// descriptor — never building one giant string/buffer for the whole file, however many outcomes there are.
// Returns the index entries (id/weight/byte range) needed to later seek directly to any one line without
// reading the rest of the file — tracked incrementally as each line is written, from the exact byte lengths
// actually written, so the index can never drift from the file's real on-disk layout.
export function writeOutcomesJsonl<T extends string | number = string>(
    filePath: string,
    outcomes: readonly WeightedOutcome<T>[],
): readonly OutcomeLibraryBundleIndexEntry[] {
    const fd = fs.openSync(filePath, "w");
    try {
        let offset = 0;
        return outcomes.map((outcome) => {
            const line = JSON.stringify(toCanonicalJson(outcome));
            const lineBuffer = Buffer.from(line, "utf-8");
            fs.writeSync(fd, lineBuffer);
            fs.writeSync(fd, "\n");
            const entry: OutcomeLibraryBundleIndexEntry = {id: outcome.id, weight: outcome.weight, byteOffset: offset, byteLength: lineBuffer.byteLength};
            offset += lineBuffer.byteLength + 1;
            return entry;
        });
    } finally {
        fs.closeSync(fd);
    }
}
