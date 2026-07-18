import type {WeightedOutcomeLibraryAnalysisDiff} from "pokie";
import type {StudioOutcomeLibrarySelectView} from "./StudioOutcomeLibrarySelectView.js";

// Both sides are always reported, whatever their own status -- a comparison where one side failed to
// load/validate is still useful information ("library B is invalid", not just a generic failure), same
// "always show both, never collapse to one error" reasoning as SimulationReportDiffer's own breakdown-
// availability handling. "diff" (via WeightedOutcomeLibraryAnalysisDiffer) is only present when *both*
// sides reached "ok" -- there is no meaningful analysis to diff otherwise.
export type StudioOutcomeLibraryCompareView = {
    readonly left: StudioOutcomeLibrarySelectView;
    readonly right: StudioOutcomeLibrarySelectView;
    readonly diff?: WeightedOutcomeLibraryAnalysisDiff;
};
