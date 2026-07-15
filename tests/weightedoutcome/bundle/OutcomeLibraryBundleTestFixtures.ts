import {
    RoundArtifact,
    RoundArtifactProvenance,
    ValueWinComponent,
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

// A small library with integer weights (required for drawOutcome/WeightedOutcomeSelector's exact-integer draw —
// see selectIndexEntryByCumulativeWeight's own doc comment) and enough outcomes to meaningfully exercise
// sorting/binary-search/cumulative-weight logic, not just a single-outcome edge case.
export function buildOutcomeLibraryBundleTestLibrary(libraryId: string): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({
        libraryId,
        outcomes: [
            {id: "0", weight: 500, artifact: outcomeArtifact(`${libraryId}-0`, 0)},
            {id: "1", weight: 300, artifact: outcomeArtifact(`${libraryId}-1`, 2)},
            {id: "2", weight: 150, artifact: outcomeArtifact(`${libraryId}-2`, 5)},
            {id: "3", weight: 40, artifact: outcomeArtifact(`${libraryId}-3`, 10)},
            {id: "4", weight: 10, artifact: outcomeArtifact(`${libraryId}-4`, 100)},
        ],
    });
}
