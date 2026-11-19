import type {ReelSequenceSelection} from "../session/videoslot/combinations/WeightedSequenceVariant.js";
import type {ScreenGeometry} from "../session/videoslot/coordinates/ScreenGeometry.js";
import type {WinEvaluationResult} from "../session/videoslot/winevaluation/WinEvaluationResult.js";
import type {RoundRecordFeatureEventInput} from "./RoundRecordFeatureEvent.js";

// What buildRoundStepArtifact needs to describe one step — deliberately just a screen plus an already-computed
// WinEvaluationResult (never recomputed), so the same builder covers both a single-step round (from a
// VideoSlotSessionHandling, see buildRoundRecordFromSession) and each stage of a multi-step round (e.g. mapped
// one-to-one from CascadeResult.getCascadeSteps(), each CascadeStep already exposing getScreen()/
// getWinEvaluationResult() in this exact shape). "screen"/"featureEvents"/"debug" are all permissive, readonly
// input shapes — buildRoundStepArtifact never mutates them, and validates/deep-copies "featureEvents[].data"/
// "debug" into JsonObject at build time (see canonicalizeJsonField), so there's no need for the caller-facing
// input type to be as strict as the output RoundStepArtifact.
export type RoundRecordStepSource<T extends string | number = string> = {
    readonly geometry?: ScreenGeometry;
    readonly generatedScreen?: readonly (readonly T[])[];
    readonly sequenceSelections?: readonly ReelSequenceSelection[];
    readonly screen: readonly (readonly T[])[];
    readonly winEvaluationResult: WinEvaluationResult<T>;
    readonly featureEvents?: readonly RoundRecordFeatureEventInput[];
    readonly debug?: Record<string, unknown>;
};
