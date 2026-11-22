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

/** A compact, human-readable form of the optimizer's authored-source hash. */
export function shortSourceRevision(revision: string | undefined): string | undefined {
    if (revision === undefined || revision.trim().length === 0) return undefined;
    return revision.replace(/^sha256:/, "").slice(0, 12);
}

/** Whether two runs sampled the exact same saved authored design. */
export function describeDesignCompatibility(current: string | undefined, comparison: string | undefined): "same" | "different" | "unknown" {
    if (current === undefined || comparison === undefined) return "unknown";
    return current === comparison ? "same" : "different";
}

/** Enough identity to pick the intended comparison target: design, round count and seed all matter. */
export function describeReportListEntry(entry: StudioSimulationReportListEntry): string {
    const rounds = entry.actualRounds ?? entry.requestedRounds;
    const seed = entry.seed === undefined || entry.seed.trim().length === 0 ? "no seed" : entry.seed;
    const mode = entry.modeName === undefined ? "" : ` — mode ${entry.modeName}`;
    const revision = shortSourceRevision(entry.sourceRevision);
    const design = revision === undefined ? " — design revision unavailable" : ` — design ${revision}`;
    return `${entry.game.id} v${entry.game.version} — ${rounds} rounds — seed ${seed}${mode}${design} — ${new Date(entry.startedAt).toLocaleString()}`;
}
