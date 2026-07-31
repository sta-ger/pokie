// Same never-silently-lossy convention StakeEngineStandaloneAnalyzer's own StakeEngineStandaloneExactDecimal
// values use: a non-negative integer count that can exceed Number.MAX_SAFE_INTEGER (an exact reel-stop
// combination space routinely does) is reported as a plain `number` only when that's lossless, and as a
// canonical base-10 string otherwise -- never rounded, never scientific notation, never a bigint (which JSON
// can't represent at all).
export function toBigIntSafeDecimal(value: bigint): number | string {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}
