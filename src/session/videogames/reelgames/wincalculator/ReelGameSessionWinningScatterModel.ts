import {IReelGameSessionWinningScatterModel} from "./IReelGameSessionWinningScatterModel";

export class ReelGameSessionWinningScatterModel implements IReelGameSessionWinningScatterModel {
    protected _itemId: string = "";
    protected _itemsPositions: number[][] = [];
    protected _winningAmount: number = 0;

    public get winningAmount(): number {
        return this._winningAmount;
    }

    public set winningAmount(value: number) {
        this._winningAmount = value;
    }

    public get itemsPositions(): number[][] {
        return this._itemsPositions;
    }

    public set itemsPositions(value: number[][]) {
        this._itemsPositions = value;
    }

    public get itemId(): string {
        return this._itemId;
    }

    public set itemId(value: string) {
        this._itemId = value;
    }

}
