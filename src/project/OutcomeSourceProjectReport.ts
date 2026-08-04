import type {CanonicalOutcomeSourceDescriptor} from "../pregenerated/CanonicalOutcomeSourceDescriptor.js";
import type {StakeEngineStandaloneModeAnalysis} from "../stakeengine/standalone/StakeEngineStandaloneAnalysis.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {WeightedOutcomeLibraryAnalysis} from "../weightedoutcome/WeightedOutcomeLibraryAnalysis.js";

// One mode's own exact analysis, whichever canonical reader family produced it -- a native bundle's own
// WeightedOutcomeLibraryAnalysis (rtp/hitFrequency/variance/standardDeviation/... over artifact.payoutMultiplier)
// or a Stake Engine directory's own StakeEngineStandaloneModeAnalysis (the same field names, computed directly
// over StakeEngineOutcomeRecord instead) -- see OutcomeSourceProjectAnalyzer's own doc comment for why both
// analyzers already share this shape closely enough for a caller to treat them uniformly.
export type OutcomeSourceProjectModeAnalysis = {
    readonly modeName: string;
    readonly analysis: WeightedOutcomeLibraryAnalysis | StakeEngineStandaloneModeAnalysis;
};

// What OutcomeSourceProjectAnalyzer.analyze() returns for a resolved "outcomeLibrary"/"stakeAdapter"
// PokieProject -- "descriptor" states this source's own kind/streaming/limitations (see
// CanonicalOutcomeSourceDescriptor), "issues" carries every structural problem its own canonical reader found
// (a malformed shard/source never throws its way out of this report -- see
// OutcomeLibraryBundleValidating/StakeEngineOutcomeSourceReading), and "modes" is empty whenever "issues"
// contains an error-severity entry, since exact analysis over a structurally invalid source is meaningless.
export type OutcomeSourceProjectReport = {
    readonly rootPath: string;
    readonly descriptor: CanonicalOutcomeSourceDescriptor;
    readonly issues: readonly ValidationIssue[];
    readonly modes: readonly OutcomeSourceProjectModeAnalysis[];
};
