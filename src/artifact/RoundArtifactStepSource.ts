import type {WinEvaluationResult} from "../session/videoslot/winevaluation/WinEvaluationResult.js";
import type {RoundArtifactFeatureEventInput} from "./RoundArtifactFeatureEvent.js";

// What buildRoundStepArtifact needs to describe one step — deliberately just a screen plus an already-computed
// WinEvaluationResult (never recomputed), so the same builder covers both a single-step round (from a
// VideoSlotSessionHandling, see buildRoundArtifactFromSession) and each stage of a multi-step round (e.g. mapped
// one-to-one from CascadeResult.getCascadeSteps(), each CascadeStep already exposing getScreen()/
// getWinEvaluationResult() in this exact shape). "screen"/"featureEvents"/"debug" are all permissive, readonly
// input shapes — buildRoundStepArtifact never mutates them, and validates/deep-copies "featureEvents[].data"/
// "debug" into JsonObject at build time (see canonicalizeJsonField), so there's no need for the caller-facing
// input type to be as strict as the output RoundStepArtifact.
export type RoundArtifactStepSource<T extends string | number = string> = {
    readonly screen: readonly (readonly T[])[];
    readonly winEvaluationResult: WinEvaluationResult<T>;
    readonly featureEvents?: readonly RoundArtifactFeatureEventInput[];
    readonly debug?: Record<string, unknown>;
};
