import {
    LinesDefinitionsDescribing,
    LinesPatternsDescribing,
    PaytableRepresenting,
    SymbolsCombinationDescribing,
    SymbolsCombinationsGenerating,
    SymbolsCombinationsGenerator,
    SymbolsSequenceDescribing,
    VideoSlotSession,
    VideoSlotSessionHandling,
    VideoSlotWinCalculating,
    VideoSlotWinCalculator,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesConfigRepresenting,
    VideoSlotWithFreeGamesSessionHandling,
    WinningLineDescribing,
    WinningScatterDescribing,
} from "pokie";

export class VideoSlotWithFreeGamesSession implements VideoSlotWithFreeGamesSessionHandling {
    private readonly baseSession: VideoSlotSessionHandling;
    private readonly config: VideoSlotWithFreeGamesConfigRepresenting;
    private freeGamesNum = 0;
    private freeGamesSum = 0;
    private freeBank = 0;

    constructor(
        config: VideoSlotWithFreeGamesConfigRepresenting = new VideoSlotWithFreeGamesConfig(),
        combinationsGenerator: SymbolsCombinationsGenerating = new SymbolsCombinationsGenerator(config),
        winCalculator: VideoSlotWinCalculating = new VideoSlotWinCalculator(config),
        baseSession: VideoSlotSessionHandling = new VideoSlotSession(config, combinationsGenerator, winCalculator),
    ) {
        this.baseSession = baseSession;
        this.config = config;
    }

    public getWonFreeGamesNumber(): number {
        let rv = 0;
        const wonScatters = this.getWinningScatters();
        for (const scatterModel of Object.values(wonScatters)) {
            const freeGamesForScatters = this.config.getFreeGamesForScatters(
                scatterModel.getSymbolId(),
                scatterModel.getSymbolsPositions().length,
            );
            if (freeGamesForScatters > 0) {
                rv += freeGamesForScatters;
            }
        }
        return rv;
    }

    public getFreeGamesNum(): number {
        return this.freeGamesNum;
    }

    public setFreeGamesNum(value: number): void {
        this.freeGamesNum = value;
    }

    public getFreeGamesSum(): number {
        return this.freeGamesSum;
    }

    public setFreeGamesSum(value: number): void {
        this.freeGamesSum = value;
    }

    public getFreeGamesBank(): number {
        return this.freeBank;
    }

    public setFreeGamesBank(value: number): void {
        this.freeBank = value;
    }

    public getPaytable(): PaytableRepresenting {
        return this.config.getPaytable();
    }

    public getSymbolsCombination(): SymbolsCombinationDescribing {
        return this.baseSession.getSymbolsCombination();
    }

    public getWinningLines(): Record<number, WinningLineDescribing> {
        return this.baseSession.getWinningLines();
    }

    public getWinningScatters(): Record<string, WinningScatterDescribing> {
        return this.baseSession.getWinningScatters();
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing[] {
        return this.baseSession.getSymbolsSequences();
    }

    public getReelsSymbolsNumber(): number {
        return this.baseSession.getReelsSymbolsNumber();
    }

    public getReelsNumber(): number {
        return this.baseSession.getReelsNumber();
    }

    public getAvailableSymbols(): string[] {
        return this.baseSession.getAvailableSymbols();
    }

    public getCreditsAmount(): number {
        return this.baseSession.getCreditsAmount();
    }

    public setCreditsAmount(creditsAmount: number): void {
        this.baseSession.setCreditsAmount(creditsAmount);
    }

    public getWinAmount(): number {
        return this.baseSession.getWinAmount();
    }

    public getAvailableBets(): number[] {
        return this.baseSession.getAvailableBets();
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
        if (this.getFreeGamesNum() === this.getFreeGamesSum()) {
            this.setFreeGamesBank(0);
            this.setFreeGamesNum(0);
            this.setFreeGamesSum(0);
        }
        const creditsBeforePlay = this.getCreditsAmount();
        this.baseSession.play();
        if (this.getFreeGamesSum() > 0 && this.getFreeGamesNum() < this.getFreeGamesSum()) {
            this.setFreeGamesNum(this.getFreeGamesNum() + 1);
            this.setFreeGamesBank(this.getFreeGamesBank() + this.getWinAmount());
            this.setCreditsAmount(creditsBeforePlay);
        }
        const wonFreeGames = this.getWonFreeGamesNumber();
        if (wonFreeGames > 0) {
            this.setFreeGamesSum(this.getFreeGamesSum() + wonFreeGames);
        } else {
            if (this.getFreeGamesSum() > 0 && this.getFreeGamesNum() === this.getFreeGamesSum()) {
                this.setCreditsAmount(this.getCreditsAmount() + this.getFreeGamesBank());
            }
        }
    }

    public getFreeGamesForScatters(symbolId: string, numberOfSymbols: number): number {
        return this.config.getFreeGamesForScatters(symbolId, numberOfSymbols);
    }

    public isSymbolWild(symbolId: string): boolean {
        return this.baseSession.isSymbolWild(symbolId);
    }

    public isSymbolScatter(symbolId: string): boolean {
        return this.baseSession.isSymbolScatter(symbolId);
    }

    public getWildSymbols(): string[] {
        return this.baseSession.getWildSymbols();
    }

    public getScatterSymbols(): string[] {
        return this.baseSession.getScatterSymbols();
    }

    public getLinesDefinitions(): LinesDefinitionsDescribing {
        return this.baseSession.getLinesDefinitions();
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        return this.baseSession.getLinesPatterns();
    }

    public getLinesWinning(): number {
        return this.baseSession.getLinesWinning();
    }

    public getScattersWinning(): number {
        return this.baseSession.getScattersWinning();
    }
}
