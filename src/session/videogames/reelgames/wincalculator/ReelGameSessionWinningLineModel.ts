import {IReelGameSessionWinningLineModel} from "./IReelGameSessionWinningLineModel";

export class ReelGameSessionWinningLineModel implements IReelGameSessionWinningLineModel {
    protected _wildItemsPositions: number[] = [];
    protected _lineId: string = "";
    protected _itemId: string = "";
    protected _winningAmount: number = 0;
    protected _itemsPositions: number[] = [];
    protected _direction: number[] = [];

    public get direction(): number[] {
        return this._direction;
    }

    public set direction(value: number[]) {
        this._direction = value;
    }

    public get itemId(): string {
        return this._itemId;
    }

    public set itemId(value: string) {
        this._itemId = value;
    }

    public get lineId(): string {
        return this._lineId;
    }

    public set lineId(value: string) {
        this._lineId = value;
    }

    public get itemsPositions(): number[] {
        return this._itemsPositions;
    }

    public set itemsPositions(value: number[]) {
        this._itemsPositions = value;
    }

    public get wildItemsPositions(): number[] {
        return this._wildItemsPositions;
    }

    public set wildItemsPositions(value: number[]) {
        this._wildItemsPositions = value;
    }

    public get winningAmount(): number {
        return this._winningAmount;
    }

    public set winningAmount(value: number) {
        this._winningAmount = value;
    }

}
