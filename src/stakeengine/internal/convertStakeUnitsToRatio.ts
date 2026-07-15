import {convertRatioToStakeUnits} from "./convertRatioToStakeUnits.js";

// Exact inverse of convertRatioToStakeUnits: ratio = stakeUnits / cost / 100. Never rounds — and to guarantee no
// *hidden* rounding slipped in via float error, self-checks by re-running the exact forward computation on the
// candidate ratio and requiring it to land back on the exact original stakeUnits integer; returns undefined
// (rather than a slightly-off ratio) whenever it doesn't.
export function convertStakeUnitsToRatio(stakeUnits: number, cost: number): number | undefined {
    if (!Number.isSafeInteger(stakeUnits) || stakeUnits < 0) {
        return undefined;
    }
    const ratio = stakeUnits / cost / 100;
    return convertRatioToStakeUnits(ratio, cost) === stakeUnits ? ratio : undefined;
}
