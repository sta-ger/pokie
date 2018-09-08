import {IReelGameSessionReelsController} from "./IReelGameSessionReelsController";
import {ReelGameSessionParameters} from "../../ReelGameSessionParameters";

export class ReelGameSessionReelsController implements IReelGameSessionReelsController {
    protected _reelsNumber: number;
    protected _reelsItemsNumber: number;
    
    protected _reelsItems: string[][];
    
    protected _reelsSequences: string[][];
    
    protected _itemsOnReelsSequencesNumbers: {
        [reelId: number]: {
            [itemId: string]: number
        }
    };
    protected _availableItems: string[];

    constructor() {
        this.initializeParameters();
        this.initialize();
    }
    
    protected initializeParameters() {
        this._availableItems = ReelGameSessionParameters.availableItems;
        this._reelsNumber = ReelGameSessionParameters.reelsNumber;
        this._reelsItemsNumber = ReelGameSessionParameters.reelsItemsNumber;
    }
    
    protected initialize(): void {
        this._itemsOnReelsSequencesNumbers = this.createItemsOnReelsSequencesNumbers();
        if (ReelGameSessionParameters.reelsItemsSequences !== undefined) {
            this._reelsSequences = ReelGameSessionParameters.reelsItemsSequences;
        } else {
            this._reelsSequences = this.createReelsSequences();
            ReelGameSessionParameters.reelsItemsSequences = this._reelsSequences;
        }
        this.updateReelsItems();
    }
    
    public spin(): void {
        this.updateReelsItems();
    }
    
    protected updateReelsItems(): void {
        this._reelsItems = this.getRandomItemsCombination();
    }
    
    public getItems(): string[][] {
        return this._reelsItems;
    }
    
    protected getRandomItemsCombination(): string[][] {
        let i: number;
        let rv: string[][];
        rv = [];
        for (i = 0; i < this._reelsNumber; i++) {
            rv[i] = this.getRandomReelsItems(i);
        }
        return rv;
    }
    
    protected getRandomReelsItems(reelId: number): string[] {
        let rv: string[];
        rv = this.getReelItemsFromSequenceAtRandomPlace(reelId);
        return rv;
    }
    
    protected getReelItemsFromSequenceAtRandomPlace(reelId: number): string[] {
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
    
    protected getRandomItem(x: number, y: number): string {
        let item: string;
        let sequence: string[];
        sequence = this._reelsSequences[x];
        item = sequence[Math.floor(Math.random() * sequence.length)];
        return item;
    }
    
    protected createReelsSequences(): string[][] {
        let rv: string[][];
        let i: number;
        let reelId: number;
        rv = [];
        for (i = 0; i < this._reelsNumber; i++) {
            reelId = i;
            rv[reelId] = this.createReelSequence(reelId);
        }
        return rv;
    }
    
    protected createReelSequence(reelId: number): string[] {
        let i: number;
        let itemId: string;
        let rv: string[];
        let itemsNumbersForReel: { [itemId: string]: number };
        rv = [];
        itemsNumbersForReel = this._itemsOnReelsSequencesNumbers[reelId];
        for (itemId in itemsNumbersForReel) {
            for (i = 0; i < itemsNumbersForReel[itemId]; i++) {
                rv.push(itemId);
            }
        }
        for (i = rv.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rv[i], rv[j]] = [rv[j], rv[i]];
        }
        return rv;
    }
    
    protected createItemsOnReelsSequencesNumbers(): {} {
        let rv: {};
        let i: number;
        let j: number;
        let item: string;
        let reelId: number;
        rv = {};
        for (i = 0; i < this._reelsNumber; i++) {
            reelId = i;
            rv[reelId] = {};
            for (j = 0; j < this._availableItems.length; j++) {
                item = this._availableItems[j];
                rv[reelId][item] = this.getItemOnReelSequenceNumber(reelId, item);
            }
        }
        return rv;
    }
    
    protected getItemOnReelSequenceNumber(reelId: number, itemId: string): number {
        let rv: number;
        rv = 1;
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
    
}
