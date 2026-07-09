import type {PaytableRepresenting} from "./PaytableRepresenting.js";

export class Paytable<T extends string | number | symbol = string> implements PaytableRepresenting<T> {
    private paytableMap: Record<number, Record<T, Record<number, number>>>;

    constructor(availableBets: number[], availableSymbols?: T[], wildSymbols?: T[], reelsNumber?: number) {
        this.paytableMap = Paytable.createDefaultPaytableMap(availableBets, availableSymbols, wildSymbols, reelsNumber);
    }

    private static createDefaultPaytableMap<T extends string | number | symbol = string>(
        availableBets: number[],
        availableSymbols?: T[],
        wildSymbols?: T[],
        reelsNumber?: number,
    ): Record<number, Record<T, Record<number, number>>> {
        const paytableMap = {} as Record<number, Record<T, Record<number, number>>>;
        for (const bet of availableBets) {
            paytableMap[bet] = {} as Record<T, Record<number, number>>;
            if (availableSymbols) {
                for (const symbolId of availableSymbols) {
                    if (!wildSymbols?.some((wildSymbolId) => symbolId === wildSymbolId)) {
                        paytableMap[bet][symbolId] = {};
                        if (reelsNumber !== undefined) {
                            for (let k = 3; k <= reelsNumber; k++) {
                                paytableMap[bet][symbolId][k] = (k - 2) * bet;
                            }
                        }
                    }
                }
            }
        }
        return paytableMap;
    }

    public getWinAmountForSymbol(symbolId: T, numberOfSymbols: number, bet: number): number {
        let rv = 0;
        if (
            this.paytableMap[bet] &&
            this.paytableMap[bet][symbolId] &&
            this.paytableMap[bet][symbolId][numberOfSymbols]
        ) {
            rv = this.paytableMap[bet][symbolId][numberOfSymbols];
        }
        return rv;
    }

    public getAvailableBets(): number[] {
        return Object.keys(this.paytableMap).map((key) => parseInt(key, 10));
    }

    public getNumbersOfSymbolsForBet(bet: number, symbolId: T): number[] {
        return Object.keys(this.paytableMap[bet][symbolId]).map((num) => parseInt(num, 10));
    }

    public toMap(): Record<number, Record<T, Record<number, number>>> {
        return JSON.parse(JSON.stringify(this.paytableMap));
    }

    public getAvailableSymbolsForBet(bet: number): T[] {
        return Object.keys(this.paytableMap[bet]) as T[];
    }

    public setPayoutForSymbol(symbolId: T, times: number, betMultiplier: number, bet?: number) {
        if (bet !== undefined) {
            this.paytableMap[bet][symbolId][times] = betMultiplier * bet;
        } else {
            Object.keys(this.paytableMap).forEach((bet) => {
                const intBet = parseInt(bet, 10);
                if (!this.paytableMap[bet]) {
                    this.paytableMap[bet] = {} as Record<T, Record<number, number>>;
                }
                if (!this.paytableMap[bet][symbolId]) {
                    this.paytableMap[bet][symbolId] = {};
                }
                this.paytableMap[bet][symbolId][times] = betMultiplier * intBet;
            });
        }
    }

    public fromMap(map: Record<number, Record<T, Record<number, number>>>): this {
        this.paytableMap = JSON.parse(JSON.stringify(map));
        return this;
    }
}
