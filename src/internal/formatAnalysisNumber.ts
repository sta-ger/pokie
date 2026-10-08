// Preserve ordinary fixed-decimal output, but keep nonzero metrics/deltas visible below its resolution.
export function formatAnalysisNumber(value: number, decimals: number): string {
    const fixed = value.toFixed(decimals);
    return value !== 0 && Number(fixed) === 0 ? value.toExponential(decimals) : fixed;
}
