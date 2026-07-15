import fs from "fs";
import {compareIds} from "../../internal/compareIds.js";
import type {OutcomeLibraryBundleIndexEntry} from "../OutcomeLibraryBundleModeIndex.js";

// Binary search over "entries" for the one matching "id" — relies entirely on OutcomeLibraryBundleModeIndex's
// own contract that entries are canonically sorted by id (the same order buildWeightedOutcomeLibrary already
// sorts to). Returns undefined on a miss, mirroring a Map lookup rather than throwing.
export function findIndexEntryById(entries: readonly OutcomeLibraryBundleIndexEntry[], id: string): OutcomeLibraryBundleIndexEntry | undefined {
    let low = 0;
    let high = entries.length - 1;
    while (low <= high) {
        const mid = (low + high) >>> 1;
        const comparison = compareIds(entries[mid].id, id);
        if (comparison === 0) {
            return entries[mid];
        }
        if (comparison < 0) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return undefined;
}

// A single fs.open + fs.read for exactly one entry's own byte range — never reading (or even opening a stream
// over) any other part of the outcomes file. This is what makes readOutcomeById/drawOutcome genuine
// single-outcome random access rather than a full scan.
export function readOutcomeAtByteRange(outcomesFilePath: string, entry: OutcomeLibraryBundleIndexEntry): unknown {
    const fd = fs.openSync(outcomesFilePath, "r");
    try {
        const buffer = Buffer.alloc(entry.byteLength);
        fs.readSync(fd, buffer, 0, entry.byteLength, entry.byteOffset);
        return JSON.parse(buffer.toString("utf-8"));
    } finally {
        fs.closeSync(fd);
    }
}
