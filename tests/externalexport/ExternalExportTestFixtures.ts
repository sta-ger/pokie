import {
    RoundRecord,
    RoundRecordOrigin,
    ValueWinComponent,
    WeightedOutcomeLibrary,
    WinEvaluationResult,
    WinningValue,
    buildRoundRecord,
    buildWeightedOutcomeLibrary,
} from "@fromstan/pokie";

export const externalExportTestOrigin: RoundRecordOrigin = {
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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

// A plain, string-symbol, single-step record with no feature events/debug — the baseline every capability
// test starts from before toggling one specific thing on.
export function externalExportRecord(options: {roundId: string; totalWin: number; stake: number; betMode?: string; pokieVersion?: string}): RoundRecord<string> {
    return buildRoundRecord({
        roundId: options.roundId,
        origin: options.pokieVersion !== undefined ? {...externalExportTestOrigin, pokieVersion: options.pokieVersion} : externalExportTestOrigin,
        betMode: options.betMode ?? "base",
        stake: options.stake,
        steps: [{screen: [["A"]], winEvaluationResult: winEvaluationResultFor(options.totalWin)}],
    });
}

// Same as externalExportRecord, but carries a round-level feature event — used to exercise
// ROUND_RECORD_FEATURE_EVENTS_CAPABILITY gating.
export function externalExportRecordWithFeatureEvent(options: {roundId: string; totalWin: number; stake: number}): RoundRecord<string> {
    return buildRoundRecord({
        roundId: options.roundId,
        origin: externalExportTestOrigin,
        betMode: "base",
        stake: options.stake,
        steps: [{screen: [["A"]], winEvaluationResult: winEvaluationResultFor(options.totalWin)}],
        featureEvents: [{type: "bonusTriggered", data: {count: 10}}],
    });
}

// Same as externalExportRecord, but carries round-level debug metadata — used to exercise
// ROUND_RECORD_DEBUG_METADATA_CAPABILITY gating.
export function externalExportRecordWithDebug(options: {roundId: string; totalWin: number; stake: number}): RoundRecord<string> {
    return buildRoundRecord({
        roundId: options.roundId,
        origin: externalExportTestOrigin,
        betMode: "base",
        stake: options.stake,
        steps: [{screen: [["A"]], winEvaluationResult: winEvaluationResultFor(options.totalWin)}],
        debug: {rngSeed: "abc123"},
    });
}

// A numeric-symbol record — used to exercise a target's requirements.symbolAlphabet: "numeric".
export function numericExternalExportRecord(options: {roundId: string; totalWin: number; stake: number}): RoundRecord<number> {
    return buildRoundRecord<number>({
        roundId: options.roundId,
        origin: externalExportTestOrigin,
        betMode: "base",
        stake: options.stake,
        steps: [{screen: [[1]], winEvaluationResult: numericWinEvaluationResultFor(options.totalWin)}],
    });
}

// A small, hand-computable single-mode library: a loss and a plain win — enough for compatibility/generation
// tests that don't care about exact payout math.
export function externalExportTestLibrary(options: {libraryId: string; betMode?: string; stake?: number}): WeightedOutcomeLibrary<string> {
    const stake = options.stake ?? 1;
    return buildWeightedOutcomeLibrary({
        libraryId: options.libraryId,
        outcomes: [
            {id: "loss", weight: 9, record: externalExportRecord({roundId: `${options.libraryId}-0`, totalWin: 0, stake, betMode: options.betMode})},
            {id: "win", weight: 1, record: externalExportRecord({roundId: `${options.libraryId}-1`, totalWin: stake * 2, stake, betMode: options.betMode})},
        ],
    });
}
