import type {WinEvaluationResult} from "../session/videoslot/winevaluation/WinEvaluationResult.js";
import type {RoundArtifactFeatureEvent} from "./RoundArtifactFeatureEvent.js";

// What buildRoundStepArtifact needs to describe one step — deliberately just a screen plus an already-computed
// WinEvaluationResult (never recomputed), so the same builder covers both a single-step round (from a
// VideoSlotSessionHandling, see buildRoundArtifactFromSession) and each stage of a multi-step round (e.g. mapped
// one-to-one from CascadeResult.getCascadeSteps(), each CascadeStep already exposing getScreen()/
// getWinEvaluationResult() in this exact shape).
export type RoundArtifactStepSource<T extends string | number | symbol = string> = {
    screen: T[][];
    winEvaluationResult: WinEvaluationResult<T>;
    featureEvents?: RoundArtifactFeatureEvent[];
    debug?: Record<string, unknown>;
};
