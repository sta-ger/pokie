import {
    GameSessionConfig,
    HorizontalLines,
    LeftToRightLinesPatterns,
    LinesDefinitionsDescribing,
    LinesPatternsDescribing,
    Paytable,
    PaytableRepresenting,
    SymbolsSequence,
    SymbolsSequenceDescribing,
    VideoSlotConfigRepresenting,
} from "pokie";

export class VideoSlotConfig implements VideoSlotConfigRepresenting {
    private readonly baseConfig: GameSessionConfig;

    private reelsNumber: number;
    private reelsSymbolsNumber: number;
    private availableSymbols: string[];
    private wilds: string[];
    private reelsSymbolsSequences: SymbolsSequenceDescribing[];
    private paytable: PaytableRepresenting;
    private scatters: string[];
    private linesDefinitions: LinesDefinitionsDescribing;
    private linesPatterns: LinesPatternsDescribing;

    constructor(baseConfig = new GameSessionConfig()) {
        this.baseConfig = baseConfig;
        this.reelsNumber = 5;
        this.reelsSymbolsNumber = 3;
        this.availableSymbols = ["A", "K", "Q", "J", "10", "9", "W", "S"];
        this.wilds = ["W"];
        this.paytable = new Paytable(
            this.getAvailableBets(),
            this.availableSymbols.filter((symbol) => !this.isSymbolWild(symbol)),
            this.wilds,
            this.reelsNumber,
        );
        this.scatters = ["S"];
        this.linesDefinitions = new HorizontalLines(this.reelsNumber, this.reelsSymbolsNumber);
        this.linesPatterns = new LeftToRightLinesPatterns(this.reelsNumber);
        this.reelsSymbolsSequences = this.createReelsSymbolsSequences();
    }

    public getPaytable(): PaytableRepresenting {
        return this.paytable;
    }

    public setPaytable(paytable: PaytableRepresenting): void {
        this.paytable = paytable;
    }

    public getWildSymbols(): string[] {
        return this.wilds;
    }

    public setWildSymbols(value: string[]): void {
        this.wilds = value;
    }

    public getScatterSymbols(): string[] {
        return this.scatters.slice();
    }

    public setScatterSymbols(value: string[]): void {
        this.scatters = value.slice();
    }

    public getLinesDefinitions(): LinesDefinitionsDescribing {
        return this.linesDefinitions;
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        return this.linesPatterns;
    }

    public setLinesDefinitions(linesDefinitions: LinesDefinitionsDescribing): void {
        this.linesDefinitions = linesDefinitions;
    }

    public setLinesPatterns(linesPatterns: LinesPatternsDescribing): void {
        this.linesPatterns = linesPatterns;
    }

    public getReelsSymbolsNumber(): number {
        return this.reelsSymbolsNumber;
    }

    public setReelsSymbolsNumber(reelsSymbolsNumber: number): void {
        this.reelsSymbolsNumber = reelsSymbolsNumber;
        this.linesDefinitions = new HorizontalLines(this.reelsNumber, this.reelsSymbolsNumber);
    }

    public getReelsNumber(): number {
        return this.reelsNumber;
    }

    public setReelsNumber(reelsNumber: number): void {
        this.reelsNumber = reelsNumber;
        this.linesDefinitions = new HorizontalLines(this.reelsNumber, this.reelsSymbolsNumber);
        this.linesPatterns = new LeftToRightLinesPatterns(this.reelsNumber);
    }

    public getAvailableSymbols(): string[] {
        return this.availableSymbols.slice();
    }

    public setAvailableSymbols(availableSymbols: string[]): void {
        this.availableSymbols = availableSymbols.slice();
        this.paytable = new Paytable(
            this.getAvailableBets(),
            this.availableSymbols.filter((symbol) => !this.isSymbolWild(symbol)),
            this.wilds,
            this.reelsNumber,
        );
        this.reelsSymbolsSequences = this.createReelsSymbolsSequences();
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing[] {
        return this.reelsSymbolsSequences;
    }

    public setSymbolsSequences(reelsSymbolsSequences: SymbolsSequenceDescribing[]): void {
        this.reelsSymbolsSequences = reelsSymbolsSequences;
    }

    public isSymbolWild(symbolId: string): boolean {
        return this.wilds.includes(symbolId);
    }

    public isSymbolScatter(symbolId: string): boolean {
        return this.scatters.some((s) => s === symbolId);
    }

    public setAvailableBets(availableBets: number[]): void {
        this.baseConfig.setAvailableBets(availableBets.slice());
    }

    public getAvailableBets(): number[] {
        return this.baseConfig.getAvailableBets().slice();
    }

    public isBetAvailable(bet: number): boolean {
        return this.baseConfig.isBetAvailable(bet);
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

    private createReelsSymbolsSequences(): SymbolsSequenceDescribing[] {
        const r: SymbolsSequenceDescribing[] = [];
        const reel0 = new SymbolsSequence();
        const availableSymbols = this.availableSymbols.filter((symbolId) => {
            return !this.isSymbolScatter(symbolId) && !this.isSymbolWild(symbolId);
        });
        reel0.fromNumberOfEachSymbol(availableSymbols, 15);
        this.wilds.forEach((wild) => reel0.addSymbol(wild, 5));
        this.scatters.forEach((scatter) => reel0.addSymbol(scatter, 3));
        while (
            reel0
                .getSymbolsStacksIndexes()
                .some((stack) => this.scatters.some((scatter) => scatter === reel0.getSymbol(stack.index)))
        ) {
            reel0.shuffle();
        }
        r.push(reel0);
        for (let i = 1; i < this.reelsNumber; i++) {
            const reel = new SymbolsSequence();
            reel.fromArray(reel0.toArray());
            r.push(reel);
        }
        return r;
    }
}
