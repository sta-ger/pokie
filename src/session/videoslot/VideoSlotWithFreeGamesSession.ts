import {AbstractVideoSlotSessionDecorator} from "./AbstractVideoSlotSessionDecorator.js";
import type {BuildableFromSessionState} from "../BuildableFromSessionState.js";
import type {ConvertableToSessionState} from "../ConvertableToSessionState.js";
import type {StakeAmountDetermining} from "../StakeAmountDetermining.js";
import {FreeGamesRoundHandler} from "./FreeGamesRoundHandler.js";
import type {FreeGamesRoundHandling} from "./FreeGamesRoundHandling.js";
import type {PaytableRepresenting} from "./paytable/PaytableRepresenting.js";
import type {SymbolsCombinationsGenerating} from "./combinations/SymbolsCombinationsGenerating.js";
import {SymbolsCombinationsGenerator} from "./combinations/SymbolsCombinationsGenerator.js";
import {VideoSlotSession} from "./VideoSlotSession.js";
import type {VideoSlotSessionHandling} from "./VideoSlotSessionHandling.js";
import type {VideoSlotWinCalculating} from "./wincalculator/VideoSlotWinCalculating.js";
import {VideoSlotWinCalculator} from "./wincalculator/VideoSlotWinCalculator.js";
import {VideoSlotWithFreeGamesConfig} from "./VideoSlotWithFreeGamesConfig.js";
import type {VideoSlotWithFreeGamesConfigRepresenting} from "./VideoSlotWithFreeGamesConfigRepresenting.js";
import type {VideoSlotWithFreeGamesSessionHandling} from "./VideoSlotWithFreeGamesSessionHandling.js";
import type {VideoSlotWithFreeGamesSessionState} from "./VideoSlotWithFreeGamesSessionState.js";
import type {WinningScatterDescribing} from "./WinningScatterDescribing.js";

export class VideoSlotWithFreeGamesSession<T extends string | number | symbol = string>
    extends AbstractVideoSlotSessionDecorator<T>
    implements
        VideoSlotWithFreeGamesSessionHandling<T>,
        ConvertableToSessionState<VideoSlotWithFreeGamesSessionState>,
        BuildableFromSessionState<VideoSlotWithFreeGamesSessionState>,
        StakeAmountDetermining {
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
        freeGamesRoundHandler: FreeGamesRoundHandling<T> = new FreeGamesRoundHandler<T>(),
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

    public toSessionState(): VideoSlotWithFreeGamesSessionState {
        return {freeGamesNum: this.freeGamesNum, freeGamesSum: this.freeGamesSum, freeGamesBank: this.freeBank};
    }

    public fromSessionState(value: VideoSlotWithFreeGamesSessionState): this {
        this.freeGamesNum = value.freeGamesNum;
        this.freeGamesSum = value.freeGamesSum;
        this.freeBank = value.freeGamesBank;
        return this;
    }

    public override canPlayNextGame(): boolean {
        return this.hasUnfinishedFreeGames() || this.baseSession.canPlayNextGame();
    }

    public override play(): void {
        // Mirrors the insufficient-funds guard in VideoSlotSession.play(), but using this class's
        // own canPlayNextGame() override (true regardless of balance while a free round is
        // unfinished) — a plain paid spin with insufficient credits must bail out here, before
        // beforeRoundPlayed/afterRoundPlayed ever run, so stale win/scatter state from a previous
        // round can't be reprocessed into a spurious retrigger.
        if (!this.canPlayNextGame()) {
            return;
        }
        this.freeGamesRoundHandler.beforeRoundPlayed(this);
        const creditsBeforePlay = this.getCreditsAmount();
        // baseSession is a plain VideoSlotSession/GameSession with no notion of free rounds, so its
        // own canPlayNextGame() would refuse to play a free spin funded by an insufficient real
        // balance. Front it with just enough credits to clear that check; afterRoundPlayed always
        // restores the real creditsBeforePlay for an unfinished free round, so this never leaks.
        if (this.hasUnfinishedFreeGames() && !this.baseSession.canPlayNextGame()) {
            this.baseSession.setCreditsAmount(this.baseSession.getBet());
        }
        this.baseSession.play();
        this.freeGamesRoundHandler.afterRoundPlayed(this, creditsBeforePlay);
    }

    // StakeAmountDetermining: a spin consuming an unfinished free-games round never charges a real
    // stake — see FreeGamesRoundHandler, which restores credits to their pre-play value for exactly
    // that case. Same condition canPlayNextGame() uses to let such a spin through regardless of
    // balance, kept as one source of truth.
    public getStakeAmount(): number {
        return this.hasUnfinishedFreeGames() ? 0 : this.getBet();
    }

    public getFreeGamesForScatters(symbolId: T, numberOfSymbols: number): number {
        return this.config.getFreeGamesForScatters(symbolId, numberOfSymbols);
    }

    public override getPaytable(): PaytableRepresenting<T> {
        return this.config.getPaytable();
    }

    private hasUnfinishedFreeGames(): boolean {
        return this.freeGamesSum > 0 && this.freeGamesNum < this.freeGamesSum;
    }
}
