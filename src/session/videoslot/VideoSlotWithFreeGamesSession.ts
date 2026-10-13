import {areScreenGeometriesCompatible, resolveScreenProjection} from "./coordinates/projectSymbolsCombination.js";
import {isSessionStateRestorable, resolveSessionStateSchema, type SessionStateSchema, type SessionStateRestoring} from "../SessionStateRestoring.js";
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
import {SymbolsCombinationsAnalyzer} from "./combinations/SymbolsCombinationsAnalyzer.js";

export class VideoSlotWithFreeGamesSession<T extends string | number | symbol = string>
    extends AbstractVideoSlotSessionDecorator<T>
    implements
        VideoSlotWithFreeGamesSessionHandling<T>,
        ConvertableToSessionState<VideoSlotWithFreeGamesSessionState>,
        BuildableFromSessionState<VideoSlotWithFreeGamesSessionState>,
        StakeAmountDetermining,
        SessionStateRestoring {
    private readonly config: VideoSlotWithFreeGamesConfigRepresenting<T>;
    private readonly freeGamesRoundHandler: FreeGamesRoundHandling<T>;
    private freeGamesNum = 0;
    private freeGamesSum = 0;
    private freeBank = 0;
    private wonFreeGamesNumber = 0;

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
        this.validateScreenCoordinates();
    }

    public override validateScreenCoordinates(): void {
        super.validateScreenCoordinates();
        const projection = resolveScreenProjection(this.config);
        const baseGeometry = this.getConfiguredScreenGeometry();
        // Legacy ordinary wrappers use their configuration for grants, while the base owns
        // the screen dimensions. Declared coordinates require both owners to agree.
        if (!areScreenGeometriesCompatible(projection?.getGeometry(), baseGeometry) ||
            ((projection || baseGeometry) &&
                (this.config.getReelsNumber() !== this.baseSession.getReelsNumber() ||
                this.config.getReelsSymbolsNumber() !== this.baseSession.getReelsSymbolsNumber()))) {
            throw new Error("Free-games base session must expose the same upcoming coordinate contract.");
        }
    }

    public getWonFreeGamesNumber(): number {
        return this.wonFreeGamesNumber;
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

    public getSessionStateSchema(): SessionStateSchema {
        return {kind: "free-games", base: resolveSessionStateSchema(this.baseSession)};
    }

    public isSessionStateRestorable(): boolean {
        return this.constructor === VideoSlotWithFreeGamesSession && this.config instanceof VideoSlotWithFreeGamesConfig && this.config.isResolvedForSessionRestoration() && isSessionStateRestorable(this.baseSession) && this.freeGamesRoundHandler.constructor === FreeGamesRoundHandler;
    }

    public toSessionState(): VideoSlotWithFreeGamesSessionState {
        const state: VideoSlotWithFreeGamesSessionState = {
            freeGamesNum: this.freeGamesNum,
            freeGamesSum: this.freeGamesSum,
            freeGamesBank: this.freeBank,
        };
        if (this.wonFreeGamesNumber > 0) {
            state.wonFreeGamesNumber = this.wonFreeGamesNumber;
        }
        if (this.supportsSessionStateCapture(this.baseSession)) {
            state.base = this.baseSession.toSessionState();
        }
        return state;
    }

    public validateSessionState(state: unknown): void {
        const value = state as VideoSlotWithFreeGamesSessionState;
        if (typeof value !== "object" || value === null || value.base === undefined ||
            !Number.isSafeInteger(value.freeGamesNum) || value.freeGamesNum < 0 ||
            !Number.isSafeInteger(value.freeGamesSum) || value.freeGamesSum < value.freeGamesNum ||
            !Number.isFinite(value.freeGamesBank) || value.freeGamesBank < 0 ||
            (value.wonFreeGamesNumber !== undefined && (!Number.isSafeInteger(value.wonFreeGamesNumber) || value.wonFreeGamesNumber < 0)) ||
            !this.supportsSessionStateRestore(this.baseSession)) throw new Error("Invalid free-games executable state.");
        const base = this.baseSession as VideoSlotSessionHandling<T> & {validateSessionState?: (state: unknown) => void};
        base.validateSessionState?.(value.base);
    }

    public fromSessionState(value: VideoSlotWithFreeGamesSessionState): this {
        this.validateSessionState(value);
        if (this.supportsSessionStateRestore(this.baseSession)) this.baseSession.fromSessionState(value.base);
        this.freeGamesNum = value.freeGamesNum;
        this.freeGamesSum = value.freeGamesSum;
        this.freeBank = value.freeGamesBank;
        this.wonFreeGamesNumber = value.wonFreeGamesNumber ?? 0;
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
        this.validateScreenCoordinates();
        this.wonFreeGamesNumber = 0;
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
        // Capture the played screen before round bookkeeping consumes its award. The constructor's
        // display screen and insufficient-credit no-ops never create or reprocess a grant.
        this.wonFreeGamesNumber = this.determineWonFreeGamesNumber();
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

    public hasPendingLogicalRound(): boolean {
        return this.hasUnfinishedFreeGames();
    }

    private hasUnfinishedFreeGames(): boolean {
        return this.freeGamesSum > 0 && this.freeGamesNum < this.freeGamesSum;
    }

    private determineWonFreeGamesNumber(): number {
        let wonFreeGamesNumber = 0;
        // Feature grants depend on landed scatters, independently of monetary payouts.
        const matrix = this.getEvaluatedSymbolsCombination().toMatrix();
        for (const symbolId of this.config.getScatterSymbols()) {
            const grant = this.config.getFreeGamesForScatters(
                symbolId,
                SymbolsCombinationsAnalyzer.getScatterSymbolsPositions(matrix, symbolId).length,
            );
            if (grant > 0) wonFreeGamesNumber += grant;
        }
        return wonFreeGamesNumber;
    }

    private supportsSessionStateCapture(session: VideoSlotSessionHandling<T>): session is VideoSlotSessionHandling<T> & ConvertableToSessionState<unknown> {
        return typeof (session as Partial<ConvertableToSessionState<unknown>>).toSessionState === "function";
    }

    private supportsSessionStateRestore(session: VideoSlotSessionHandling<T>): session is VideoSlotSessionHandling<T> & BuildableFromSessionState<unknown> {
        return typeof (session as Partial<BuildableFromSessionState<unknown>>).fromSessionState === "function";
    }
}
