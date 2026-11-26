// Fixed payout-multiple bucket keys used by SimulationAccumulator.getBucketLabel(), ordered from
// lowest to highest. Legacy keys are retained at the end so reports produced before the finer
// histogram still render in a sensible order. Kept here (rather than exported from
// SimulationAccumulator itself) because this ordering is a reporting-layer concern -- interpreting
// an already-built SimulationStatistics.payoutHistogram/SimulationReport.payoutHistogram -- not a
// simulation concern. Must be kept in sync with SimulationAccumulator's own bucket labels; there is
// no other source of truth for what a given bucket key means.
export const PAYOUT_HISTOGRAM_BUCKET_ORDER: readonly string[] = [
    "0",
    "0-1",
    "1-2",
    "2-5",
    "5-10",
    "10-25",
    "25-50",
    "50-100",
    "100-250",
    "250-500",
    "500-1000",
    "1000+",
    "1-9",
    "10-99",
    "100+",
];
