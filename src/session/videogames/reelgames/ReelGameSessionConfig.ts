import {IReelGameSessionConfig} from "./IReelGameSessionConfig";
import {GameSessionConfig} from "../../GameSessionConfig";

export class ReelGameSessionConfig extends GameSessionConfig implements IReelGameSessionConfig {
    private _paytable: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number
            }
        }
    };

    private _availableItems: string[];

    private _wildItemId: string;

    private _scatters: any[][];

    private _reelsNumber: number;

    private _reelsItemsNumber: number;

    private _reelsItemsSequences: string[][];

    private _linesDirections: {};

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
            "S"
        ];

        this._wildItemId = "W";

        this._scatters = [
            ["S", 3]
        ];

        this._reelsNumber = reelsNumber;
        this._reelsItemsNumber = reelsItemsNumber;
        this._linesDirections = ReelGameSessionConfig.createLinesDirections(this._reelsNumber, this._reelsItemsNumber);
        this._reelsItemsSequences = ReelGameSessionConfig.createReelsItemsSequences(this._reelsNumber, this._availableItems);
        this._paytable = ReelGameSessionConfig.createPaytable(this.availableBets, this._availableItems, this._reelsNumber, this._wildItemId);
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

    public get scatters(): any[][] {
        return this._scatters;
    }

    public set scatters(value: any[][]) {
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
        this._reelsItemsSequences = ReelGameSessionConfig.createReelsItemsSequences(this._reelsNumber, this._availableItems);
        this._paytable = ReelGameSessionConfig.createPaytable(this.availableBets, this._availableItems, this._reelsNumber, this._wildItemId);
    }

    public get paytable(): { [p: number]: { [p: string]: { [p: number]: number } } } {
        return this._paytable;
    }

    public set paytable(value: { [p: number]: { [p: string]: { [p: number]: number } } }) {
        this._paytable = value;
    }

    public static createLinesDirections(reelsNumber: number, reelsItemsNumber: number): {} {
        let r = [];
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
        let r = [];
        for (let i = 0; i < reelsNumber; i++) {
            r[i] = availableItems.reduce(ob => [...ob, ...availableItems], availableItems).sort(() => Math.random() - 0.5);
        }
        return r;
    }

    public static createPaytable(availableBets: number[], availableItems: string[], reelsNumber: number, wildItemId?: string): {} {
        let r = {};
        for (let i = 0; i < availableBets.length; i++) {
            let bet = availableBets[i];
            r[bet] = {};
            for (let j = 0; j < availableItems.length; j++) {
                let itemId = availableItems[j];
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

}
