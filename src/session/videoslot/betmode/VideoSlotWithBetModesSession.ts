import type {BuildableFromSessionState} from "../../BuildableFromSessionState.js";
import type {ConvertableToSessionState} from "../../ConvertableToSessionState.js";
import type {StakeAmountDetermining} from "../../StakeAmountDetermining.js";
import {AbstractVideoSlotSessionDecorator} from "../AbstractVideoSlotSessionDecorator.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";
import type {BetModeDescribing} from "./BetModeDescribing.js";
import type {BetModeSelecting} from "./BetModeSelecting.js";
import type {BetModeSessionState} from "./BetModeSessionState.js";
import {BetModesConfig} from "./BetModesConfig.js";
import type {BetModesConfigRepresenting} from "./BetModesConfigRepresenting.js";
import type {ForcedFeatureEntryHandling} from "./ForcedFeatureEntryHandling.js";
import {NoOpForcedFeatureEntryHandler} from "./NoOpForcedFeatureEntryHandler.js";
import {UnknownBetModeError} from "./UnknownBetModeError.js";

// Wraps any VideoSlotSessionHandling (a plain VideoSlotSession, or one already decorated with e.g.
// VideoSlotWithFreeGamesSession) to make the selected bet mode actually drive execution, rather than
// being metadata a caller has to interpret and apply itself (see gamepackage/BetMode.ts's own doc
// comment on why it deliberately stops short of that). Nothing about buy-bonus or ante-bet is
// hard-coded here: BetModesConfigRepresenting supplies the available modes and their
// stakeMultiplier/forcesFeatureEntry, and ForcedFeatureEntryHandling supplies what "forced entry"
// actually does to the wrapped session -- a new mode or a new kind of forced entry is new data/a new
// strategy implementation, never a change to this class.
//
// With both constructor arguments left at their defaults (a single "base" mode, stakeMultiplier 1, no
// forced entry, a no-op forced-entry handler), this behaves exactly like the wrapped session on its
// own -- the backward-compatible path for a game that never configures bet modes at all.
export class VideoSlotWithBetModesSession<T extends string | number | symbol = string>
    extends AbstractVideoSlotSessionDecorator<T>
    implements
        BetModeSelecting,
        StakeAmountDetermining,
        ConvertableToSessionState<BetModeSessionState>,
        BuildableFromSessionState<BetModeSessionState> {
    private readonly betModesConfig: BetModesConfigRepresenting;
    private readonly forcedFeatureEntryHandler: ForcedFeatureEntryHandling<T>;
    private currentBetModeId: string;

    constructor(
        baseSession: VideoSlotSessionHandling<T>,
        betModesConfig: BetModesConfigRepresenting = new BetModesConfig(),
        forcedFeatureEntryHandler: ForcedFeatureEntryHandling<T> = new NoOpForcedFeatureEntryHandler<T>(),
    ) {
        super(baseSession);
        this.betModesConfig = betModesConfig;
        this.forcedFeatureEntryHandler = forcedFeatureEntryHandler;
        this.currentBetModeId = betModesConfig.getDefaultBetModeId();
    }

    public getBetModeId(): string {
        return this.currentBetModeId;
    }

    public setBetMode(modeId: string): void {
        if (this.betModesConfig.getBetMode(modeId) === undefined) {
            throw new UnknownBetModeError(modeId, this.betModesConfig.getBetModeIds());
        }
        this.currentBetModeId = modeId;
    }

    // The amount the *next* play() will actually charge, including any ante/buy-feature multiplier --
    // consulted by SpinCommandHandler via determineStakeAmount() for real wallet debits, so a bet mode
    // affects money at the server boundary too, not only this session's own internal credits.
    public getStakeAmount(): number {
        return this.computeBaseStakeAmount() * this.resolveActiveBetMode().getStakeMultiplier();
    }

    public override canPlayNextGame(): boolean {
        if (!this.baseSession.canPlayNextGame()) {
            return false;
        }
        const totalCost = this.computeBaseStakeAmount() * this.resolveActiveBetMode().getStakeMultiplier();
        return this.baseSession.getCreditsAmount() >= totalCost;
    }

    public override play(): void {
        if (!this.canPlayNextGame()) {
            return;
        }
        const mode = this.resolveActiveBetMode();
        // Computed before any forced entry mutates the wrapped session's state (e.g. an unfinished
        // free-games round reads back as 0 stake) -- what a buy-feature mode actually costs is
        // resolved against the state as it was when the player chose to spend it, not after.
        const baseStakeAmount = this.computeBaseStakeAmount();

        if (mode.forcesFeatureEntry()) {
            this.forcedFeatureEntryHandler.forceFeatureEntry(this.baseSession);
        }

        const extraCost = baseStakeAmount * (mode.getStakeMultiplier() - 1);
        if (extraCost !== 0) {
            this.baseSession.setCreditsAmount(this.baseSession.getCreditsAmount() - extraCost);
        }
        this.baseSession.play();
    }

    public toSessionState(): BetModeSessionState {
        const state: BetModeSessionState = {betModeId: this.currentBetModeId};
        if (this.supportsSessionStateCapture(this.baseSession)) {
            state.base = this.baseSession.toSessionState();
        }
        return state;
    }

    public fromSessionState(value: BetModeSessionState): this {
        this.currentBetModeId = value.betModeId;
        if (value.base !== undefined && this.supportsSessionStateRestore(this.baseSession)) {
            this.baseSession.fromSessionState(value.base);
        }
        return this;
    }

    private resolveActiveBetMode(): BetModeDescribing {
        const mode = this.betModesConfig.getBetMode(this.currentBetModeId);
        if (mode === undefined) {
            throw new UnknownBetModeError(this.currentBetModeId, this.betModesConfig.getBetModeIds());
        }
        return mode;
    }

    private computeBaseStakeAmount(): number {
        return this.supportsStakeAmount(this.baseSession) ? this.baseSession.getStakeAmount() : this.baseSession.getBet();
    }

    private supportsStakeAmount(
        session: VideoSlotSessionHandling<T>,
    ): session is VideoSlotSessionHandling<T> & StakeAmountDetermining {
        return typeof (session as Partial<StakeAmountDetermining>).getStakeAmount === "function";
    }

    private supportsSessionStateCapture(
        session: VideoSlotSessionHandling<T>,
    ): session is VideoSlotSessionHandling<T> & ConvertableToSessionState {
        return typeof (session as Partial<ConvertableToSessionState>).toSessionState === "function";
    }

    private supportsSessionStateRestore(
        session: VideoSlotSessionHandling<T>,
    ): session is VideoSlotSessionHandling<T> & BuildableFromSessionState {
        return typeof (session as Partial<BuildableFromSessionState>).fromSessionState === "function";
    }
}
