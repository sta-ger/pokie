import {
    LinesDefinitionsDescribing,
    LinesPatternsDescribing,
    PaytableRepresenting,
    SymbolsSequenceDescribing,
    VideoSlotConfig,
    VideoSlotWithFreeGamesConfigRepresenting,
} from "pokie";

export class VideoSlotWithFreeGamesConfig<T extends string | number | symbol = string>
implements VideoSlotWithFreeGamesConfigRepresenting<T> {
    private readonly baseConfig: VideoSlotConfig<T>;
    private readonly freeGamesForScattersMap: Record<T, Record<number, number>>;

    constructor(baseConfig = new VideoSlotConfig<T>()) {
        this.baseConfig = baseConfig;
        // The default scatter symbol ID ("S") is a string literal — safe for the default
        // `T = string`, but TS can't prove an arbitrary `T` accepts it, hence the cast.
        this.freeGamesForScattersMap =
            VideoSlotWithFreeGamesConfig.createFreeGamesForScattersMap() as unknown as Record<
                T,
                Record<number, number>
            >;
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

    public getFreeGamesForScatters(symbolId: T, numberOfSymbols: number): number {
        if (
            !Reflect.has(this.freeGamesForScattersMap, symbolId) ||
            !Reflect.has(this.freeGamesForScattersMap[symbolId], numberOfSymbols)
        ) {
            return 0;
        } else {
            return this.freeGamesForScattersMap[symbolId][numberOfSymbols];
        }
    }

    public setFreeGamesForScatters(symbolId: T, numberOfSymbols: number, freeGamesNum: number): void {
        if (!Reflect.has(this.freeGamesForScattersMap, symbolId)) {
            this.freeGamesForScattersMap[symbolId] = {};
        }
        this.freeGamesForScattersMap[symbolId][numberOfSymbols] = freeGamesNum;
    }

    public isSymbolWild(symbolId: T): boolean {
        return this.baseConfig.isSymbolWild(symbolId);
    }

    public isSymbolScatter(symbolId: T): boolean {
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

    public getPaytable(): PaytableRepresenting<T> {
        return this.baseConfig.getPaytable();
    }

    public setPaytable(paytable: PaytableRepresenting<T>): void {
        this.baseConfig.setPaytable(paytable);
    }

    public getWildSymbols(): T[] {
        return this.baseConfig.getWildSymbols();
    }

    public setWildSymbols(value: T[]): void {
        this.baseConfig.setWildSymbols(value);
    }

    public getWildSubstitutions(): Partial<Record<T, T[]>> {
        return this.baseConfig.getWildSubstitutions();
    }

    public setWildSubstitutions(value: Partial<Record<T, T[]>>): void {
        this.baseConfig.setWildSubstitutions(value);
    }

    public getScatterSymbols(): T[] {
        return this.baseConfig.getScatterSymbols();
    }

    public setScatterSymbols(scattersData: T[]): void {
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

    public getAvailableSymbols(): T[] {
        return [...this.baseConfig.getAvailableSymbols()];
    }

    public setAvailableSymbols(availableSymbols: T[]): void {
        this.baseConfig.setAvailableSymbols([...availableSymbols]);
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing<T>[] {
        return this.baseConfig.getSymbolsSequences();
    }

    public setSymbolsSequences(reelsSymbolsSequences: SymbolsSequenceDescribing<T>[]): void {
        this.baseConfig.setSymbolsSequences(reelsSymbolsSequences);
    }
}
