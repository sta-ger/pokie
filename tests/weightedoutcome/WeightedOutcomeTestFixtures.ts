import {
    RoundArtifact,
    RoundArtifactProvenance,
    ValueWinComponent,
    WinEvaluationResult,
    WinningValue,
    buildRoundArtifact,
} from "pokie";

export const testProvenance: RoundArtifactProvenance = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    pokieVersion: "1.3.0",
};

// A single-step RoundArtifact with an exact, hand-specified totalWin (stake fixed at 1, so payoutMultiplier
// equals totalWin exactly) — used across the weightedoutcome test suite to build small, hand-computable
// libraries without depending on real reel/paytable randomness.
export function artifactWithTotalWin(roundId: string, totalWin: number): RoundArtifact<string> {
    const winEvaluationResult =
        totalWin === 0
            ? new WinEvaluationResult<string>()
            : new WinEvaluationResult<string>({
                valueWins: [new ValueWinComponent<string>(new WinningValue<string>("A", [[0, 0]], totalWin))],
            });

    return buildRoundArtifact({
        roundId,
        provenance: testProvenance,
        stake: 1,
        steps: [{screen: [["A"]], winEvaluationResult}],
    });
}
