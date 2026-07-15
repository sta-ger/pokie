import path from "path";
import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";
import type {WeightedOutcome} from "../../weightedoutcome/WeightedOutcome.js";
import type {OutcomeLibraryBundleIndexEntry, OutcomeLibraryBundleModeIndex} from "../../weightedoutcome/bundle/OutcomeLibraryBundleModeIndex.js";
import type {OutcomeLibraryBundleReading} from "../../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import {readAndVerifyOutcomeAtByteRange} from "../../weightedoutcome/bundle/internal/readOutcomeAtByteRange.js";
import {selectIndexEntryByCumulativeWeight} from "../../weightedoutcome/bundle/internal/selectIndexEntryByCumulativeWeight.js";
import {computeFairnessIndexHash} from "../computeFairnessIndexHash.js";
import {FairnessBundleDriftError} from "./FairnessBundleDriftError.js";

export type PinnedFairnessDraw<T extends string | number = string> = {
    readonly index: OutcomeLibraryBundleModeIndex;
    readonly indexHash: string;
    readonly entry: OutcomeLibraryBundleIndexEntry;
    readonly outcome: WeightedOutcome<T>;
};

// The one shared pinned-snapshot draw FairnessRoundProofBuilder and FairnessRoundProofVerifier both use — same
// "no second calculation path" discipline CertificationEvidenceBundleBuilder's own "Pinned-snapshot sampling"
// already follows (see that class's own doc comment): a mode's own index is read exactly ONCE, held in memory,
// and everything below is computed directly against that one snapshot —
//
// 1. selects a winning index entry via selectIndexEntryByCumulativeWeight against the captured index's own
//    entries (the exact cumulative-weight walk OutcomeLibraryBundleReader.drawOutcome uses internally);
// 2. reads and verifies that exact entry's own byte range via readAndVerifyOutcomeAtByteRange (the same
//    byte-range read + recordHash check readOutcomeById/drawOutcome themselves rely on).
//
// Deliberately never calls OutcomeLibraryBundleReading.drawOutcome itself: that method re-reads a fresh index on
// every single call, which could observe a genuinely different index between selecting an entry and reading it —
// a live TOCTOU-shaped gap this function closes by capturing the index exactly once up front.
//
// Bundle-drift check: after the byte-range read (and before ever returning anything to a caller), the mode's own
// index is read a SECOND time and re-hashed via computeFairnessIndexHash — the whole object, not just one field
// like libraryHash, which a hand-tampered index could leave stale while its entries were rewritten underneath it.
// Any difference from the first hash throws FairnessBundleDriftError: the snapshot this selection/read was
// computed against no longer reflects the live bundle, so nothing built or verified from it can be trusted either
// (the same "no partial artifact" discipline CertificationEvidenceBundleBuilder's own snapshot-consistency check
// follows, just synchronous and single-outcome rather than deferred to just-before-publish).
export async function drawPinnedFairnessOutcome<T extends string | number = string>(
    reader: OutcomeLibraryBundleReading<T>,
    sourceBundleDir: string,
    modeName: string,
    randomSource: WeightedOutcomeRandomSource,
): Promise<PinnedFairnessDraw<T>> {
    const index = await reader.readModeIndex(sourceBundleDir, modeName);
    const indexHash = computeFairnessIndexHash(index);

    const entry = selectIndexEntryByCumulativeWeight(modeName, index.entries, randomSource);
    const outcomesPath = path.join(sourceBundleDir, index.outcomesFile);
    const outcome = readAndVerifyOutcomeAtByteRange<T>(modeName, outcomesPath, entry);

    let indexAfterRead: OutcomeLibraryBundleModeIndex;
    try {
        indexAfterRead = await reader.readModeIndex(sourceBundleDir, modeName);
    } catch (error) {
        throw new FairnessBundleDriftError(
            `mode "${modeName}"'s own index in "${sourceBundleDir}" could no longer be read after its outcome was drawn (${error instanceof Error ? error.message : String(error)}); refusing to use a possibly-inconsistent snapshot.`,
        );
    }
    if (computeFairnessIndexHash(indexAfterRead) !== indexHash) {
        throw new FairnessBundleDriftError(
            `mode "${modeName}"'s own index in "${sourceBundleDir}" changed while its outcome was being drawn; refusing to use a possibly-inconsistent snapshot.`,
        );
    }

    return {index, indexHash, entry, outcome};
}
