import {WinAmountDetermining, WinningLineDescribing, WinningScatterDescribing} from "pokie";

export interface VideoSlotWinDetermining extends WinAmountDetermining {
    getWinningLines(): Record<string, WinningLineDescribing>;

    getWinningScatters(): Record<string, WinningScatterDescribing>;

    getLinesWinning(): number;

    getScattersWinning(): number;
}
