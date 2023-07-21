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

export class VideoSlotSession implements VideoSlotSessionHandling {
    private readonly baseSession: GameSessionHandling;
    private readonly config: VideoSlotConfigRepresenting;
    private readonly combinationsGenerator: SymbolsCombinationsGenerating;
    private readonly winCalculator: VideoSlotWinCalculating;
    private winAmount = 0;
    private symbolsCombination: SymbolsCombinationDescribing = new SymbolsCombination();

    constructor(
        config: VideoSlotConfigRepresenting = new VideoSlotConfig(),
        combinationsGenerator: SymbolsCombinationsGenerating = new SymbolsCombinationsGenerator(config),
        winCalculator: VideoSlotWinCalculating = new VideoSlotWinCalculator(config),
        baseSession: GameSessionHandling = new GameSession(config),
    ) {
        this.config = config;
        this.combinationsGenerator = combinationsGenerator;
        this.winCalculator = winCalculator;
        this.baseSession = baseSession;
        this.symbolsCombination = this.combinationsGenerator.generateSymbolsCombination();
    }

    public getPaytable(): PaytableRepresenting {
        return this.config.getPaytable();
    }

    public getSymbolsCombination(): SymbolsCombinationDescribing {
        return this.symbolsCombination;
    }

    public getWinningLines(): Record<number, WinningLineDescribing> {
        return this.winCalculator.getWinningLines();
    }

    public getWinningScatters(): Record<string, WinningScatterDescribing> {
        return this.winCalculator.getWinningScatters();
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing[] {
        return this.config.getSymbolsSequences();
    }

    public getReelsSymbolsNumber(): number {
        return this.config.getReelsSymbolsNumber();
    }

    public getReelsNumber(): number {
        return this.config.getReelsNumber();
    }

    public getAvailableSymbols(): string[] {
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

    public isSymbolWild(symbolId: string): boolean {
        return this.config.isSymbolWild(symbolId);
    }

    public isSymbolScatter(symbolId: string): boolean {
        return this.config.isSymbolScatter(symbolId);
    }

    public getWildSymbols(): string[] {
        return this.config.getWildSymbols();
    }

    public getScatterSymbols(): string[] {
        return this.config.getScatterSymbols();
    }

    public getLinesDefinitions(): LinesDefinitionsDescribing {
        return this.config.getLinesDefinitions();
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        return this.config.getLinesPatterns();
    }
}
