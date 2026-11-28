import type {PaytableRepresenting} from "./PaytableRepresenting.js";

export type PaytableOptions = {
    /**
     * Legacy default: fills a provisional `3..reelsNumber` ladder for every non-wild symbol passed to the
     * constructor. Set false when the symbol list is only a declaration (for example a mystery/bonus
     * symbol that must never pay) and every payout will be authored explicitly with
     * `setPayoutForSymbol`/`fromMap`.
     */
    readonly autoFillPayouts?: boolean;
};

export class Paytable<T extends string | number | symbol = string> implements PaytableRepresenting<T> {
    private paytableMap: Record<number, Record<T, Record<number, number>>>;

    constructor(availableBets: number[], availableSymbols?: T[], wildSymbols?: T[], reelsNumber?: number, options: PaytableOptions = {}) {
        this.paytableMap = Paytable.createDefaultPaytableMap(
            availableBets,
            availableSymbols,
            wildSymbols,
            reelsNumber,
            options.autoFillPayouts !== false,
        );
    }

    /**
     * Declares symbols without inventing any payouts for them. Equivalent to the constructor with
     * `{autoFillPayouts: false}`; authors then call `setPayoutForSymbol`/`fromMap` for exactly the
     * symbols that should pay.
     */
    public static explicit<T extends string | number | symbol = string>(
        availableBets: number[],
        availableSymbols?: T[],
        wildSymbols?: T[],
    ): Paytable<T> {
        return new Paytable<T>(availableBets, availableSymbols, wildSymbols, undefined, {autoFillPayouts: false});
    }

    private static createDefaultPaytableMap<T extends string | number | symbol = string>(
        availableBets: number[],
        availableSymbols?: T[],
        wildSymbols?: T[],
        reelsNumber?: number,
        autoFillPayouts = true,
    ): Record<number, Record<T, Record<number, number>>> {
        const paytableMap = {} as Record<number, Record<T, Record<number, number>>>;
        for (const bet of availableBets) {
            paytableMap[bet] = {} as Record<T, Record<number, number>>;
            if (availableSymbols) {
                for (const symbolId of availableSymbols) {
                    if (!wildSymbols?.some((wildSymbolId) => symbolId === wildSymbolId)) {
                        paytableMap[bet][symbolId] = {};
                        if (autoFillPayouts && reelsNumber !== undefined) {
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
        return Object.keys(this.paytableMap).map((key) => Number(key));
    }

    public getNumbersOfSymbolsForBet(bet: number, symbolId: T): number[] {
        const symbols = this.paytableMap[bet];
        if (symbols === undefined || symbols[symbolId] === undefined) return [];
        return Object.keys(symbols[symbolId]).map((num) => parseInt(num, 10));
    }

    public toMap(): Record<number, Record<T, Record<number, number>>> {
        return JSON.parse(JSON.stringify(this.paytableMap));
    }

    public getAvailableSymbolsForBet(bet: number): T[] {
        const symbols = this.paytableMap[bet];
        return symbols === undefined ? [] : Object.keys(symbols) as T[];
    }

    public setPayoutForSymbol(symbolId: T, times: number, betMultiplier: number, bet?: number) {
        if (bet !== undefined) {
            this.paytableMap[bet][symbolId][times] = betMultiplier * bet;
        } else {
            Object.keys(this.paytableMap).forEach((bet) => {
                const numericBet = Number(bet);
                if (!this.paytableMap[numericBet]) {
                    this.paytableMap[numericBet] = {} as Record<T, Record<number, number>>;
                }
                if (!this.paytableMap[numericBet][symbolId]) {
                    this.paytableMap[numericBet][symbolId] = {};
                }
                this.paytableMap[numericBet][symbolId][times] = betMultiplier * numericBet;
            });
        }
    }

    public fromMap(map: Record<number, Record<T, Record<number, number>>>): this {
        this.paytableMap = JSON.parse(JSON.stringify(map));
        return this;
    }
}
