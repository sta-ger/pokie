import {IReelGameSessionReelsController} from "./IReelGameSessionReelsController";
import {IReelGameSessionReelsControllerConfig} from "./IReelGameSessionReelsControllerConfig";

export class ReelGameSessionReelsController implements IReelGameSessionReelsController {
    public static createItemsSequences(
        reelsNumber: number,
        availableItems: string[],
        countsOfItems?: { [reelId: number]: { [itemId: string]: number } } | number,
    ): string[][] {
        let rv: string[][];
        let i: number;
        let reelId: number;
        rv = [];
        for (i = 0; i < reelsNumber; i++) {
            reelId = i;
            if (typeof countsOfItems === "number") {
                rv[reelId] = this.createItemsSequence(availableItems, countsOfItems);
            } else {
                rv[reelId] = this.createItemsSequence(
                    availableItems, (
                        countsOfItems && countsOfItems.hasOwnProperty(reelId) ? countsOfItems[reelId] : undefined
                    ),
                );
            }
        }
        return rv;
    }

    public static createItemsSequence(
        availableItems: string[],
        countsOfItems?: { [itemId: string]: number } | number | undefined,
    ): string[] {
        let i: number;
        let itemId: string;
        let rv: string[];
        rv = [];
        for (itemId of availableItems) {
            let countIoItems: { [p: string]: number } | number;
            if (typeof countsOfItems === "number") {
                countIoItems = countsOfItems;
            } else {
                countIoItems = countsOfItems && countsOfItems.hasOwnProperty(itemId) ? countsOfItems[itemId] : 1;
            }
            for (i = 0; i < countIoItems; i++) {
                rv.push(itemId);
            }
        }
        for (i = rv.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rv[i], rv[j]] = [rv[j], rv[i]];
        }
        return rv;
    }

    public static transposeMatrix(source: any[][]): any[][] {
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

    private readonly _reelsNumber: number;
    private readonly _reelsItemsNumber: number;

    private readonly _reelsSequences: string[][];

    constructor(conf: IReelGameSessionReelsControllerConfig) {
        this._reelsNumber = conf.reelsNumber;
        this._reelsItemsNumber = conf.reelsItemsNumber;
        this._reelsSequences = conf.reelsItemsSequences;
    }

    public getRandomItemsCombination(): string[][] {
        let i: number;
        let rv: string[][];
        rv = [];
        for (i = 0; i < this._reelsNumber; i++) {
            rv[i] = this.getRandomReelItems(i);
        }
        return rv;
    }

    public getRandomReelItems(reelId: number): string[] {
        let rv: string[];
        let i: number;
        let placeOnSequence: number;
        let sequence: string[];
        let item: string;
        rv = [];
        sequence = this._reelsSequences[reelId];
        placeOnSequence = Math.floor(Math.random() * sequence.length);
        for (i = placeOnSequence; i < placeOnSequence + this._reelsItemsNumber; i++) {
            if (i > sequence.length - 1) {
                item = sequence[i - sequence.length];
            } else {
                item = sequence[i];
            }
            rv.push(item);
        }
        return rv;
    }

    public getRandomItem(reelId: number): string {
        let item: string;
        let sequence: string[];
        sequence = this._reelsSequences[reelId];
        item = sequence[Math.floor(Math.random() * sequence.length)];
        return item;
    }

}
