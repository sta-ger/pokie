import {
    LinesDefinitionsDescribing,
    LinesPatternsDescribing,
    PaytableRepresenting,
    SymbolsSequenceDescribing,
    VideoSlotConfig,
    VideoSlotWithFreeGamesConfigRepresenting,
} from "pokie";

export class VideoSlotWithFreeGamesConfig implements VideoSlotWithFreeGamesConfigRepresenting {
    private readonly baseConfig: VideoSlotConfig;
    private readonly freeGamesForScattersMap: Record<string, Record<number, number>>;

    constructor(baseConfig = new VideoSlotConfig()) {
        this.baseConfig = baseConfig;
        this.freeGamesForScattersMap = VideoSlotWithFreeGamesConfig.createFreeGamesForScattersMap();
    }

    private static createFreeGamesForScattersMap(): Record<string, Record<number, number>> {
        const rv: Record<string, Record<number, number>> = {};
        const entry: Record<number, number> = {};
        entry[3] = 10;
        entry[4] = 15;
        entry[5] = 20;
        rv["S"] = entry;
        return rv;
    }

    public getFreeGamesForScatters(symbolId: string, numberOfSymbols: number): number {
        if (
            !Reflect.has(this.freeGamesForScattersMap, symbolId) ||
            !Reflect.has(this.freeGamesForScattersMap[symbolId], numberOfSymbols)
        ) {
            return 0;
        } else {
            return this.freeGamesForScattersMap[symbolId][numberOfSymbols];
        }
    }

    public setFreeGamesForScatters(symbolId: string, numberOfSymbols: number, freeGamesNum: number): void {
        if (!Reflect.has(this.freeGamesForScattersMap, symbolId)) {
            this.freeGamesForScattersMap[symbolId] = {};
        }
        this.freeGamesForScattersMap[symbolId][numberOfSymbols] = freeGamesNum;
    }

    public isSymbolWild(symbolId: string): boolean {
        return this.baseConfig.isSymbolWild(symbolId);
    }

    public isSymbolScatter(symbolId: string): boolean {
        return this.baseConfig.isSymbolScatter(symbolId);
    }

    public setAvailableBets(availableBets: number[]): void {
        this.baseConfig.setAvailableBets([...availableBets]);
    }

    public getAvailableBets(): number[] {
        return [...this.baseConfig.getAvailableBets()];
    }

    public isBetAvailable(bet: number): boolean {
        return this.baseConfig.isBetAvailable(bet);
    }

    public getPaytable(): PaytableRepresenting {
        return this.baseConfig.getPaytable();
    }

    public setPaytable(paytable: PaytableRepresenting): void {
        this.baseConfig.setPaytable(paytable);
    }

    public getWildSymbols(): string[] {
        return this.baseConfig.getWildSymbols();
    }

    public setWildSymbols(value: string[]): void {
        this.baseConfig.setWildSymbols(value);
    }

    public getScatterSymbols(): string[] {
        return this.baseConfig.getScatterSymbols();
    }

    public setScatterSymbols(scattersData: string[]): void {
        this.baseConfig.setScatterSymbols([...scattersData]);
    }

    public setCreditsAmount(creditsAmount: number): void {
        this.baseConfig.setCreditsAmount(creditsAmount);
    }

    public getCreditsAmount(): number {
        return this.baseConfig.getCreditsAmount();
    }

    public setBet(bet: number): void {
        this.baseConfig.setBet(bet);
    }

    public getBet(): number {
        return this.baseConfig.getBet();
    }

    public getReelsNumber(): number {
        return this.baseConfig.getReelsNumber();
    }

    public setReelsNumber(reelsNumber: number): void {
        this.baseConfig.setReelsNumber(reelsNumber);
    }

    public getReelsSymbolsNumber(): number {
        return this.baseConfig.getReelsSymbolsNumber();
    }

    public setReelsSymbolsNumber(reelsSymbolsNumber: number): void {
        this.baseConfig.setReelsSymbolsNumber(reelsSymbolsNumber);
    }

    public getLinesDefinitions(): LinesDefinitionsDescribing {
        return this.baseConfig.getLinesDefinitions();
    }

    public setLinesDefinitions(linesDefinitions: LinesDefinitionsDescribing): void {
        this.baseConfig.setLinesDefinitions(linesDefinitions);
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        return this.baseConfig.getLinesPatterns();
    }

    public setLinesPatterns(linesPatterns: LinesPatternsDescribing): void {
        this.baseConfig.setLinesPatterns(linesPatterns);
    }

    public getAvailableSymbols(): string[] {
        return [...this.baseConfig.getAvailableSymbols()];
    }

    public setAvailableSymbols(availableSymbols: string[]): void {
        this.baseConfig.setAvailableSymbols([...availableSymbols]);
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing[] {
        return this.baseConfig.getSymbolsSequences();
    }

    public setSymbolsSequences(reelsSymbolsSequences: SymbolsSequenceDescribing[]): void {
        this.baseConfig.setSymbolsSequences(reelsSymbolsSequences);
    }
}
