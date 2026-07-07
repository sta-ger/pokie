import {
    GameSession,
    GameSessionHandling,
    LinesDefinitionsDescribing,
    LinesPatternsDescribing,
    PaytableRepresenting,
    SymbolsCombination,
    SymbolsCombinationDescribing,
    SymbolsCombinationsGenerating,
    SymbolsCombinationsGenerator,
    SymbolsSequenceDescribing,
    VideoSlotConfig,
    VideoSlotConfigRepresenting,
    VideoSlotSessionHandling,
    VideoSlotWinCalculating,
    VideoSlotWinCalculator,
    WinningLineDescribing,
    WinningScatterDescribing,
} from "pokie";

export class VideoSlotSession<T extends string | number | symbol = string> implements VideoSlotSessionHandling<T> {
    private readonly baseSession: GameSessionHandling;
    private readonly config: VideoSlotConfigRepresenting<T>;
    private readonly combinationsGenerator: SymbolsCombinationsGenerating<T>;
    private readonly winCalculator: VideoSlotWinCalculating<T>;
    private winAmount = 0;
    private symbolsCombination: SymbolsCombinationDescribing<T> = new SymbolsCombination<T>();

    constructor(
        config: VideoSlotConfigRepresenting<T> = new VideoSlotConfig<T>(),
        combinationsGenerator: SymbolsCombinationsGenerating<T> = new SymbolsCombinationsGenerator<T>(config),
        winCalculator: VideoSlotWinCalculating<T> = new VideoSlotWinCalculator<T>(config),
        baseSession: GameSessionHandling = new GameSession(config),
    ) {
        this.config = config;
        this.combinationsGenerator = combinationsGenerator;
        this.winCalculator = winCalculator;
        this.baseSession = baseSession;
        this.symbolsCombination = this.combinationsGenerator.generateSymbolsCombination();
    }

    public getPaytable(): PaytableRepresenting<T> {
        return this.config.getPaytable();
    }

    public getSymbolsCombination(): SymbolsCombinationDescribing<T> {
        return this.symbolsCombination;
    }

    public getWinningLines(): Record<number, WinningLineDescribing<T>> {
        return this.winCalculator.getWinningLines();
    }

    public getWinningScatters(): Record<T, WinningScatterDescribing<T>> {
        return this.winCalculator.getWinningScatters();
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing<T>[] {
        return this.config.getSymbolsSequences();
    }

    public getReelsSymbolsNumber(): number {
        return this.config.getReelsSymbolsNumber();
    }

    public getReelsNumber(): number {
        return this.config.getReelsNumber();
    }

    public getAvailableSymbols(): T[] {
        return [...this.config.getAvailableSymbols()];
    }

    public getCreditsAmount(): number {
        return this.baseSession.getCreditsAmount();
    }

    public setCreditsAmount(creditsAmount: number): void {
        this.baseSession.setCreditsAmount(creditsAmount);
    }

    public getWinAmount(): number {
        return this.winAmount;
    }

    public getLinesWinning(): number {
        return this.winCalculator.getLinesWinning();
    }

    public getScattersWinning(): number {
        return this.winCalculator.getScattersWinning();
    }

    public getAvailableBets(): number[] {
        return [...this.config.getAvailableBets()];
    }

    public getBet(): number {
        return this.baseSession.getBet();
    }

    public setBet(bet: number): void {
        this.baseSession.setBet(bet);
    }

    public canPlayNextGame(): boolean {
        return this.baseSession.canPlayNextGame();
    }

    public play(): void {
        this.baseSession.play();
        this.symbolsCombination = this.combinationsGenerator.generateSymbolsCombination();
        this.winCalculator.calculateWin(this.getBet(), this.symbolsCombination);
        this.winAmount = this.winCalculator.getWinAmount();
        this.setCreditsAmount(this.getCreditsAmount() + this.winAmount);
    }

    public isSymbolWild(symbolId: T): boolean {
        return this.config.isSymbolWild(symbolId);
    }

    public isSymbolScatter(symbolId: T): boolean {
        return this.config.isSymbolScatter(symbolId);
    }

    public getWildSymbols(): T[] {
        return this.config.getWildSymbols();
    }

    public getScatterSymbols(): T[] {
        return this.config.getScatterSymbols();
    }

    public getLinesDefinitions(): LinesDefinitionsDescribing {
        return this.config.getLinesDefinitions();
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        return this.config.getLinesPatterns();
    }
}
