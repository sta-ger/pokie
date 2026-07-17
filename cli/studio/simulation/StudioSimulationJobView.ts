import type {SimulationReport} from "pokie";
import type {StudioSimulationStatus} from "./StudioSimulationStatus.js";

// The one extra bit of data Studio surfaces alongside the standard SimulationReport — volatility/
// standard deviation/confidence intervals that SimulationAccumulator.getStatistics() already
// computes but SimulationReportBuilder doesn't carry into the public SimulationReport. Kept as its
// own field here (Studio's own response DTO) rather than as a change to SimulationReport itself, so
// the shared report type/its existing renderers/docs are completely untouched.
export type StudioSimulationStatisticsView = {
    volatility: number;
    payoutStandardDeviation: number;
    returnStandardDeviation: number;
    averagePayoutConfidenceInterval95: {low: number; high: number};
    rtpConfidenceInterval95: {low: number; high: number};
    // Bucket -> round count, straight from SimulationAccumulator.getStatistics() -- optional only so
    // every existing caller/test that builds this view without it (predating this field) stays valid.
    payoutHistogram?: Record<string, number>;
};

// The typed, plain-data DTO every /api/project/simulations* endpoint returns — never a stack trace,
// never a runtime session/game/AbortController object (see StudioSimulationJobRecord, which is the
// internal record this is derived from via toStudioSimulationJobView).
export type StudioSimulationJobView = {
    id: string;
    status: StudioSimulationStatus;
    rounds: number;
    seed?: string;
    workers: number;
    startedAt: string;
    roundsCompleted: number;
    durationMs: number;
    report?: SimulationReport;
    statistics?: StudioSimulationStatisticsView;
    error?: string;
};

// The GET /api/project/reports/:id response envelope -- bundles the persisted SimulationReport with the
// same StudioSimulationStatisticsView a live job's own poll response carries, so a report opened from
// history (Recent Runs' "Open") renders identically to one just watched to completion instead of silently
// losing volatility/confidence-interval/payout-histogram the moment it's re-fetched by id.
export type StudioSimulationReportDetail = {
    report: SimulationReport;
    statistics?: StudioSimulationStatisticsView;
};
