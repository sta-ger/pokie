import type {StudioSimulationReportListEntry} from "./types.js";

// Pure view-model transform for the Reports tab's list — same role as interpretSimulation.ts's own
// helpers. Every field the Reports list needs to show (id, game id/version, requested/actual rounds,
// seed, RTP, hit frequency, max win, started/completed time, duration, hasWarnings, status) is
// already present verbatim on StudioSimulationReportListEntry, so this only ever needs to distinguish
// "no completed simulations yet" from "here's the list" — "loading"/"error" are constructed directly
// by main.ts around the fetch call itself, same convention as ProjectHeaderView/InspectionResultView.
export type ReportListView = {status: "empty"} | {status: "loaded"; entries: StudioSimulationReportListEntry[]};

export function describeReportsList(entries: StudioSimulationReportListEntry[]): ReportListView {
    return entries.length === 0 ? {status: "empty"} : {status: "loaded", entries};
}
