import {observeVideoSlotFeatures} from "../net/videoslot/observeVideoSlotFeatures.js";
import type {RoundRecordStepSource} from "./RoundRecordStepSource.js";
import type {CascadeResultProviding} from "../session/videoslot/cascade/CascadeResultProviding.js";
import {captureScreen} from "../session/captureScreen.js";
import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import {determineStakeAmount} from "../session/determineStakeAmount.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";
import type {WonFreeGamesNumberDetermining} from "../session/WonFreeGamesNumberDetermining.js";
import {buildRoundRecord} from "./buildRoundRecord.js";
import type {RoundRecord} from "./RoundRecord.js";
import type {RoundRecordFeatureEventInput} from "./RoundRecordFeatureEvent.js";
import type {RoundRecordOrigin} from "./RoundRecordOrigin.js";

export type RoundRecordFromSessionOptions = {
    roundId: string;
    origin: RoundRecordOrigin;
    betMode?: string;
    stake?: number;
    debug?: Record<string, unknown>;
};

// Convenience for the common single-step case: builds a RoundRecord straight off a played
// VideoSlotSessionHandling's own current state (its symbols combination + win evaluation result), with no
// second calculation path. "stake", when not given explicitly, is derived via the same determineStakeAmount
// this library already uses for wallet debiting (session.getBet() unless the session feature-detects
// StakeAmountDetermining, e.g. a free-games round that charges nothing) — never inferred here again from
// scratch. A "freeGamesTriggered" feature event is likewise only added when the session feature-detects
// WonFreeGamesNumberDetermining and actually reports a win this round, mirroring the same
// optional-interface pattern (see StakeAmountDetermining's own doc comment for why balance/state is never
// used to infer this).
export function buildRoundRecordFromSession<T extends string | number = string>(
    session: VideoSlotSessionHandling<T>,
    options: RoundRecordFromSessionOptions,
): RoundRecord<T> {
    const geometry = session.getScreenGeometry?.();
    const selections = session.getSequenceSelections?.();
    const selectionEvidence = selections?.length ? {sequenceSelections: selections} : {};
    const coordinateEvidence = geometry && !new ScreenProjection(geometry).isIdentity()
        ? {geometry, generatedScreen: session.getSymbolsCombination().toMatrix()} : {};
    const stake = options.stake ?? determineStakeAmount(session, session.getBet());
    const featureEvents = deriveStandardFeatureEvents(session);

    const cascade = (session as Partial<CascadeResultProviding<T>>).getCascadeResult?.();
    const cascadeSteps = cascade?.getCascadeSteps();
    const terminal = cascade?.getTerminalEvaluation();
    let sources: RoundRecordStepSource<T>[] | undefined;
    if (cascade && terminal) sources = [...(cascadeSteps ?? []).map(step => ({screen: step.getScreen(), winEvaluationResult: step.getWinEvaluationResult(), ...selectionEvidence})), {screen: cascade.getFinalScreen(), winEvaluationResult: terminal, ...selectionEvidence}];
    else if (cascadeSteps?.length) sources = cascadeSteps.map(step => ({screen: step.getScreen(), winEvaluationResult: step.getWinEvaluationResult(), ...selectionEvidence}));
    if (sources?.length && featureEvents.length) sources[sources.length - 1] = {...sources[sources.length - 1], featureEvents};
    const artifact = buildRoundRecord({
        roundId: options.roundId,
        origin: options.origin,
        betMode: options.betMode,
        stake,
        debug: options.debug,
        steps: sources ?? [
            {
                screen: captureScreen(session) as T[][],
                ...coordinateEvidence,
                ...selectionEvidence,
                winEvaluationResult: session.getWinEvaluationResult(),
                ...(featureEvents.length > 0 ? {featureEvents} : {}),
            },
        ],
    });
    return artifact;
}

export function deriveStandardFeatureEvents(session: unknown): RoundRecordFeatureEventInput[] {
    const observations = observeVideoSlotFeatures(session);
    const events: RoundRecordFeatureEventInput[] = [];
    if (supportsWonFreeGamesNumberDetermining(session) && session.getWonFreeGamesNumber() > 0) events.push({type: "freeGamesTriggered", data: {count: session.getWonFreeGamesNumber()}});
    if (observations.featureChains) events.push({type: "featureChains", data: observations.featureChains});
    if (observations.modifiers) events.push({type: "screenModifiers", data: observations.modifiers});
    if (observations.holdAndWin) events.push({type: "holdAndWin", data: observations.holdAndWin});
    if (observations.jackpot) events.push({type: "jackpot", data: observations.jackpot});
    if (observations.chargedBetModeId) events.push({type: "chargedBetMode", data: {id: observations.chargedBetModeId}});
    return events;
}

function supportsWonFreeGamesNumberDetermining(session: unknown): session is WonFreeGamesNumberDetermining {
    return typeof (session as Partial<WonFreeGamesNumberDetermining>).getWonFreeGamesNumber === "function";
}
