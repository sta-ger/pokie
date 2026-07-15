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

// A single-step artifact. "totalWin"/"stake" are chosen by each fixture below so that payoutMultiplier
// (totalWin / stake), once converted to Stake units (* cost * 100), lands on a whole number for the mode costs
// these fixtures are actually exported with in the tests that use them.
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

// A single-outcome library — the simplest fixture for exercising a specific payoutMultiplier/cost combination
// (e.g. the exact Stake-unit-conversion examples in docs/stake-engine-export.md).
export function buildSingleOutcomeStakeEngineLibrary(options: {libraryId: string; betMode: string; stake: number; totalWin: number}): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({
        libraryId: options.libraryId,
        outcomes: [
            {
                id: "0",
                weight: 1,
                artifact: stakeEngineArtifact({roundId: `${options.libraryId}-0`, totalWin: options.totalWin, stake: options.stake, betMode: options.betMode}),
            },
        ],
    });
}

// A small, hand-computable WeightedOutcomeLibrary for one Stake mode: a loss, a plain win, and a multi-step win
// with feature events — ids/weights are all Stake-Engine-integer-safe, and payoutMultipliers are chosen to stay
// exact once converted to Stake units at cost 1 or cost 100 (the only costs the tests using this fixture use).
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
