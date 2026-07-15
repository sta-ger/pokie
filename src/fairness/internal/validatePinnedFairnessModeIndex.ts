import {isPositiveSafeInteger} from "../../pregenerated/internal/isPositiveSafeInteger.js";
import {compareIds} from "../../weightedoutcome/internal/compareIds.js";
import {OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION, type OutcomeLibraryBundleIndexEntry, type OutcomeLibraryBundleModeIndex} from "../../weightedoutcome/bundle/OutcomeLibraryBundleModeIndex.js";
import {WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION} from "../../weightedoutcome/WeightedOutcomeLibrary.js";
import {FairnessModeIndexInvalidError} from "./FairnessModeIndexInvalidError.js";

const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

const MODE_INDEX_KEYS = new Set(["schemaVersion", "modeName", "libraryId", "librarySchemaVersion", "libraryHash", "outcomeCount", "totalWeight", "outcomesFile", "entries"]);
const ENTRY_KEYS = new Set(["id", "weight", "byteOffset", "byteLength", "recordHash"]);

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isValidSha256Hash(value: unknown): value is string {
    return typeof value === "string" && SHA256_HASH_PATTERN.test(value);
}

// Validates a pinned OutcomeLibraryBundleModeIndex — already read off disk, already the ONE snapshot
// drawPinnedFairnessOutcome will select/read against — before it's ever trusted for selection or a byte-range
// read. OutcomeLibraryBundleReader.readModeIndex itself does no runtime shape validation at all (a raw
// JSON.parse + type-cast: whatever bytes happen to be at index_<modeName>.json are trusted as-is), so an
// untrusted, malformed, or hand-tampered index would otherwise be trusted blindly by a live draw — a materially
// different risk than OutcomeLibraryBundleValidator's own thorough checks, which only ever run as an opt-in,
// offline audit of a bundle someone already chose to inspect.
//
// Throws FairnessModeIndexInvalidError — a single, fail-fast diagnostic, not a ValidationIssue[] collector, since
// this runs on every live draw rather than as a standalone "validate a whole directory" tool (see
// OutcomeLibraryBundleValidator for that) — on the first violation found:
// - a closed shape (an extra, unexpected top-level field is exactly as invalid as a missing one);
// - the current schemaVersion/librarySchemaVersion (an index from an unsupported/future bundle format is
//   refused rather than guessed at);
// - index.modeName matching the modeName this index was read FOR (never trusting a mismatched index to silently
//   stand in for the one actually requested);
// - a positive safe outcomeCount/totalWeight, and a non-empty libraryId/libraryHash;
// - index.outcomesFile matching this bundle format's own naming convention EXACTLY ("outcomes_<modeName>.jsonl")
//   — never just "a safe-looking string": this is what makes drawPinnedFairnessOutcome's own later path
//   resolution (resolveSafeStakeEngineFilePath, never a plain path.join of an attacker-influenced field) provably
//   safe, since the one value it ever resolves is this exact, self-constructed filename;
// - every entry's own closed shape ({id, weight, byteOffset, byteLength, recordHash} exactly — an unknown,
//   smuggled-in field on one entry is exactly as invalid as a missing one), uniqueness, and canonical
//   (sorted-by-id) order, and that outcomeCount/totalWeight actually match the entries themselves — the same
//   invariants OutcomeLibraryBundleValidator.validateEntries enforces for a standalone bundle audit, reapplied
//   here since a live draw can never assume an index it just read is trustworthy without checking;
// - a canonical byte layout across all entries — the first entry's byteOffset is exactly 0, and every later
//   entry's byteOffset is exactly the previous entry's own byteOffset + byteLength + 1 (the "+1" accounts for
//   the trailing "\n" every record is written with — see streamModeOutcomesToTempFile's own "offset +=
//   lineBuffer.byteLength + 1"), so ranges can never overlap or leave a gap; byteOffset + byteLength is also
//   checked to never overflow a safe integer. Mirrors (a cheaper, no-file-I/O subset of)
//   OutcomeLibraryBundleValidator.validateByteLayout's own contiguity check — this one only ever checks the
//   index's own internal arithmetic, never the outcomes file's actual on-disk size, since the one entry a live
//   draw actually reads is independently byte-verified anyway (readAndVerifyOutcomeAtByteRange, called right
//   after this function returns).
export function validatePinnedFairnessModeIndex(index: unknown, expectedModeName: string): OutcomeLibraryBundleModeIndex {
    if (typeof index !== "object" || index === null || Object.keys(index).some((key) => !MODE_INDEX_KEYS.has(key))) {
        throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index does not match the expected OutcomeLibraryBundleModeIndex shape.`);
    }
    const candidate = index as Record<string, unknown>;

    if (candidate.schemaVersion !== OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION) {
        throw new FairnessModeIndexInvalidError(
            `mode "${expectedModeName}"'s own index has schemaVersion ${String(candidate.schemaVersion)}, expected ${OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION}.`,
        );
    }
    if (candidate.librarySchemaVersion !== WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION) {
        throw new FairnessModeIndexInvalidError(
            `mode "${expectedModeName}"'s own index has librarySchemaVersion ${String(candidate.librarySchemaVersion)}, expected ${WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION}.`,
        );
    }
    if (candidate.modeName !== expectedModeName) {
        throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index has modeName "${String(candidate.modeName)}", which does not match the requested mode.`);
    }
    if (!isNonEmptyString(candidate.libraryId)) {
        throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index has an invalid libraryId.`);
    }
    if (!isValidSha256Hash(candidate.libraryHash)) {
        throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index has an invalid libraryHash.`);
    }
    if (!isPositiveSafeInteger(candidate.outcomeCount)) {
        throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index has an invalid outcomeCount.`);
    }
    if (!isPositiveSafeInteger(candidate.totalWeight)) {
        throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index has an invalid totalWeight.`);
    }

    const expectedOutcomesFile = `outcomes_${expectedModeName}.jsonl`;
    if (candidate.outcomesFile !== expectedOutcomesFile) {
        throw new FairnessModeIndexInvalidError(
            `mode "${expectedModeName}"'s own index has outcomesFile "${String(candidate.outcomesFile)}", expected exactly "${expectedOutcomesFile}".`,
        );
    }

    if (!Array.isArray(candidate.entries) || candidate.entries.length === 0) {
        throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index has no entries.`);
    }

    const seenIds = new Set<string>();
    let previousId: string | undefined;
    let totalWeight = 0;
    let expectedByteOffset = 0;
    candidate.entries.forEach((rawEntry: unknown, position: number) => {
        if (typeof rawEntry !== "object" || rawEntry === null || Object.keys(rawEntry).some((key) => !ENTRY_KEYS.has(key))) {
            throw new FairnessModeIndexInvalidError(
                `mode "${expectedModeName}"'s own index entry at position ${position} does not match the expected closed shape {id, weight, byteOffset, byteLength, recordHash}.`,
            );
        }
        const entry = rawEntry as Partial<OutcomeLibraryBundleIndexEntry>;
        if (
            !isNonEmptyString(entry.id) ||
            !isPositiveSafeInteger(entry.weight) ||
            !isSafeNonNegativeInteger(entry.byteOffset) ||
            !isSafeNonNegativeInteger(entry.byteLength) ||
            entry.byteLength === 0 ||
            !isValidSha256Hash(entry.recordHash)
        ) {
            throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index entry at position ${position} does not match the expected shape.`);
        }
        if (seenIds.has(entry.id)) {
            throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index lists outcome id "${entry.id}" more than once.`);
        }
        seenIds.add(entry.id);
        if (previousId !== undefined && compareIds(previousId, entry.id) > 0) {
            throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index entries are not canonically sorted by id.`);
        }
        previousId = entry.id;

        // Canonical byte layout: the first entry starts at 0, and every later entry starts exactly where the
        // previous one's own range — plus its trailing "\n" — ends, so ranges can never overlap or leave a gap
        // (see this function's own doc comment for why "+1", not just "+0").
        if (entry.byteOffset !== expectedByteOffset) {
            throw new FairnessModeIndexInvalidError(
                `mode "${expectedModeName}"'s own index entry at position ${position} (id "${entry.id}") has byteOffset ${entry.byteOffset}, but the previous entry's own range (plus its trailing newline) ends at ${expectedByteOffset} — ranges must be contiguous, in canonical id order, with no gap or overlap.`,
            );
        }
        const rangeEnd = entry.byteOffset + entry.byteLength;
        if (!Number.isSafeInteger(rangeEnd)) {
            throw new FairnessModeIndexInvalidError(
                `mode "${expectedModeName}"'s own index entry at position ${position} (id "${entry.id}") has byteOffset + byteLength that overflows a safe integer.`,
            );
        }
        expectedByteOffset = rangeEnd + 1;

        totalWeight += entry.weight;
        if (!Number.isSafeInteger(totalWeight)) {
            throw new FairnessModeIndexInvalidError(`mode "${expectedModeName}"'s own index entries' weights overflow a safe integer.`);
        }
    });

    if (candidate.entries.length !== candidate.outcomeCount) {
        throw new FairnessModeIndexInvalidError(
            `mode "${expectedModeName}"'s own index has ${candidate.entries.length} entries, but outcomeCount is ${String(candidate.outcomeCount)}.`,
        );
    }
    if (totalWeight !== candidate.totalWeight) {
        throw new FairnessModeIndexInvalidError(
            `mode "${expectedModeName}"'s own index entries sum to weight ${totalWeight}, but totalWeight is ${String(candidate.totalWeight)}.`,
        );
    }

    return index as OutcomeLibraryBundleModeIndex;
}
