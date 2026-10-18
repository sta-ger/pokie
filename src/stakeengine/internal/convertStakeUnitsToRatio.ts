import {convertRatioToStakeUnits} from "./convertRatioToStakeUnits.js";

// Retain the established binary64 evaluation order when it reverses exactly. If it does not,
// equivalent division orders can avoid an intermediate rounding error (e.g. one unit at cost 3).
// Never round a candidate: the shared forward conversion must reproduce the original safe integer.
export function convertStakeUnitsToRatio(stakeUnits: number, cost: number): number | undefined {
    if (!Number.isSafeInteger(stakeUnits) || stakeUnits < 0) {
        return undefined;
    }
    const candidates = [stakeUnits / cost / 100, stakeUnits / (cost * 100), (stakeUnits / 100) / cost];
    return candidates.find(ratio => convertRatioToStakeUnits(ratio, cost) === stakeUnits);
}
