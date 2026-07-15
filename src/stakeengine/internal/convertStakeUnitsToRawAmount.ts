import {convertRatioToStakeUnits} from "./convertRatioToStakeUnits.js";
import {convertStakeUnitsToRatio} from "./convertStakeUnitsToRatio.js";

// Exact inverse of the forward projector's own amount conversion (convertRatioToStakeUnits(rawAmount/stake,
// cost)): reverses to a ratio first, then multiplies back out by stake. Same self-check discipline as
// convertStakeUnitsToRatio — re-running the exact forward computation on the candidate amount and requiring an
// exact integer match — since this reversal is a two-step float computation (divide, then multiply) and could
// in principle accumulate error a single division wouldn't.
export function convertStakeUnitsToRawAmount(stakeUnits: number, stake: number, cost: number): number | undefined {
    const ratio = convertStakeUnitsToRatio(stakeUnits, cost);
    if (ratio === undefined) {
        return undefined;
    }
    const rawAmount = ratio * stake;
    return convertRatioToStakeUnits(rawAmount / stake, cost) === stakeUnits ? rawAmount : undefined;
}
