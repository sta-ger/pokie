import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";
import {resolveSafeStakeEngineFilePath} from "../../stakeengine/internal/resolveSafeStakeEngineFilePath.js";
import type {WeightedOutcome} from "../../weightedoutcome/WeightedOutcome.js";
import type {OutcomeLibraryFolderIndexEntry, OutcomeLibraryFolderModeIndex} from "../../weightedoutcome/folder/OutcomeLibraryFolderModeIndex.js";
import type {OutcomeLibraryFolderReading} from "../../weightedoutcome/folder/OutcomeLibraryFolderReading.js";
import {readAndVerifyOutcomeAtByteRange} from "../../weightedoutcome/folder/internal/readOutcomeAtByteRange.js";
import {selectIndexEntryByCumulativeWeight} from "../../weightedoutcome/folder/internal/selectIndexEntryByCumulativeWeight.js";
import {computeFairnessIndexHash} from "../computeFairnessIndexHash.js";
import {FairnessBundleDriftError} from "./FairnessBundleDriftError.js";
import {isValidModeName} from "./fairnessShapeGuards.js";
import {FairnessModeIndexInvalidError} from "./FairnessModeIndexInvalidError.js";
import {validatePinnedFairnessModeIndex} from "./validatePinnedFairnessModeIndex.js";

export type PinnedFairnessDraw<T extends string | number = string> = {
    readonly index: OutcomeLibraryFolderModeIndex;
    readonly indexHash: string;
    readonly entry: OutcomeLibraryFolderIndexEntry;
    readonly outcome: WeightedOutcome<T>;
};

// The one shared pinned-snapshot draw FairnessRoundProofBuilder and FairnessRoundProofVerifier both use — same
// "no second calculation path" discipline CertificationPackBuilder's own "Pinned-snapshot sampling"
// already follows (see that class's own doc comment):
//
// 0. modeName is checked against this bundle format's own canonical rule ([A-Za-z0-9_-]+) BEFORE any file is
//    read at all — modeName ultimately comes from an untrusted FairnessCommitment/FairnessRoundProof, and both
//    FairnessCommitmentValidating/FairnessRoundProofValidating already enforce this same rule (see
//    fairnessShapeGuards), so this is a redundant, defense-in-depth check for any caller that somehow invokes
//    this function directly without going through either validator first — never the only place it's enforced.
// 1. a mode's own index is read exactly ONCE and validated via validatePinnedFairnessModeIndex — never trusted
//    blindly (OutcomeLibraryFolderReader.readModeIndex itself does no runtime shape checking at all) — then held
//    in memory, and everything below is computed directly against that one, now-validated snapshot;
// 2. a winning index entry is selected via selectIndexEntryByCumulativeWeight against the captured index's own
//    entries (the exact cumulative-weight walk OutcomeLibraryFolderReader.drawOutcome uses internally);
// 3. that exact entry's own byte range is read and verified via readAndVerifyOutcomeAtByteRange — against a path
//    resolved via resolveSafeStakeEngineFilePath, never a plain path.join of index.outcomesFile: even though
//    validatePinnedFairnessModeIndex already pins outcomesFile to the one exact, self-constructed filename this
//    bundle format's own convention allows, resolving it through the same safe-path helper every other
//    bundle-reading class in this codebase uses is a second, independent guard against ever opening a path
//    outside sourceLibraryDir.
//
// Deliberately never calls OutcomeLibraryFolderReading.drawOutcome itself: that method re-reads a fresh index on
// every single call, which could observe a genuinely different index between selecting an entry and reading it —
// a live TOCTOU-shaped gap this function closes by capturing the index exactly once up front.
//
// Bundle-drift check: after the byte-range read (and before ever returning anything to a caller), the mode's own
// index is read a SECOND time and re-hashed via computeFairnessIndexHash — the whole object, not just one field
// like libraryHash, which a hand-tampered index could leave stale while its entries were rewritten underneath it.
// Any difference from the first hash throws FairnessBundleDriftError: the snapshot this selection/read was
// computed against no longer reflects the live bundle, so nothing built or verified from it can be trusted either
// (the same "no partial output" discipline CertificationPackBuilder's own snapshot-consistency check
// follows, just synchronous and single-outcome rather than deferred to just-before-publish). The second read
// isn't independently re-validated by validatePinnedFairnessModeIndex: its content is only ever used to compute
// a hash for comparison, and a hash match with the already-validated first read implies matching (and therefore
// equally valid) content either way.
export async function drawPinnedFairnessOutcome<T extends string | number = string>(
    reader: OutcomeLibraryFolderReading<T>,
    sourceLibraryDir: string,
    modeName: string,
    randomSource: WeightedOutcomeRandomSource,
): Promise<PinnedFairnessDraw<T>> {
    if (!isValidModeName(modeName)) {
        throw new FairnessModeIndexInvalidError(`modeName "${modeName}" does not match this bundle format's own naming convention ([A-Za-z0-9_-]+) — refusing to read anything.`);
    }

    const rawIndex: unknown = await reader.readModeIndex(sourceLibraryDir, modeName);
    const index = validatePinnedFairnessModeIndex(rawIndex, modeName);
    const indexHash = computeFairnessIndexHash(index);

    const entry = selectIndexEntryByCumulativeWeight(modeName, index.entries, randomSource);

    const outcomesPath = resolveSafeStakeEngineFilePath(sourceLibraryDir, index.outcomesFile);
    if (outcomesPath === undefined) {
        // Unreachable given validatePinnedFairnessModeIndex's own exact-filename check just above (a filename
        // pinned to "outcomes_<modeName>.jsonl", with modeName already confirmed to match [A-Za-z0-9_-]+, can
        // never resolve unsafely) — a defensive backstop, not the primary place this is enforced.
        throw new FairnessModeIndexInvalidError(`mode "${modeName}"'s own outcomesFile "${index.outcomesFile}" does not resolve safely inside "${sourceLibraryDir}".`);
    }
    const outcome = readAndVerifyOutcomeAtByteRange<T>(modeName, outcomesPath, entry);

    let rawIndexAfterRead: unknown;
    try {
        rawIndexAfterRead = await reader.readModeIndex(sourceLibraryDir, modeName);
    } catch (error) {
        throw new FairnessBundleDriftError(
            `mode "${modeName}"'s own index in "${sourceLibraryDir}" could no longer be read after its outcome was drawn (${error instanceof Error ? error.message : String(error)}); refusing to use a possibly-inconsistent snapshot.`,
        );
    }
    if (computeFairnessIndexHash(rawIndexAfterRead as OutcomeLibraryFolderModeIndex) !== indexHash) {
        throw new FairnessBundleDriftError(
            `mode "${modeName}"'s own index in "${sourceLibraryDir}" changed while its outcome was being drawn; refusing to use a possibly-inconsistent snapshot.`,
        );
    }

    return {index, indexHash, entry, outcome};
}
