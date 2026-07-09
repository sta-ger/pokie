import type {WinAmountDetermining} from "./WinAmountDetermining.js";

export class NoWinAmount implements WinAmountDetermining {
    public getWinAmount(): number {
        return 0;
    }
}
