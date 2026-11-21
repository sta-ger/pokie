import type {StudioSimulationReportListEntry} from "../../api/types";

// Pure view-model transform for the Reports tab's list — same role as interpretSimulation.ts's own
// helpers. Every field the Reports list needs to show (id, game id/version, requested/actual rounds,
// seed, RTP, hit frequency, max win, started/completed time, duration, hasWarnings, status) is
// already present verbatim on StudioSimulationReportListEntry, so this only ever needs to distinguish
// "no completed simulations yet" from "here's the list" — "loading"/"error" are constructed directly
// by main.ts around the fetch call itself, same convention as ProjectHeaderView's own doc comment.
export type ReportListView = {status: "empty"} | {status: "loaded"; entries: StudioSimulationReportListEntry[]};

export function describeReportsList(entries: StudioSimulationReportListEntry[]): ReportListView {
    return entries.length === 0 ? {status: "empty"} : {status: "loaded", entries};
}

/** Enough identity to pick the intended comparison target: round count and seed matter as much as time. */
export function describeReportListEntry(entry: StudioSimulationReportListEntry): string {
    const rounds = entry.actualRounds ?? entry.requestedRounds;
    const seed = entry.seed === undefined || entry.seed.trim().length === 0 ? "no seed" : entry.seed;
    const mode = entry.modeName === undefined ? "" : ` — mode ${entry.modeName}`;
    return `${entry.game.id} v${entry.game.version} — ${rounds} rounds — seed ${seed}${mode} — ${new Date(entry.startedAt).toLocaleString()}`;
}
