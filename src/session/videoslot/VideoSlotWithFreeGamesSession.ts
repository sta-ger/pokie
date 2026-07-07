import {
    AbstractVideoSlotSessionDecorator,
    DefaultFreeGamesRoundHandler,
    FreeGamesRoundHandling,
    PaytableRepresenting,
    SymbolsCombinationsGenerating,
    SymbolsCombinationsGenerator,
    VideoSlotSession,
    VideoSlotSessionHandling,
    VideoSlotWinCalculating,
    VideoSlotWinCalculator,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesConfigRepresenting,
    VideoSlotWithFreeGamesSessionHandling,
    WinningScatterDescribing,
} from "pokie";

export class VideoSlotWithFreeGamesSession<T extends string | number | symbol = string>
    extends AbstractVideoSlotSessionDecorator<T>
    implements VideoSlotWithFreeGamesSessionHandling<T> {
    private readonly config: VideoSlotWithFreeGamesConfigRepresenting<T>;
    private readonly freeGamesRoundHandler: FreeGamesRoundHandling<T>;
    private freeGamesNum = 0;
    private freeGamesSum = 0;
    private freeBank = 0;

    constructor(
        config: VideoSlotWithFreeGamesConfigRepresenting<T> = new VideoSlotWithFreeGamesConfig<T>(),
        combinationsGenerator: SymbolsCombinationsGenerating<T> = new SymbolsCombinationsGenerator<T>(config),
        winCalculator: VideoSlotWinCalculating<T> = new VideoSlotWinCalculator<T>(config),
        baseSession: VideoSlotSessionHandling<T> = new VideoSlotSession<T>(
            config,
            combinationsGenerator,
            winCalculator,
        ),
        freeGamesRoundHandler: FreeGamesRoundHandling<T> = new DefaultFreeGamesRoundHandler<T>(),
    ) {
        super(baseSession);
        this.config = config;
        this.freeGamesRoundHandler = freeGamesRoundHandler;
    }

    public getWonFreeGamesNumber(): number {
        let rv = 0;
        const wonScatters = this.getWinningScatters();
        for (const scatterModel of Object.values<WinningScatterDescribing<T>>(wonScatters)) {
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

    public override play(): void {
        this.freeGamesRoundHandler.beforeRoundPlayed(this);
        const creditsBeforePlay = this.getCreditsAmount();
        this.baseSession.play();
        this.freeGamesRoundHandler.afterRoundPlayed(this, creditsBeforePlay);
    }

    public getFreeGamesForScatters(symbolId: T, numberOfSymbols: number): number {
        return this.config.getFreeGamesForScatters(symbolId, numberOfSymbols);
    }

    public override getPaytable(): PaytableRepresenting<T> {
        return this.config.getPaytable();
    }
}
