import type {BuildableFromSessionState} from "../../BuildableFromSessionState.js";
import type {ConvertableToSessionState} from "../../ConvertableToSessionState.js";
import type {SimulationCategoryDetermining} from "../../SimulationCategoryDetermining.js";
import type {StakeAmountDetermining} from "../../StakeAmountDetermining.js";
import {AbstractVideoSlotSessionDecorator} from "../AbstractVideoSlotSessionDecorator.js";
import {SymbolOverlayTransformer} from "../combinations/SymbolOverlayTransformer.js";
import {SymbolsCombination} from "../combinations/SymbolsCombination.js";
import type {SymbolsCombinationDescribing} from "../combinations/SymbolsCombinationDescribing.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";
import type {HoldAndWinCollecting} from "./HoldAndWinCollecting.js";
import type {HoldAndWinPayoutAggregating} from "./HoldAndWinPayoutAggregating.js";
import {HoldAndWinRoundHandler} from "./HoldAndWinRoundHandler.js";
import type {HoldAndWinRoundHandling} from "./HoldAndWinRoundHandling.js";
import type {HoldAndWinTriggering} from "./HoldAndWinTriggering.js";
import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";
import {MinimumCountHoldAndWinTrigger} from "./MinimumCountHoldAndWinTrigger.js";
import {SumWithMultiplierHoldAndWinPayoutAggregator} from "./SumWithMultiplierHoldAndWinPayoutAggregator.js";
import {SymbolSetHoldAndWinCollector} from "./SymbolSetHoldAndWinCollector.js";
import type {VideoSlotWithHoldAndWinSessionHandling} from "./VideoSlotWithHoldAndWinSessionHandling.js";
import type {VideoSlotWithHoldAndWinSessionState} from "./VideoSlotWithHoldAndWinSessionState.js";

// A first-class Hold & Win/Lock & Spin mechanic, composed onto any existing VideoSlotSessionHandling
// exactly the way VideoSlotWithFreeGamesSession composes free games — via decoration, not by changing
// VideoSlotSession itself (see GAP_AUDIT_v1.3.md's own note that this is "composable from existing
// primitives" — SymbolOverlayTransformer for rendering locked positions, the same
// ConvertableToSessionState/BuildableFromSessionState/StakeAmountDetermining/SimulationCategoryDetermining
// optional contracts every other feature decorator already uses). Stackable both ways: wraps any
// VideoSlotSessionHandling (including an already-decorated one), and — since it implements
// ConvertableToSessionState/BuildableFromSessionState with the same "base?: unknown" nesting convention
// VideoSlotWithBetModesSession established — can itself be wrapped by something else that also nests state
// this way.
//
// All the actual trigger/lock/respin/completion/payout logic lives in the injected HoldAndWinRoundHandling
// collaborator (default HoldAndWinRoundHandler) — this class is purely the composition point: constructor
// wiring, delegating play()/canPlayNextGame() the same way VideoSlotWithFreeGamesSession delegates to
// FreeGamesRoundHandling, and exposing/persisting the handler's own state via
// HoldAndWinStateDetermining/Setting. A different respin rule, trigger rule, symbol-value configuration, or
// payout formula is a new/replaced collaborator, never a change to this class.
export class VideoSlotWithHoldAndWinSession<T extends string | number | symbol = string>
    extends AbstractVideoSlotSessionDecorator<T>
    implements
        VideoSlotWithHoldAndWinSessionHandling<T>,
        ConvertableToSessionState<VideoSlotWithHoldAndWinSessionState<T>>,
        BuildableFromSessionState<VideoSlotWithHoldAndWinSessionState<T>>,
        StakeAmountDetermining,
        SimulationCategoryDetermining {
    private readonly roundHandler: HoldAndWinRoundHandling<T>;
    private readonly overlayTransformer = new SymbolOverlayTransformer();
    private active = false;
    private lockedSymbols: readonly LockedHoldAndWinSymbol<T>[] = [];
    private respinsRemaining = 0;
    private payout = 0;

    constructor(
        baseSession: VideoSlotSessionHandling<T>,
        initialRespins = 3,
        collector: HoldAndWinCollecting<T> = new SymbolSetHoldAndWinCollector<T>({}),
        trigger: HoldAndWinTriggering<T> = new MinimumCountHoldAndWinTrigger<T>(6),
        payoutAggregator: HoldAndWinPayoutAggregating<T> = new SumWithMultiplierHoldAndWinPayoutAggregator<T>(),
        roundHandler: HoldAndWinRoundHandling<T> = new HoldAndWinRoundHandler<T>(initialRespins, collector, trigger, payoutAggregator),
    ) {
        super(baseSession);
        this.roundHandler = roundHandler;
    }

    public isHoldAndWinActive(): boolean {
        return this.active;
    }

    public setHoldAndWinActive(value: boolean): void {
        this.active = value;
    }

    public getLockedHoldAndWinSymbols(): readonly LockedHoldAndWinSymbol<T>[] {
        return this.lockedSymbols;
    }

    public setLockedHoldAndWinSymbols(value: readonly LockedHoldAndWinSymbol<T>[]): void {
        this.lockedSymbols = value;
    }

    public getHoldAndWinRespinsRemaining(): number {
        return this.respinsRemaining;
    }

    public setHoldAndWinRespinsRemaining(value: number): void {
        this.respinsRemaining = value;
    }

    public getHoldAndWinPayout(): number {
        return this.payout;
    }

    public setHoldAndWinPayout(value: number): void {
        this.payout = value;
    }

    public toSessionState(): VideoSlotWithHoldAndWinSessionState<T> {
        const state: VideoSlotWithHoldAndWinSessionState<T> = {
            active: this.active,
            lockedSymbols: this.lockedSymbols,
            respinsRemaining: this.respinsRemaining,
            payout: this.payout,
        };
        if (this.supportsSessionStateCapture(this.baseSession)) {
            state.base = this.baseSession.toSessionState();
        }
        return state;
    }

    public fromSessionState(value: VideoSlotWithHoldAndWinSessionState<T>): this {
        this.active = value.active;
        this.lockedSymbols = value.lockedSymbols;
        this.respinsRemaining = value.respinsRemaining;
        this.payout = value.payout;
        if (value.base !== undefined && this.supportsSessionStateRestore(this.baseSession)) {
            this.baseSession.fromSessionState(value.base);
        }
        return this;
    }

    public override canPlayNextGame(): boolean {
        return this.active || this.baseSession.canPlayNextGame();
    }

    public override play(): void {
        // Mirrors the insufficient-funds guard in VideoSlotWithFreeGamesSession.play(): a plain paid spin
        // with insufficient credits must bail out here, before beforeRoundPlayed/afterRoundPlayed ever
        // run, so stale locked/respin state from a previous feature run can't be reprocessed.
        if (!this.canPlayNextGame()) {
            return;
        }
        this.roundHandler.beforeRoundPlayed(this);
        const creditsBeforePlay = this.getCreditsAmount();
        // baseSession has no notion of Hold & Win — front it with just enough credits to clear its own
        // canPlayNextGame() for a respin funded by an insufficient real balance; afterRoundPlayed always
        // restores creditsBeforePlay for an active (zero-stake) round, so this never leaks.
        if (this.active && !this.baseSession.canPlayNextGame()) {
            this.baseSession.setCreditsAmount(this.baseSession.getBet());
        }
        this.baseSession.play();
        this.roundHandler.afterRoundPlayed(this, creditsBeforePlay);
    }

    // StakeAmountDetermining: a respin never charges a real stake — see HoldAndWinRoundHandler, which
    // restores credits to their pre-play value for exactly that case. Same condition canPlayNextGame() uses
    // to let such a spin through regardless of balance, kept as one source of truth.
    public getStakeAmount(): number {
        return this.active ? 0 : this.getBet();
    }

    // SimulationCategoryDetermining: the triggering spin itself is a genuine base-game round (it charges a
    // real stake — getStakeAmount() only reports 0 once "active" flips true, which happens after this
    // spin's own outcome is already decided), so it's reported as "base", the same fallback name
    // StakeBasedSimulationRoundCategoryDeterminer would already infer from getStakeAmount() > 0 — this
    // override only matters for actually distinguishing respins from the generic "freeGames" label that
    // fallback would otherwise apply, since Hold & Win is a distinct mechanic worth its own simulation
    // breakdown bucket.
    public getSimulationCategory(): string {
        return this.active ? "holdAndWin" : "base";
    }

    // Renders the feature's own accumulated locked positions back onto whatever grid the wrapped session
    // most recently generated, via SymbolOverlayTransformer — exactly the primitive GAP_AUDIT_v1.3.md names
    // as the intended composable building block. Without this, a respin's own getSymbolsCombination() would
    // only ever show that respin's fresh random landing, losing every symbol locked on earlier respins.
    public override getSymbolsCombination(): SymbolsCombinationDescribing<T> {
        if (this.lockedSymbols.length === 0) {
            return this.baseSession.getSymbolsCombination();
        }
        const overlaid = this.overlayTransformer.overlay(
            this.baseSession.getSymbolsCombination().toMatrix() as T[][],
            this.lockedSymbols.map((locked) => ({position: [...locked.position], symbolId: locked.symbolId})),
        );
        return new SymbolsCombination<T>().fromMatrix(overlaid);
    }

    private supportsSessionStateCapture(session: VideoSlotSessionHandling<T>): session is VideoSlotSessionHandling<T> & ConvertableToSessionState {
        return typeof (session as Partial<ConvertableToSessionState>).toSessionState === "function";
    }

    private supportsSessionStateRestore(session: VideoSlotSessionHandling<T>): session is VideoSlotSessionHandling<T> & BuildableFromSessionState {
        return typeof (session as Partial<BuildableFromSessionState>).fromSessionState === "function";
    }
}
