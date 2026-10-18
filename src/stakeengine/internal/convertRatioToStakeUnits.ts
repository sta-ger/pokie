// Converts a ratio (a payoutMultiplier, or a raw currency amount already divided by the round's own stake)
// into Stake Engine's own integer unit convention: ratio * cost * 100. Never rounds — returns undefined
// whenever the binary64 result is not already a non-negative safe integer, so callers can reject the
// export rather than silently lose precision. Shared by StakeEngineExportValidator (checking each outcome's
// artifact.payoutMultiplier before anything is built) and StakeEngineRoundEventsProjector (converting each
// event's own win amount/payout multiplier the same way), so the two can never silently disagree on units.
export function convertRatioToStakeUnits(ratio: number, cost: number): number | undefined {
    if (!Number.isFinite(ratio) || ratio < 0 || !Number.isFinite(cost) || cost <= 0) return undefined;
    const converted = ratio * cost * 100;
    // Underflow is not a representable zero payout for a nonzero native ratio.
    if (ratio !== 0 && converted === 0) return undefined;
    return Number.isSafeInteger(converted) && converted >= 0 ? converted : undefined;
}
