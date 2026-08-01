import {buildWeightedOutcomeLibrary, WeightedOutcomeLibrary, WeightedOutcomeLibraryBuildError} from "pokie";

const CANONICAL_NON_NEGATIVE_INTEGER = /^(0|[1-9]\d*)$/;

export type CanonicalizedOutcomeIds =
    | {readonly status: "ok"; readonly library: WeightedOutcomeLibrary<string>}
    | {readonly status: "error"; readonly message: string};

// Stake Engine requires every WeightedOutcome.id to already be the canonical decimal form of a safe
// non-negative integer (see docs/stake-engine-export.md's "Stake unit conversion" section) -- a
// constraint the canonical outcome-library generator's own ids (content-addressed, see
// generateExactWeightedOutcomeLibrary's own outcomeIdForGrid) never satisfy on their own.
// StakeEngineExporter/StakeEngineExportValidator deliberately never paper over this themselves (see
// parseStakeEngineOutcomeId's own doc comment: rather than invent a mapping there, they require the
// string to already be canonical) -- so this Studio Stake Export integration boundary, and only this
// boundary, is where that translation happens: a source library whose ids aren't already
// Stake-compatible is deterministically relabeled before it ever reaches the exporter.
//
// Each outcome keeps its own weight/artifact (and therefore its own provenance) completely untouched --
// only the outer `id` changes -- and is assigned "0", "1", ... by its own position in the library's
// already-canonical (sorted-by-id) order. That order is itself a pure function of the same
// game/config/pokieVersion generation is always deterministic against, so the exact same generated
// library is always relabeled the exact same way, never an incidentally-diverging mapping. A library
// whose ids are already Stake-compatible (a hand-authored JSON library, or one re-imported from a
// previous Stake Engine export) is returned unchanged -- this never overwrites ids that already satisfy
// Stake's own contract.
//
// Never throws: rebuilding with new ids reuses weight/artifact values that already passed
// buildWeightedOutcomeLibrary once (when the source library was first built), so a WeightedOutcomeLibraryBuildError
// here would mean this library was never actually valid in the first place -- reported as a domain-level
// error rather than left to propagate as a raw thrown error.
export function canonicalizeOutcomeIdsForStakeEngine(library: WeightedOutcomeLibrary<string>): CanonicalizedOutcomeIds {
    if (library.outcomes.every((outcome) => CANONICAL_NON_NEGATIVE_INTEGER.test(outcome.id))) {
        return {status: "ok", library};
    }

    try {
        const canonicalized = buildWeightedOutcomeLibrary<string>({
            libraryId: library.libraryId,
            schemaVersion: library.schemaVersion,
            outcomes: library.outcomes.map((outcome, index) => ({
                id: String(index),
                weight: outcome.weight,
                artifact: outcome.artifact,
            })),
        });
        return {status: "ok", library: canonicalized};
    } catch (error) {
        return {
            status: "error",
            message:
                error instanceof WeightedOutcomeLibraryBuildError
                    ? error.message
                    : `Could not relabel outcome ids for Stake Engine export: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
