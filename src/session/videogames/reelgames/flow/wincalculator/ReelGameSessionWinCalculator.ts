import {IReelGameSessionWinCalculator} from "./IReelGameSessionWinCalculator";
import {IGameSessionModel} from "../../../../IGameSessionModel";
import {IReelGameSessionWinningLineModel} from "../IReelGameSessionWinningLineModel";
import {ReelGameSessionParameters} from "../../ReelGameSessionParameters";
import {ReelGameSessionWinningLineModel} from "../ReelGameSessionWinningLineModel";
import {IReelGameSessionWinningScatterModel} from "../IReelGameSessionWinningScatterModel";
import {ReelGameSessionWinningScatterModel} from "../ReelGameSessionWinningScatterModel";

export class ReelGameSessionWinCalculator implements IReelGameSessionWinCalculator {
    protected _sessionModel: IGameSessionModel;
    protected _items: string[][];
    
    protected _itemsRows: number;
    protected _itemsCols: number;
    
    protected _wildItemId: string;
    protected _scatters: any[][];
    protected _linesDirections: {};
    
    protected _winningLines: { [lineId: string]: IReelGameSessionWinningLineModel };
    protected _winningScatters: { [scatterId: string]: IReelGameSessionWinningScatterModel };
    
    protected _wildsMultipliers: {
        [wildsNum: number]: number
    };
    
    protected _itemsPaytable: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number
            }
        }
    };
    
    constructor() {
        this.initialize();
    }
    
    protected initialize(): void {
        let i: number;
        this._itemsCols = ReelGameSessionParameters.reelsNumber;
        this._itemsRows = ReelGameSessionParameters.reelsItemsNumber;
        this._linesDirections = ReelGameSessionParameters.linesDirections;
        this._scatters = ReelGameSessionParameters.scatters;
        this._wildItemId = ReelGameSessionParameters.wildItemId;
        this._itemsPaytable = ReelGameSessionParameters.paytable;
    
        this._wildsMultipliers = {};
        for (i = 0; i <= ReelGameSessionParameters.reelsNumber; i++) {
            if (i === 0) {
                this._wildsMultipliers[i] = 1;
            } else {
                this._wildsMultipliers[i] = i * 2;
            }
        }
    }
    
    public setModel(model: IGameSessionModel): void {
        this._sessionModel = model;
    }
    
    public setReelsItems(items: string[][]): void {
        this._items = items;
        this.calculateWinning();
    }
    
    public getWinningLines(): { [lineId: string]: IReelGameSessionWinningLineModel } {
        return this._winningLines;
    }
    
    public getWinningScatters(): {} {
        return this._winningScatters;
    }
    
    protected calculateWinning(): void {
        let lineId: string;
        let line: IReelGameSessionWinningLineModel;
        this._winningLines = {};
        for (lineId in this._linesDirections) {
            line = this.generateWinningLine(lineId);
            if (line.winningAmount > 0) {
                this._winningLines[lineId] = line;
            }
        }
        this._winningScatters = this.generateWinningScatters();
    }
    
    protected generateWinningScatters(): {} {
        let rv: {};
        let scatter: {};
        let i: number;
        let curScatterItemsPositions: number[][];
        let curScatterItemId: string;
        let curScatterMinItemsForWin: number;
        let curScatterModel: IReelGameSessionWinningScatterModel;
        rv = {};
        if (this._scatters) {
            for (i = 0; i < this._scatters.length; i++) {
                scatter = this._scatters[i];
                curScatterItemId = scatter[0];
                curScatterMinItemsForWin = scatter[1];
                curScatterItemsPositions = this.getScatterItemsPositions(curScatterItemId);
                if (curScatterItemsPositions.length >= curScatterMinItemsForWin) {
                    curScatterModel = this.createWinningScatterModel();
                    curScatterModel.itemId = curScatterItemId;
                    curScatterModel.itemsPositions = curScatterItemsPositions;
                    curScatterModel.winningAmount = this.getScatterWinningAmount(curScatterModel);
                    rv[curScatterModel.itemId] = curScatterModel;
                }
            }
        }
        return rv;
    }
    
    protected getScatterItemsPositions(itemId: string): number[][] {
        let i: number;
        let j: number;
        let rv: number[][];
        let item: string;
        rv = [];
        for (i = 0; i < this._items.length; i++) {
            for (j = 0; j < this._items[i].length; j++) {
                item = this._items[i][j];
                if (item === itemId) {
                    rv.push([i, j]);
                }
            }
        }
        return rv;
    }
    
    protected generateWinningLine(lineId: string): IReelGameSessionWinningLineModel {
        let bet: number;
        let line: IReelGameSessionWinningLineModel;
        let i: number;
        let dirX: number;
        let dirY: number;
        let direction: number[];
        let itemId: string;
        let prevItemId: string;
        let itemsPositions: number[];
        let wildItemsPositions: number[];
        let itemPaytable: { [times: number]: number };
        let itemPaytableTimes: string;
        let times: number;
        bet = this._sessionModel.bet;
        direction = this._linesDirections[lineId];
        itemsPositions = [];
        wildItemsPositions = [];
        line = this.createLineModel();
        line.winningAmount = 0;
        line.direction = direction;
        line.itemsPositions = [];
        line.wildItemsPositions = [];
        line.lineId = lineId;
        for (i = 0; i < direction.length; i++) {
            dirX = i;
            dirY = direction[i];
            itemId = this._items[dirX][dirY];
            if (!prevItemId) {
                if (this.isItemScatter(itemId)) {
                    break;
                }
                prevItemId = itemId;
                if (itemId === this._wildItemId) {
                    wildItemsPositions.push(dirX);
                }
                itemsPositions.push(dirX);
            } else {
                if (
                        (itemId !== prevItemId && itemId !== this._wildItemId) ||
                        (itemsPositions.length === direction.length - 1 && (itemId === prevItemId || itemId === this._wildItemId))
                ) {
                    if (itemsPositions.length === direction.length - 1 && (itemId === prevItemId || itemId === this._wildItemId)) {
                        if (itemId === this._wildItemId) {
                            wildItemsPositions.push(dirX);
                        }
                        itemsPositions.push(dirX);
                    }
                    itemPaytable = this._itemsPaytable[bet][prevItemId];
                    for (itemPaytableTimes in itemPaytable) {
                        if (itemsPositions.length === parseInt(itemPaytableTimes)) {
                            times = itemsPositions.length;
                            line.itemsPositions = itemsPositions;
                            line.wildItemsPositions = wildItemsPositions;
                            line.itemId = prevItemId;
                            line.winningAmount = this.getLineWinningAmount(line);
                            break;
                        }
                    }
                    break;
                } else {
                    if (itemId === this._wildItemId) {
                        wildItemsPositions.push(dirX);
                    }
                    itemsPositions.push(dirX);
                }
            }
        }
        return line;
    }
    
    protected isItemScatter(itemId: string): boolean {
        let i: number;
        let rv: boolean;
        if (this._scatters) {
            for (i = 0; i < this._scatters.length; i++) {
                if (this._scatters[i][0] === itemId) {
                    rv = true;
                    break;
                }
            }
        }
        return rv;
    }
    
    protected getLineWinningAmount(line: IReelGameSessionWinningLineModel): number {
        let rv: number;
        rv = this._itemsPaytable[this._sessionModel.bet][line.itemId][line.itemsPositions.length] * this._wildsMultipliers[line.wildItemsPositions.length];
        return rv;
    }
    
    protected getScatterWinningAmount(model: IReelGameSessionWinningScatterModel): number {
        let rv: number;
        if (this._itemsPaytable[this._sessionModel.bet].hasOwnProperty(model.itemId)) {
            rv = this._itemsPaytable[this._sessionModel.bet][model.itemId][model.itemsPositions.length];
        } else {
            rv = 0;
        }
        return rv;
    }
    
    public flipMatrix(source: any[][]): any[][] {
        let r: any[][];
        let i: number;
        let j: number;
        r = [];
        for (i = 0; i < source.length; i++) {
            for (j = 0; j < source[i].length; j++) {
                if (r[j] === undefined) {
                    r[j] = [];
                }
                r[j][i] = source[i][j];
            }
        }
        return r;
    }
    
    protected createLineModel(): IReelGameSessionWinningLineModel {
        return new ReelGameSessionWinningLineModel();
    }
    
    protected createWinningScatterModel(): IReelGameSessionWinningScatterModel {
        return new ReelGameSessionWinningScatterModel();
    }
    
}
