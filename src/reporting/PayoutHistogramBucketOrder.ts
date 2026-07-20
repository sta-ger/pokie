// The fixed bucket keys SimulationAccumulator.getBucketLabel() partitions raw per-round payouts into,
// ordered from highest to lowest. Kept here (rather than exported from SimulationAccumulator itself)
// because this ordering is a reporting-layer concern -- interpreting an already-built
// SimulationStatistics.payoutHistogram/SimulationReport.payoutHistogram -- not a simulation concern.
// Must be kept in sync with SimulationAccumulator's own bucket labels; there is no other source of
// truth for what a given bucket key means.
export const PAYOUT_HISTOGRAM_BUCKET_ORDER: readonly string[] = ["100+", "10-99", "1-9", "0"];
