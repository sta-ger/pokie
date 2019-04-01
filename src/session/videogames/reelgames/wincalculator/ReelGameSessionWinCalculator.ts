import {IReelGameSessionWinCalculator} from "./IReelGameSessionWinCalculator";
import {IReelGameSessionConfig} from "../IReelGameSessionConfig";
import {IReelGameSessionWinningLineModel} from "./IReelGameSessionWinningLineModel";
import {IReelGameSessionWinningScatterModel} from "./IReelGameSessionWinningScatterModel";
import {ReelGameSessionWinningScatterModel} from "./ReelGameSessionWinningScatterModel";
import {ReelGameSessionWinningLineModel} from "./ReelGameSessionWinningLineModel";

export class ReelGameSessionWinCalculator implements IReelGameSessionWinCalculator {
    private _items: string[][];

    private readonly _reelsItemsNumber: number;
    private readonly _reelsNumber: number;
    private readonly _wildItemId: string;
    private readonly _scatters: any[][];
    private readonly _linesDirections: {};
    private readonly _wildsMultipliers: {
        [wildsNum: number]: number
    };
    private readonly _paytable: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number
            }
        }
    };

    private _winningLines: { [lineId: string]: IReelGameSessionWinningLineModel };
    private _winningScatters: { [scatterItemId: string]: IReelGameSessionWinningScatterModel };

    constructor(conf: IReelGameSessionConfig) {
        this._reelsItemsNumber = conf.reelsItemsNumber;
        this._reelsNumber = conf.reelsNumber;
        this._wildItemId = conf.wildItemId;
        this._scatters = conf.scatters;
        this._linesDirections = conf.linesDirections;
        this._wildsMultipliers = conf.wildsMultipliers;
        this._paytable = conf.paytable;
    }

    public setGameState(bet: number, items: string[][]): void {
        if (this._paytable.hasOwnProperty(bet)) {
            this._items = items;
            this.calculateWinning(bet);
        } else {
            throw `Bet ${bet} does not specified at paytable`;
        }
    }

    public getWinningLines(): { [lineId: string]: IReelGameSessionWinningLineModel } {
        return this._winningLines;
    }

    public getWinningScatters(): {} {
        return this._winningScatters;
    }

    private calculateWinning(bet: number): void {
        let lineId: string;
        let line: IReelGameSessionWinningLineModel;
        this._winningLines = {};
        for (lineId in this._linesDirections) {
            line = this.generateWinningLine(bet, lineId);
            if (line.winningAmount > 0) {
                this._winningLines[lineId] = line;
            }
        }
        this._winningScatters = this.generateWinningScatters(bet);
    }

    private generateWinningScatters(bet: number): { [scatterItemId: string]: IReelGameSessionWinningScatterModel } {
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
                    curScatterModel = new ReelGameSessionWinningScatterModel();
                    curScatterModel.itemId = curScatterItemId;
                    curScatterModel.itemsPositions = curScatterItemsPositions;
                    curScatterModel.winningAmount = this.getScatterWinningAmount(bet, curScatterModel);
                    rv[curScatterModel.itemId] = curScatterModel;
                }
            }
        }
        return rv;
    }

    private getScatterItemsPositions(itemId: string): number[][] {
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

    private generateWinningLine(bet: number, lineId: string): IReelGameSessionWinningLineModel {
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
        direction = this._linesDirections[lineId];
        itemsPositions = [];
        wildItemsPositions = [];
        line = new ReelGameSessionWinningLineModel();
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
                    itemPaytable = this._paytable[bet][prevItemId];
                    for (itemPaytableTimes in itemPaytable) {
                        if (itemsPositions.length === parseInt(itemPaytableTimes)) {
                            times = itemsPositions.length;
                            line.itemsPositions = itemsPositions;
                            line.wildItemsPositions = wildItemsPositions;
                            line.itemId = prevItemId;
                            line.winningAmount = this.getLineWinningAmount(bet, line);
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

    private isItemScatter(itemId: string): boolean {
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

    private getLineWinningAmount(bet: number, line: IReelGameSessionWinningLineModel): number {
        let rv: number;
        rv = this._paytable[bet][line.itemId][line.itemsPositions.length] * (this._wildsMultipliers.hasOwnProperty(line.wildItemsPositions.length) ? this._wildsMultipliers[line.wildItemsPositions.length] : 1);
        return rv;
    }

    private getScatterWinningAmount(bet: number, model: IReelGameSessionWinningScatterModel): number {
        let rv: number;
        if (this._paytable[bet].hasOwnProperty(model.itemId)) {
            rv = this._paytable[bet][model.itemId][model.itemsPositions.length];
        } else {
            rv = 0;
        }
        return rv;
    }

}
