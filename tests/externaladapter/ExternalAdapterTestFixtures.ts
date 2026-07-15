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

export const externalAdapterTestProvenance: RoundArtifactProvenance = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    pokieVersion: "1.3.0",
};

function winEvaluationResultFor(totalWin: number): WinEvaluationResult<string> {
    return totalWin === 0
        ? new WinEvaluationResult<string>()
        : new WinEvaluationResult<string>({valueWins: [new ValueWinComponent<string>(new WinningValue<string>("A", [[0, 0]], totalWin))]});
}

function numericWinEvaluationResultFor(totalWin: number): WinEvaluationResult<number> {
    return totalWin === 0
        ? new WinEvaluationResult<number>()
        : new WinEvaluationResult<number>({valueWins: [new ValueWinComponent<number>(new WinningValue<number>(1, [[0, 0]], totalWin))]});
}

// A plain, string-symbol, single-step artifact with no feature events/debug — the baseline every capability
// test starts from before toggling one specific thing on.
export function externalAdapterArtifact(options: {roundId: string; totalWin: number; stake: number; betMode?: string; pokieVersion?: string}): RoundArtifact<string> {
    return buildRoundArtifact({
        roundId: options.roundId,
        provenance: options.pokieVersion !== undefined ? {...externalAdapterTestProvenance, pokieVersion: options.pokieVersion} : externalAdapterTestProvenance,
        betMode: options.betMode ?? "base",
        stake: options.stake,
        steps: [{screen: [["A"]], winEvaluationResult: winEvaluationResultFor(options.totalWin)}],
    });
}

// Same as externalAdapterArtifact, but carries a round-level feature event — used to exercise
// ROUND_ARTIFACT_FEATURE_EVENTS_CAPABILITY gating.
export function externalAdapterArtifactWithFeatureEvent(options: {roundId: string; totalWin: number; stake: number}): RoundArtifact<string> {
    return buildRoundArtifact({
        roundId: options.roundId,
        provenance: externalAdapterTestProvenance,
        betMode: "base",
        stake: options.stake,
        steps: [{screen: [["A"]], winEvaluationResult: winEvaluationResultFor(options.totalWin)}],
        featureEvents: [{type: "bonusTriggered", data: {count: 10}}],
    });
}

// Same as externalAdapterArtifact, but carries round-level debug metadata — used to exercise
// ROUND_ARTIFACT_DEBUG_METADATA_CAPABILITY gating.
export function externalAdapterArtifactWithDebug(options: {roundId: string; totalWin: number; stake: number}): RoundArtifact<string> {
    return buildRoundArtifact({
        roundId: options.roundId,
        provenance: externalAdapterTestProvenance,
        betMode: "base",
        stake: options.stake,
        steps: [{screen: [["A"]], winEvaluationResult: winEvaluationResultFor(options.totalWin)}],
        debug: {rngSeed: "abc123"},
    });
}

// A numeric-symbol artifact — used to exercise a target's requirements.symbolAlphabet: "numeric".
export function numericExternalAdapterArtifact(options: {roundId: string; totalWin: number; stake: number}): RoundArtifact<number> {
    return buildRoundArtifact<number>({
        roundId: options.roundId,
        provenance: externalAdapterTestProvenance,
        betMode: "base",
        stake: options.stake,
        steps: [{screen: [[1]], winEvaluationResult: numericWinEvaluationResultFor(options.totalWin)}],
    });
}

// A small, hand-computable single-mode library: a loss and a plain win — enough for compatibility/generation
// tests that don't care about exact payout math.
export function externalAdapterTestLibrary(options: {libraryId: string; betMode?: string; stake?: number}): WeightedOutcomeLibrary<string> {
    const stake = options.stake ?? 1;
    return buildWeightedOutcomeLibrary({
        libraryId: options.libraryId,
        outcomes: [
            {id: "loss", weight: 9, artifact: externalAdapterArtifact({roundId: `${options.libraryId}-0`, totalWin: 0, stake, betMode: options.betMode})},
            {id: "win", weight: 1, artifact: externalAdapterArtifact({roundId: `${options.libraryId}-1`, totalWin: stake * 2, stake, betMode: options.betMode})},
        ],
    });
}
