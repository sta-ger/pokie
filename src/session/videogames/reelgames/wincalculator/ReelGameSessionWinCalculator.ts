import {IReelGameSessionWinCalculator} from "./IReelGameSessionWinCalculator";
import {IReelGameSessionWinningLineModel} from "./IReelGameSessionWinningLineModel";
import {IReelGameSessionWinningScatterModel} from "./IReelGameSessionWinningScatterModel";
import {ReelGameSessionWinningScatterModel} from "./ReelGameSessionWinningScatterModel";
import {ReelGameSessionWinningLineModel} from "./ReelGameSessionWinningLineModel";
import {IReelGameSessionWinCalculatorConfig} from "./IReelGameSessionWinCalculatorConfig";

export class ReelGameSessionWinCalculator implements IReelGameSessionWinCalculator {
    public static createLinesPatterns(reelsNumber: number): number[][] {
        const r = [];
        for (let i = 0; i < reelsNumber - 1; i++) {
            const arr = new Array(reelsNumber + 1)
                .join("0")
                .split("")
                .map((item) => parseInt(item, 10));
            for (let j = 0; j < reelsNumber - i; j++) {
                arr[j] = 1;
            }
            r.push(arr);
        }
        return r;
    }

    public static getItemsForDirection(items: string[][], direction: number[]): string[] {
        let r: string[];
        r = direction.map((row, col) => {
            return items[col][row];
        });
        return r;
    }

    public static getItemsMatchingPattern(items: string[], pattern: number[]): string[] {
        return pattern.reduce((arr: string[], val, i) => {
            if (val === 1) {
                arr.push(items[i]);
            }
            return arr;
        }, []);
    }

    public static getMatchingPattern(items: string[], patterns: number[][], wildItemId?: string): number[] {
        let r: number[] = [];
        for (const pattern of patterns) {
            if (this.isMatchPattern(items, pattern, wildItemId)) {
                r = pattern;
                break;
            }
        }
        return r;
    }

    public static isMatchPattern(items: string[], pattern: number[], wildItemId: string = ""): boolean {
        const itemsByPattern = this.getItemsMatchingPattern(items, pattern);
        const unique = itemsByPattern.filter((value, index, self) => {
            return self.indexOf(value) === index;
        });
        return unique.length === 1 || (unique.length === 2 && unique.indexOf(wildItemId) >= 0);
    }

    public static getWinningItemId(items: string[], pattern: number[], wildItemId?: string): string {
        const itemsByPattern = this.getItemsMatchingPattern(items, pattern);
        const unique = itemsByPattern.filter((value, index, self) => {
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
        return items.reduce((arr: number[], item: string, i: number) => {
            if (item === wildItemId && pattern[i] === 1) {
                arr.push(i);
            }
            return arr;
        }, []);
    }

    public static getScatterItemsPositions(items: string[][], scatterItemId: string): number[][] {
        const r: number[][] = [];
        for (let i: number = 0; i < items.length; i++) {
            for (let j: number = 0; j < items[i].length; j++) {
                if (items[i][j] === scatterItemId) {
                    r.push([i, j]);
                }
            }
        }
        return r;
    }

    public static getWinningLinesIds(
        items: string[][],
        linesDirections: { [lineId: string]: number[] },
        patterns: number[][],
        wildItemId?: string,
    ): string[] {
        return Object.keys(linesDirections).reduce((arr: string[], lineId) => {
            const itemsLine: string[] = ReelGameSessionWinCalculator.getItemsForDirection(
                items, linesDirections[lineId],
            );
            const mPattern = ReelGameSessionWinCalculator.getMatchingPattern(itemsLine, patterns, wildItemId);
            if (mPattern.length > 0) {
                arr.push(lineId);
            }
            return arr;
        }, []);
    }

    public static getLinesWithSymbol(
        lines: { [lineId: string]: IReelGameSessionWinningLineModel }, symbolId: string,
    ): IReelGameSessionWinningLineModel[] {
        // TODO test
        const r: IReelGameSessionWinningLineModel[] = [];
        for (const line of Object.values(lines)) {
            if (line.itemId === symbolId) {
                r.push(line);
            }
        }
        return r;
    }

    public static getLinesWithDifferentSymbols(
        lines: { [lineId: string]: IReelGameSessionWinningLineModel },
    ): IReelGameSessionWinningLineModel[] {
        // TODO test
        const symbols: string[] = [];
        const r: IReelGameSessionWinningLineModel[] = [];
        for (const line of Object.values(lines)) {
            if (symbols.indexOf(line.itemId) < 0) {
                symbols.push(line.itemId);
                r.push(line);
            }
        }
        return r;
    }

    public static isAllLinesHasSameItemId(lines: { [lineId: string]: IReelGameSessionWinningLineModel }): boolean {
        // TODO test
        let id: string | undefined;
        let r: boolean = true;
        for (const line of Object.values(lines)) {
            if (!id) {
                id = line.itemId;
                continue;
            }
            if (Object.keys(line).length > 1 && id !== line.itemId) {
                r = false;
                break;
            }
        }
        return r;
    }

    public static getLinesContainingItem(
        lines: { [lineId: string]: IReelGameSessionWinningLineModel },
        items: string[][],
        itemId: string,
    ): IReelGameSessionWinningLineModel[] {
        // TODO test
        const r: IReelGameSessionWinningLineModel[] = [];
        for (const line of Object.values(lines)) {
            const lineItems: string[] = ReelGameSessionWinCalculator.getItemsForDirection(items, line.direction);
            for (const item of lineItems) {
                if (item === itemId) {
                    r.push(line);
                    break;
                }
            }
        }
        return r;
    }

    private readonly _config: IReelGameSessionWinCalculatorConfig;
    private readonly _reelsItemsNumber: number;
    private readonly _reelsNumber: number;
    private readonly _wildItemId: string;
    private readonly _scatters: any[][];
    private readonly _linesDirections: { [lineId: string]: number[] };
    private readonly _wildsMultipliers: {
        [wildsNum: number]: number,
    };
    private readonly _paytable: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number,
            },
        },
    };

    private _items: string[][] = [];
    private _winningLines: { [lineId: string]: IReelGameSessionWinningLineModel } = {};
    private _winningScatters: { [scatterItemId: string]: IReelGameSessionWinningScatterModel } = {};

    private readonly _linesPatterns: number[][];
    private _linesWinning: number = 0;
    private _scattersWinning: number = 0;

    constructor(conf: IReelGameSessionWinCalculatorConfig) {
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

    public getWinningAmount(): number {
        return this.getLinesWinning() + this.getScattersWinning();
    }

    public getLinesWinning(): number {
        return this._linesWinning;
    }

    public getScattersWinning(): number {
        return this._scattersWinning;
    }

    public setGameState(bet: number, items: string[][]): void {
        if (this._paytable.hasOwnProperty(bet)) {
            this._items = items;
            this.calculateWinning(bet);
        } else {
            throw new Error(`Bet ${bet} does not specified at paytable`);
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
        let winningLinesIds: string[];
        this._winningLines = {};
        this._linesWinning = 0;
        winningLinesIds = ReelGameSessionWinCalculator.getWinningLinesIds(
            this._items, this._linesDirections, this._linesPatterns, this._wildItemId,
        );
        for (lineId of winningLinesIds) {
            line = this.generateWinningLine(bet, lineId);
            if (this._config.scatters.filter(
                (scatterData: any[]) => scatterData[0] === line.itemId
            ).length === 0 && line.winningAmount > 0) {
                this._winningLines[lineId] = line;
                this._linesWinning += line.winningAmount;
            }
        }
        this._scattersWinning = 0;
        this._winningScatters = this.generateWinningScatters(bet);
        Object.keys(this._winningScatters).forEach((scatterId) => {
            this._scattersWinning += this._winningScatters[scatterId].winningAmount;
        });
    }

    private generateWinningScatters(bet: number): { [scatterItemId: string]: IReelGameSessionWinningScatterModel } {
        let rv: { [scatterItemId: string]: IReelGameSessionWinningScatterModel };
        let scatter: any[];
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
                if (curScatterItemsPositions && curScatterItemsPositions.length >= curScatterMinItemsForWin) {
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
        return ReelGameSessionWinCalculator.getScatterItemsPositions(this._items, itemId);
    }

    private generateWinningLine(bet: number, lineId: string): IReelGameSessionWinningLineModel {
        let line: IReelGameSessionWinningLineModel;
        let direction: number[];
        let itemsLine: string[];
        let pattern: number[];
        direction = this._linesDirections[lineId];
        itemsLine = ReelGameSessionWinCalculator.getItemsForDirection(this._items, direction);
        pattern = ReelGameSessionWinCalculator.getMatchingPattern(itemsLine, this._linesPatterns, this._wildItemId);
        line = new ReelGameSessionWinningLineModel();
        line.winningAmount = 0;
        line.direction = direction;
        line.lineId = lineId;
        line.itemsPositions = pattern.reduce((arr: number[], val, i) => {
            if (val === 1) {
                arr.push(i);
            }
            return arr;
        }, []);
        line.wildItemsPositions = ReelGameSessionWinCalculator.getWildItemsPositions(
            itemsLine, pattern, this._wildItemId,
        );
        line.itemId = ReelGameSessionWinCalculator.getWinningItemId(itemsLine, pattern, this._wildItemId);
        line.winningAmount = this.getLineWinningAmount(bet, line);
        return line;
    }

    private getLineWinningAmount(bet: number, line: IReelGameSessionWinningLineModel): number {
        let rv: number = 0;
        if (
            this._paytable[bet] &&
            this._paytable[bet][line.itemId] &&
            this._paytable[bet][line.itemId][line.itemsPositions.length]
        ) {
            rv = this._paytable[bet][line.itemId][line.itemsPositions.length]
                * (this._wildsMultipliers.hasOwnProperty(line.wildItemsPositions.length)
                    ? this._wildsMultipliers[line.wildItemsPositions.length] : 1);
        }
        return rv;
    }

    private getScatterWinningAmount(bet: number, model: IReelGameSessionWinningScatterModel): number {
        let rv: number;
        if (
            this._paytable[bet] &&
            this._paytable[bet][model.itemId] &&
            this._paytable[bet][model.itemId][model.itemsPositions.length]
        ) {
            rv = this._paytable[bet][model.itemId][model.itemsPositions.length];
        } else {
            rv = 0;
        }
        return rv;
    }

}
