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

export const stakeEngineTestProvenance: RoundArtifactProvenance = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    pokieVersion: "1.3.0",
};

function winEvaluationResultFor(totalWin: number): WinEvaluationResult<string> {
    return totalWin === 0
        ? new WinEvaluationResult<string>()
        : new WinEvaluationResult<string>({valueWins: [new ValueWinComponent<string>(new WinningValue<string>("A", [[0, 0]], totalWin))]});
}

// A single-step artifact. "totalWin" is always chosen as a multiple of "stake" by the fixtures below, so
// payoutMultiplier (totalWin / stake) stays a whole number, as StakeEngineExportValidator requires.
function stakeEngineArtifact(options: {roundId: string; totalWin: number; stake: number; betMode: string}): RoundArtifact<string> {
    return buildRoundArtifact({
        roundId: options.roundId,
        provenance: stakeEngineTestProvenance,
        betMode: options.betMode,
        stake: options.stake,
        steps: [{screen: [["A"]], winEvaluationResult: winEvaluationResultFor(options.totalWin)}],
    });
}

// A two-step artifact (mirrors a cascade/bonus-trigger round) with a step-level feature event and a round-level
// feature event, so StakeEngineRoundEventsProjector's passthrough of both is actually exercised end-to-end.
function stakeEngineMultiStepArtifact(options: {roundId: string; stake: number; betMode: string; stepTotalWins: readonly [number, number]}): RoundArtifact<string> {
    return buildRoundArtifact({
        roundId: options.roundId,
        provenance: stakeEngineTestProvenance,
        betMode: options.betMode,
        stake: options.stake,
        steps: [
            {
                screen: [["A"]],
                winEvaluationResult: winEvaluationResultFor(options.stepTotalWins[0]),
                featureEvents: [{type: "cascadeStep", data: {step: 0}}],
            },
            {screen: [["B"]], winEvaluationResult: winEvaluationResultFor(options.stepTotalWins[1])},
        ],
        featureEvents: [{type: "freeGamesTriggered", data: {count: 10}}],
    });
}

// A small, hand-computable WeightedOutcomeLibrary for one Stake mode: a loss, a plain win, and a multi-step win
// with feature events — ids/weights/payoutMultipliers are all already Stake-Engine-integer-safe.
export function buildStakeEngineTestLibrary(options: {libraryId: string; betMode: string; stake: number}): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({
        libraryId: options.libraryId,
        outcomes: [
            {
                id: "0",
                weight: 970,
                artifact: stakeEngineArtifact({roundId: `${options.libraryId}-0`, totalWin: 0, stake: options.stake, betMode: options.betMode}),
            },
            {
                id: "1",
                weight: 25,
                artifact: stakeEngineArtifact({roundId: `${options.libraryId}-1`, totalWin: options.stake * 2, stake: options.stake, betMode: options.betMode}),
            },
            {
                id: "2",
                weight: 5,
                artifact: stakeEngineMultiStepArtifact({
                    roundId: `${options.libraryId}-2`,
                    stake: options.stake,
                    betMode: options.betMode,
                    stepTotalWins: [options.stake, options.stake * 4],
                }),
            },
        ],
    });
}
