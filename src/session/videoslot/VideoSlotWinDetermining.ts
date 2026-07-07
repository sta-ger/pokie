import {WinAmountDetermining, WinningLineDescribing, WinningScatterDescribing} from "pokie";

export interface VideoSlotWinDetermining<T extends string | number | symbol = string> extends WinAmountDetermining {
    getWinningLines(): Record<string, WinningLineDescribing<T>>;

    getWinningScatters(): Record<T, WinningScatterDescribing<T>>;

    getLinesWinning(): number;

    getScattersWinning(): number;
}
