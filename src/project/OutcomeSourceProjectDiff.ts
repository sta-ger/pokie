import type {ValidationIssue} from "../validation/ValidationIssue.js";

// One shared metric's own {left,right,delta,percentDelta} comparison -- the same shape
// WeightedOutcomeLibraryAnalysisMetricDiff/SimulationReportMetricDiff already use, reused here rather than a
// third, independently-authored one.
export type OutcomeSourceProjectMetricDiff = {
    readonly left: number;
    readonly right: number;
    readonly delta: number;
    readonly percentDelta: number | null;
};

// One mode's own diff, over exactly the core metrics WeightedOutcomeLibraryAnalysis and
// StakeEngineStandaloneModeAnalysis both already share (see OutcomeSourceProjectModeAnalysis's own doc
// comment) -- never "maxWin"/"maxPayoutMultiplier"/"maxRatio", which differ in unit/meaning between a native
// bundle's own raw currency total and a Stake Engine export's own stake-normalized ratio, so comparing them
// directly across two different source kinds would be misleading.
export type OutcomeSourceProjectModeDiff = {
    readonly modeName: string;
    readonly rtp: OutcomeSourceProjectMetricDiff;
    readonly hitFrequency: OutcomeSourceProjectMetricDiff;
    readonly zeroWinFrequency: OutcomeSourceProjectMetricDiff;
    readonly variance: OutcomeSourceProjectMetricDiff;
    readonly standardDeviation: OutcomeSourceProjectMetricDiff;
    readonly maxWinProbability: OutcomeSourceProjectMetricDiff;
};

// What diffOutcomeSourceProjects() computes for two resolved outcome-source projects -- "perMode" only ever
// carries a mode present (and error-free) on both sides; a mode present on only one side, or excluded because
// either side's own canonical reader reported a structural error for it, is named in "onlyInLeft"/
// "onlyInRight" instead of silently skipped.
export type OutcomeSourceProjectDiff = {
    readonly left: {readonly rootPath: string; readonly kind: string; readonly issues: readonly ValidationIssue[]};
    readonly right: {readonly rootPath: string; readonly kind: string; readonly issues: readonly ValidationIssue[]};
    readonly perMode: Readonly<Record<string, OutcomeSourceProjectModeDiff>>;
    readonly onlyInLeft: readonly string[];
    readonly onlyInRight: readonly string[];
};
