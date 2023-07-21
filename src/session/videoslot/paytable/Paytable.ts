import {PaytableRepresenting} from "pokie";

export class Paytable implements PaytableRepresenting {
    private paytableMap: Record<number, Record<string, Record<number, number>>>;

    constructor(availableBets: number[], availableSymbols?: string[], wildSymbols?: string[], reelsNumber?: number) {
        this.paytableMap = Paytable.createDefaultPaytableMap(availableBets, availableSymbols, wildSymbols, reelsNumber);
    }

    private static createDefaultPaytableMap(
        availableBets: number[],
        availableSymbols?: string[],
        wildSymbols?: string[],
        reelsNumber?: number,
    ): Record<number, Record<string, Record<number, number>>> {
        const paytableMap: Record<number, Record<string, Record<number, number>>> = {};
        for (const bet of availableBets) {
            paytableMap[bet] = {};
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

    public getWinAmountForSymbol(symbolId: string, numberOfSymbols: number, bet: number): number {
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

    public getNumbersOfSymbolsForBet(bet: number, symbolId: string): number[] {
        return Object.keys(this.paytableMap[bet][symbolId]).map((num) => parseInt(num, 10));
    }

    public toMap(): Record<number, Record<string, Record<number, number>>> {
        return JSON.parse(JSON.stringify(this.paytableMap));
    }

    public getAvailableSymbolsForBet(bet: number): string[] {
        return Object.keys(this.paytableMap[bet]);
    }

    public setPayoutForSymbol(symbolId: string, times: number, betMultiplier: number, bet?: number) {
        if (bet !== undefined) {
            this.paytableMap[bet][symbolId][times] = betMultiplier * bet;
        } else {
            Object.keys(this.paytableMap).forEach((bet) => {
                const intBet = parseInt(bet, 10);
                if (!this.paytableMap[bet]) {
                    this.paytableMap[bet] = {};
                }
                if (!this.paytableMap[bet][symbolId]) {
                    this.paytableMap[bet][symbolId] = {};
                }
                this.paytableMap[bet][symbolId][times] = betMultiplier * intBet;
            });
        }
    }

    public fromMap(map: Record<number, Record<string, Record<number, number>>>): this {
        this.paytableMap = JSON.parse(JSON.stringify(map));
        return this;
    }
}
