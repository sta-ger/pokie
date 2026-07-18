import type {WeightedOutcomeLibraryAnalysisDiff} from "pokie";
import type {StudioOutcomeLibrarySelectView} from "./StudioOutcomeLibrarySelectView.js";

// Both sides are always reported, whatever their own status -- a comparison where one side failed to
// load/validate is still useful information ("library B is invalid", not just a generic failure), same
// "always show both, never collapse to one error" reasoning as SimulationReportDiffer's own breakdown-
// availability handling. "diff" (via WeightedOutcomeLibraryAnalysisDiffer) is only present when *both*
// sides reached "ok" and `leftSnapshotStale` is false -- there is no meaningful analysis to diff
// otherwise. "leftSnapshotStale" is true when the caller supplied an `expectedLeftHash` (the hash it
// already showed the user for the left library, from an earlier Select/Inspect) and the freshly
// re-resolved left library's hash no longer matches -- see StudioOutcomeLibraryService.compare()'s own
// doc comment for why this must never be silently diffed anyway.
export type StudioOutcomeLibraryCompareView = {
    readonly left: StudioOutcomeLibrarySelectView;
    readonly right: StudioOutcomeLibrarySelectView;
    readonly leftSnapshotStale: boolean;
    readonly diff?: WeightedOutcomeLibraryAnalysisDiff;
};
