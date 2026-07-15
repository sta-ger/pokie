import crypto from "crypto";
import fs from "fs";
import {compareIds} from "../../internal/compareIds.js";
import type {WeightedOutcome} from "../../WeightedOutcome.js";
import {OutcomeLibraryBundleInvariantError} from "../OutcomeLibraryBundleInvariantError.js";
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

function isWeightedOutcomeShape(value: unknown): value is {id: string; weight: number; artifact: unknown} {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as {id?: unknown}).id === "string" &&
        typeof (value as {weight?: unknown}).weight === "number" &&
        typeof (value as {artifact?: unknown}).artifact === "object" &&
        (value as {artifact?: unknown}).artifact !== null
    );
}

// A single fs.open + fs.read for exactly one entry's own byte range — never reading (or even opening a stream
// over) any other part of the outcomes file. This is what makes readOutcomeById/drawOutcome genuine
// single-outcome random access rather than a full scan.
//
// Verifies the record actually found at that byte range is the one the index promised — its own "id" and
// "weight" must match "entry" exactly, and its exact bytes must hash to "entry.recordHash" — before ever
// returning it: a corrupted/mistaken byte range (a hand-tampered index, an off-by-one in some future refactor, a
// filesystem returning stale data) would otherwise silently hand back the *wrong* outcome with no indication
// anything was amiss, which is a real correctness risk for anything feeding a live draw rather than a mere
// diagnostic. The recordHash check specifically catches content tampered in place without touching id/weight at
// all (e.g. a rewritten artifact) — something the id/weight checks alone can't. Throws
// OutcomeLibraryBundleInvariantError rather than returning a mismatched result — the same "assume already
// validated, fail fast on a genuine surprise" contract every other OutcomeLibraryBundleReader method has; a
// caller that specifically needs this surfaced as a source-level conflict (see PreGeneratedOutcomeSourcing)
// translates it itself (see OutcomeLibraryBundleOutcomeSource).
export function readAndVerifyOutcomeAtByteRange<T extends string | number = string>(
    modeName: string,
    outcomesFilePath: string,
    entry: OutcomeLibraryBundleIndexEntry,
): WeightedOutcome<T> {
    const fd = fs.openSync(outcomesFilePath, "r");
    let buffer: Buffer;
    let value: unknown;
    try {
        buffer = Buffer.alloc(entry.byteLength);
        fs.readSync(fd, buffer, 0, entry.byteLength, entry.byteOffset);
        value = JSON.parse(buffer.toString("utf-8"));
    } finally {
        fs.closeSync(fd);
    }

    if (!isWeightedOutcomeShape(value)) {
        throw new OutcomeLibraryBundleInvariantError(
            `mode "${modeName}": the record at outcome "${entry.id}"'s own recorded byte range is not {id, weight, artifact}.`,
        );
    }
    if (value.id !== entry.id) {
        throw new OutcomeLibraryBundleInvariantError(
            `mode "${modeName}": the record at outcome "${entry.id}"'s own recorded byte range has id "${value.id}" instead — the index and the outcomes file have drifted out of sync.`,
        );
    }
    if (value.weight !== entry.weight) {
        throw new OutcomeLibraryBundleInvariantError(
            `mode "${modeName}": outcome "${entry.id}"'s weight at its own recorded byte range (${value.weight}) does not match the index's (${entry.weight}) — the index and the outcomes file have drifted out of sync.`,
        );
    }
    const actualRecordHash = `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
    if (actualRecordHash !== entry.recordHash) {
        throw new OutcomeLibraryBundleInvariantError(
            `mode "${modeName}": outcome "${entry.id}"'s own recorded byte range hashes to "${actualRecordHash}", not the index's recorded "${entry.recordHash}" — its content has changed since the index was built.`,
        );
    }

    return value as unknown as WeightedOutcome<T>;
}
