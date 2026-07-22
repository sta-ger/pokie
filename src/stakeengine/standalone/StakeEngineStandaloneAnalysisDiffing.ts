import type {StakeEngineStandaloneAnalysis} from "./StakeEngineStandaloneAnalysis.js";
import type {StakeEngineStandaloneAnalysisDiff} from "./StakeEngineStandaloneAnalysisDiff.js";

export interface StakeEngineStandaloneAnalysisDiffing {
    diff(left: StakeEngineStandaloneAnalysis, right: StakeEngineStandaloneAnalysis): StakeEngineStandaloneAnalysisDiff;
}
