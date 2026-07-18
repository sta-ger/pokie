import type {WeightedOutcomeLibraryAnalysis} from "../weightedoutcome/WeightedOutcomeLibraryAnalysis.js";
import type {WeightedOutcomeLibraryAnalysisDiff} from "./WeightedOutcomeLibraryAnalysisDiff.js";

export interface WeightedOutcomeLibraryAnalysisDiffing {
    diff(left: WeightedOutcomeLibraryAnalysis, right: WeightedOutcomeLibraryAnalysis): WeightedOutcomeLibraryAnalysisDiff;
}
