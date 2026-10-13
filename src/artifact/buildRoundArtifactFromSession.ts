import type {RoundArtifactStepSource} from "./RoundArtifactStepSource.js";
import type {CascadeResultProviding} from "../session/videoslot/cascade/CascadeResultProviding.js";
import {captureScreen} from "../session/captureScreen.js";
import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import {determineStakeAmount} from "../session/determineStakeAmount.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";
import type {WonFreeGamesNumberDetermining} from "../session/WonFreeGamesNumberDetermining.js";
import {buildRoundArtifact} from "./buildRoundArtifact.js";
import type {RoundArtifact} from "./RoundArtifact.js";
import type {RoundArtifactFeatureEventInput} from "./RoundArtifactFeatureEvent.js";
import type {RoundArtifactProvenance} from "./RoundArtifactProvenance.js";

export type RoundArtifactFromSessionOptions = {
    roundId: string;
    provenance: RoundArtifactProvenance;
    betMode?: string;
    stake?: number;
    debug?: Record<string, unknown>;
};

// Convenience for the common single-step case: builds a RoundArtifact straight off a played
// VideoSlotSessionHandling's own current state (its symbols combination + win evaluation result), with no
// second calculation path. "stake", when not given explicitly, is derived via the same determineStakeAmount
// this library already uses for wallet debiting (session.getBet() unless the session feature-detects
// StakeAmountDetermining, e.g. a free-games round that charges nothing) — never inferred here again from
// scratch. A "freeGamesTriggered" feature event is likewise only added when the session feature-detects
// WonFreeGamesNumberDetermining and actually reports a win this round, mirroring the same
// optional-interface pattern (see StakeAmountDetermining's own doc comment for why balance/state is never
// used to infer this).
export function buildRoundArtifactFromSession<T extends string | number = string>(
    session: VideoSlotSessionHandling<T>,
    options: RoundArtifactFromSessionOptions,
): RoundArtifact<T> {
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
    let sources: RoundArtifactStepSource<T>[] | undefined;
    if (cascade && terminal) sources = [...(cascadeSteps ?? []).map(step => ({screen: step.getScreen(), winEvaluationResult: step.getWinEvaluationResult()})), {screen: cascade.getFinalScreen(), winEvaluationResult: terminal}];
    else if (cascadeSteps?.length) sources = cascadeSteps.map(step => ({screen: step.getScreen(), winEvaluationResult: step.getWinEvaluationResult()}));
    const artifact = buildRoundArtifact({
        roundId: options.roundId,
        provenance: options.provenance,
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

function deriveStandardFeatureEvents(session: unknown): RoundArtifactFeatureEventInput[] {
    if (!supportsWonFreeGamesNumberDetermining(session)) {
        return [];
    }
    const wonFreeGamesNumber = session.getWonFreeGamesNumber();
    return wonFreeGamesNumber > 0 ? [{type: "freeGamesTriggered", data: {count: wonFreeGamesNumber}}] : [];
}

function supportsWonFreeGamesNumberDetermining(session: unknown): session is WonFreeGamesNumberDetermining {
    return typeof (session as Partial<WonFreeGamesNumberDetermining>).getWonFreeGamesNumber === "function";
}
