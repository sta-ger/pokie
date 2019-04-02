import {IReelGameSessionWinCalculator} from "./IReelGameSessionWinCalculator";
import {IReelGameSessionConfig} from "../IReelGameSessionConfig";
import {IReelGameSessionWinningLineModel} from "./IReelGameSessionWinningLineModel";
import {IReelGameSessionWinningScatterModel} from "./IReelGameSessionWinningScatterModel";
import {ReelGameSessionWinningScatterModel} from "./ReelGameSessionWinningScatterModel";
import {ReelGameSessionWinningLineModel} from "./ReelGameSessionWinningLineModel";

export class ReelGameSessionWinCalculator implements IReelGameSessionWinCalculator {
    private readonly _config: IReelGameSessionConfig;
    private readonly _reelsItemsNumber: number;
    private readonly _reelsNumber: number;
    private readonly _wildItemId: string;
    private readonly _scatters: any[][];
    private readonly _linesDirections: { [lineId: string]: number[] };
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

    private _items: string[][];
    private _winningLines: { [lineId: string]: IReelGameSessionWinningLineModel };
    private _winningScatters: { [scatterItemId: string]: IReelGameSessionWinningScatterModel };

    private _linesPatterns: number[][];

    constructor(conf: IReelGameSessionConfig) {
        this._config = conf;
        this._reelsItemsNumber = conf.reelsItemsNumber;
        this._reelsNumber = conf.reelsNumber;
        this._wildItemId = conf.wildItemId;
        this._scatters = conf.scatters;
        this._linesDirections = conf.linesDirections;
        this._wildsMultipliers = conf.wildsMultipliers;
        this._paytable = conf.paytable;
        this._linesPatterns = ReelGameSessionWinCalculator.createLinesPatterns(this._reelsNumber);
    }

    public static createLinesPatterns(reelsNumber: number): number[][] {
        let r = [];
        for (let i = 0; i < reelsNumber - 1; i++) {
            let arr = new Array(reelsNumber + 1).join("0").split("").map(item => parseInt(item));
            for (let j = 0; j < reelsNumber - i; j++) {
                arr[j] = 1;
            }
            r.push(arr);
        }
        return r;
    }

    public static getItemsFromDirection(items: string[][], direction: number[]): string[] {
        let r: string[];
        r = direction.map((row, col) => {
            return items[col][row];
        });
        return r;
    }

    public static getItemsMatchingPattern(items: string[], pattern: number[]): string[] {
        return pattern.reduce((arr, val, i) => {
            if (val === 1) {
                arr.push(items[i]);
            }
            return arr;
        }, []);
    }

    public static getMatchingPattern(items: string[], patterns: number[][], wildItemId?: string): number[] {
        let r: number[];
        for (let i: number = 0; i < patterns.length; i++) {
            if (this.isMatchPattern(items, patterns[i])) {
                r = patterns[i];
                break;
            }
        }
        return r;
    }

    public static isMatchPattern(items: string[], pattern: number[], wildItemId?: string): boolean {
        let itemsByPattern = this.getItemsMatchingPattern(items, pattern);
        let unique = itemsByPattern.filter((value, index, self) => {
            return self.indexOf(value) === index;
        });
        return unique.length === 1 || (unique.length === 2 && unique.indexOf(wildItemId) >= 0);
    }

    public static getWinningItemId(items: string[], pattern: number[], wildItemId?: string): string {
        let itemsByPattern = this.getItemsMatchingPattern(items, pattern);
        let unique = itemsByPattern.filter((value, index, self) => {
            return self.indexOf(value) === index;
        });
        return unique.reduce((prev, cur) => {
            if (cur !== wildItemId) {
                prev = cur;
            }
            return prev;
        });
    }

    public static getWildItemsPositions(items: string[], pattern: number[], wildItemId: string): number[] {
        return items.reduce((arr, item, i) => {
            if (item === wildItemId && pattern[i] === 1) {
                arr.push(i);
            }
            return arr;
        }, []);
    }

    public static getScatterItemsPositions(items: string[][], scatterItemId: string): number[][] {
        let r: number[][];
        for (let i: number = 0; i < items.length; i++) {
            for (let j: number = 0; j < items[i].length; j++) {
                if (items[i][j] === scatterItemId) {
                    if (!r) {
                        r = [];
                    }
                    r.push([i, j]);
                }
            }
        }
        return r;
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
                if (this._config.isItemScatter(itemId)) {
                    break;
                }
                prevItemId = itemId;
                if (this._config.isItemWild(itemId)) {
                    wildItemsPositions.push(dirX);
                }
                itemsPositions.push(dirX);
            } else {
                if (
                    (itemId !== prevItemId && !this._config.isItemWild(itemId)) ||
                    (itemsPositions.length === direction.length - 1 && (itemId === prevItemId || this._config.isItemWild(itemId)))
                ) {
                    if (itemsPositions.length === direction.length - 1 && (itemId === prevItemId || this._config.isItemWild(itemId) || this._config.isItemWild(prevItemId))) {
                        if (this._config.isItemWild(itemId)) {
                            wildItemsPositions.push(dirX);
                        }
                        itemsPositions.push(dirX);
                    }
                    if (this._config.isItemWild(prevItemId)) {
                        for (let i: number = 0; i < itemsPositions.length; i++) {
                            if (!this._config.isItemWild(this._items[direction[i]][itemsPositions[i]])) {
                                prevItemId = this._items[direction[i]][itemsPositions[i]];
                                break;
                            }
                        }
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
                    if (this._config.isItemWild(itemId)) {
                        wildItemsPositions.push(dirX);
                    }
                    itemsPositions.push(dirX);
                }
            }
        }
        return line;
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
