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

function winEvaluationResultFor(totalWin: number): WinEvaluationResult<string> {
    return totalWin === 0
        ? new WinEvaluationResult<string>()
        : new WinEvaluationResult<string>({
            valueWins: [new ValueWinComponent<string>(new WinningValue<string>("A", [[0, 0]], totalWin))],
        });
}

// A single-step RoundArtifact, with everything overridable — stake fixed at 1 by default, so payoutMultiplier
// equals totalWin exactly unless a different stake is given. Used across the weightedoutcome test suite to
// build small, hand-computable artifacts without depending on real reel/paytable randomness.
export function artifactWith(options: {
    roundId: string;
    totalWin: number;
    stake?: number;
    betMode?: string;
    provenance?: RoundArtifactProvenance;
}): RoundArtifact<string> {
    return buildRoundArtifact({
        roundId: options.roundId,
        provenance: options.provenance ?? testProvenance,
        betMode: options.betMode,
        stake: options.stake ?? 1,
        steps: [{screen: [["A"]], winEvaluationResult: winEvaluationResultFor(options.totalWin)}],
    });
}

export function artifactWithTotalWin(roundId: string, totalWin: number): RoundArtifact<string> {
    return artifactWith({roundId, totalWin});
}
