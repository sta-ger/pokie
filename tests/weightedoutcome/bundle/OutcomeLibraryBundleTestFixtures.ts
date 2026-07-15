import {
    OutcomeLibraryBundleModeInput,
    RoundArtifact,
    RoundArtifactProvenance,
    ValueWinComponent,
    WeightedOutcomeInput,
    WeightedOutcomeLibrary,
    WinEvaluationResult,
    WinningValue,
    buildRoundArtifact,
    buildWeightedOutcomeLibrary,
} from "pokie";

export const outcomeLibraryBundleTestProvenance: RoundArtifactProvenance = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    pokieVersion: "1.3.0",
};

function winEvaluationResultFor(totalWin: number): WinEvaluationResult<string> {
    return totalWin === 0
        ? new WinEvaluationResult<string>()
        : new WinEvaluationResult<string>({valueWins: [new ValueWinComponent<string>(new WinningValue<string>("A", [[0, 0]], totalWin))]});
}

function outcomeArtifact(roundId: string, totalWin: number): RoundArtifact<string> {
    return buildRoundArtifact({
        roundId,
        provenance: outcomeLibraryBundleTestProvenance,
        betMode: "base",
        stake: 1,
        steps: [{screen: [["A"]], winEvaluationResult: winEvaluationResultFor(totalWin)}],
    });
}

// Five outcomes with integer weights (required for drawOutcome/WeightedOutcomeSelector's exact-integer draw —
// see selectIndexEntryByCumulativeWeight's own doc comment), enough to meaningfully exercise sorting/binary-
// search/cumulative-weight logic, not just a single-outcome edge case. Shared by both fixture shapes below so a
// test comparing "streamed through the writer" against "built the ordinary, in-memory way" is comparing the
// exact same underlying outcomes either way.
function testOutcomes(libraryId: string): WeightedOutcomeInput<string>[] {
    return [
        {id: "0", weight: 500, artifact: outcomeArtifact(`${libraryId}-0`, 0)},
        {id: "1", weight: 300, artifact: outcomeArtifact(`${libraryId}-1`, 2)},
        {id: "2", weight: 150, artifact: outcomeArtifact(`${libraryId}-2`, 5)},
        {id: "3", weight: 40, artifact: outcomeArtifact(`${libraryId}-3`, 10)},
        {id: "4", weight: 10, artifact: outcomeArtifact(`${libraryId}-4`, 100)},
    ];
}

// The ordinary, fully in-memory way to build the same library — used as the "known-good" oracle a streamed
// bundle's own hash/analysis/outcomes are cross-checked against.
export function buildOutcomeLibraryBundleTestLibrary(libraryId: string): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({libraryId, outcomes: testOutcomes(libraryId)});
}

// The streaming-source shape OutcomeLibraryBundleWriter actually accepts — a plain array is already a valid
// Iterable, so this is usable as-is; tests that want genuine async streaming wrap it in an async generator
// themselves (see OutcomeLibraryBundleWriter.test.ts's own asyncOutcomes() helper).
export function buildOutcomeLibraryBundleModeInput(modeName: string, libraryId: string): OutcomeLibraryBundleModeInput<string> {
    return {modeName, libraryId, outcomes: testOutcomes(libraryId)};
}
