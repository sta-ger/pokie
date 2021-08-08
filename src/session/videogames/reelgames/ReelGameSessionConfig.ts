import {IReelGameSessionConfig} from "./IReelGameSessionConfig";
import {GameSessionConfig} from "../../GameSessionConfig";

export type ReelGameSessionPaytable = {
    [bet: number]: {
        [itemId: string]: {
            [times: number]: number,
        },
    },
};

export class ReelGameSessionConfig extends GameSessionConfig implements IReelGameSessionConfig {
    public static createLinesDirections(reelsNumber: number, reelsItemsNumber: number): { [lineId: string]: number[] } {
        const r: { [lineId: string]: number[] } = {};
        for (let i: number = 0; i < reelsItemsNumber; i++) {
            for (let j: number = 0; j < reelsNumber; j++) {
                if (!r[i]) {
                    r[i] = [];
                }
                r[i].push(i);
            }
        }
        return r;
    }

    public static createReelsItemsSequences(reelsNumber: number, availableItems: string[]): string[][] {
        const r = [];
        for (let i = 0; i < reelsNumber; i++) {
            r[i] = availableItems.reduce(
                (ob) => [...ob, ...availableItems], availableItems).sort(() => Math.random() - 0.5,
            );
        }
        return r;
    }

    public static createPaytable(
        availableBets: number[],
        availableItems: string[],
        reelsNumber: number,
        wildItemId?: string,
    ): ReelGameSessionPaytable {
        const r: ReelGameSessionPaytable = {};
        for (const bet of availableBets) {
            r[bet] = {};
            for (const itemId of availableItems) {
                if (itemId !== wildItemId) {
                    r[bet][itemId] = {};
                    for (let k = 3; k <= reelsNumber; k++) {
                        r[bet][itemId][k] = (k - 2) * bet;
                    }
                }
            }
        }
        return r;
    }

    private _paytable: ReelGameSessionPaytable;

    private _availableItems: string[];

    private _wildItemId: string;

    private _scatters: [string, number][];

    private _reelsNumber: number;

    private _reelsItemsNumber: number;

    private _reelsItemsSequences: string[][];

    private _linesDirections: { [lineId: string]: number[] };

    private _wildsMultipliers: { [wildsNum: number]: number };

    constructor(reelsNumber: number = 5, reelsItemsNumber: number = 3) {
        super();

        this._availableItems = [
            "A",
            "K",
            "Q",
            "J",
            "10",
            "9",
            "W",
            "S",
        ];

        this._wildItemId = "W";

        this._scatters = [
            ["S", 3],
        ];

        this._wildsMultipliers = {};
        let j = 2;
        for (let i = 1; i < reelsNumber; i++) {
            this._wildsMultipliers[i] = j;
            j += 2;
        }

        this._reelsNumber = reelsNumber;
        this._reelsItemsNumber = reelsItemsNumber;
        this._linesDirections = ReelGameSessionConfig.createLinesDirections(this._reelsNumber, this._reelsItemsNumber);
        this._reelsItemsSequences = ReelGameSessionConfig.createReelsItemsSequences(
            this._reelsNumber, this._availableItems,
        );
        this._paytable = ReelGameSessionConfig.createPaytable(
            this.availableBets, this._availableItems, this._reelsNumber, this._wildItemId,
        );
    }

    public get linesDirections(): {} {
        return this._linesDirections;
    }

    public set linesDirections(value: {}) {
        this._linesDirections = value;
    }

    public get reelsItemsSequences(): string[][] {
        return this._reelsItemsSequences;
    }

    public set reelsItemsSequences(value: string[][]) {
        this._reelsItemsSequences = value;
    }

    public get reelsItemsNumber(): number {
        return this._reelsItemsNumber;
    }

    public set reelsItemsNumber(value: number) {
        this._reelsItemsNumber = value;
        this._linesDirections = ReelGameSessionConfig.createLinesDirections(this._reelsNumber, this._reelsItemsNumber);
    }

    public get reelsNumber(): number {
        return this._reelsNumber;
    }

    public set reelsNumber(value: number) {
        this._reelsNumber = value;
        this._linesDirections = ReelGameSessionConfig.createLinesDirections(this._reelsNumber, this._reelsItemsNumber);
    }

    public get scatters(): [string, number][] {
        return this._scatters;
    }

    public set scatters(value: [string, number][]) {
        this._scatters = value;
    }

    public get wildItemId(): string {
        return this._wildItemId;
    }

    public set wildItemId(value: string) {
        this._wildItemId = value;
    }

    public get availableItems(): string[] {
        return this._availableItems;
    }

    public set availableItems(value: string[]) {
        this._availableItems = value;
        this._reelsItemsSequences = ReelGameSessionConfig.createReelsItemsSequences(
            this._reelsNumber, this._availableItems,
        );
        this._paytable = ReelGameSessionConfig.createPaytable(
            this.availableBets, this._availableItems, this._reelsNumber, this._wildItemId,
        );
    }

    public get paytable(): { [p: number]: { [p: string]: { [p: number]: number } } } {
        return this._paytable;
    }

    public set paytable(value: { [p: number]: { [p: string]: { [p: number]: number } } }) {
        this._paytable = value;
    }

    public get wildsMultipliers(): { [p: number]: number } {
        return this._wildsMultipliers;
    }

    public set wildsMultipliers(value: { [p: number]: number }) {
        this._wildsMultipliers = value;
    }

    public isItemScatter(itemId: string): boolean {
        return this._scatters && this._scatters.reduce((flag: boolean, entry) => {
            if (!flag && itemId === entry[0]) {
                flag = true;
            }
            return flag;
        }, false);
    }

    public isItemWild(itemId: string): boolean {
        return itemId === this._wildItemId;
    }

}
