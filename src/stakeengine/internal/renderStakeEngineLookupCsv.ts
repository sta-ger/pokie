export type StakeEngineLookupCsvRow = {
    readonly simulationId: number;
    readonly weight: number;
    readonly payoutMultiplier: number;
};

// Stake Engine's lookup table CSV: no header row, three integer columns per row (simulation id, weight, payout
// multiplier — see https://stakeengine.github.io/math-sdk/rgs_docs/data_format/). No escaping is needed since
// every value is already a validated integer (see StakeEngineExportValidator).
export function renderStakeEngineLookupCsv(rows: readonly StakeEngineLookupCsvRow[]): string {
    return rows.map((row) => `${row.simulationId},${row.weight},${row.payoutMultiplier}\n`).join("");
}
