import type {BuildableFromSessionState} from "../../BuildableFromSessionState.js";
import type {ConvertableToSessionState} from "../../ConvertableToSessionState.js";
import type {SimulationCategoryDetermining} from "../../SimulationCategoryDetermining.js";
import type {StakeAmountDetermining} from "../../StakeAmountDetermining.js";
import {AbstractVideoSlotSessionDecorator} from "../AbstractVideoSlotSessionDecorator.js";
import {SymbolOverlayTransformer} from "../combinations/SymbolOverlayTransformer.js";
import {SymbolsCombination} from "../combinations/SymbolsCombination.js";
import type {SymbolsCombinationDescribing} from "../combinations/SymbolsCombinationDescribing.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";
import {ValueWinComponent} from "../winevaluation/ValueWinComponent.js";
import {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
import {WinningValue} from "../WinningValue.js";
import type {HoldAndWinCollecting} from "./HoldAndWinCollecting.js";
import type {HoldAndWinPayoutAggregating} from "./HoldAndWinPayoutAggregating.js";
import {HoldAndWinRoundHandler} from "./HoldAndWinRoundHandler.js";
import type {HoldAndWinRoundHandling} from "./HoldAndWinRoundHandling.js";
import type {HoldAndWinRoundOutcome} from "./HoldAndWinRoundOutcome.js";
import type {HoldAndWinTriggering} from "./HoldAndWinTriggering.js";
import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";
import {MinimumCountHoldAndWinTrigger} from "./MinimumCountHoldAndWinTrigger.js";
import {SumWithMultiplierHoldAndWinPayoutAggregator} from "./SumWithMultiplierHoldAndWinPayoutAggregator.js";
import {SymbolSetHoldAndWinCollector} from "./SymbolSetHoldAndWinCollector.js";
import type {VideoSlotWithHoldAndWinSessionHandling} from "./VideoSlotWithHoldAndWinSessionHandling.js";
import type {VideoSlotWithHoldAndWinSessionState} from "./VideoSlotWithHoldAndWinSessionState.js";

// A locked symbol whose own effect is specifically a flat "value" contribution (as opposed to a
// "multiplier") — narrowed once here so buildCompletedWinEvaluationResult() below doesn't need an inline
// cast at every use.
function isValueLocked<T extends string | number | symbol>(
    locked: LockedHoldAndWinSymbol<T>,
): locked is LockedHoldAndWinSymbol<T> & {effect: {kind: "value"; amount: number}} {
    return locked.effect.kind === "value";
}

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
    private lastRoundOutcome: HoldAndWinRoundOutcome<T> = {kind: "ordinary"};

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

    public getHoldAndWinLastRoundOutcome(): HoldAndWinRoundOutcome<T> {
        return this.lastRoundOutcome;
    }

    public setHoldAndWinLastRoundOutcome(value: HoldAndWinRoundOutcome<T>): void {
        this.lastRoundOutcome = value;
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
        // Read directly off baseSession, never via this.getWinEvaluationResult() — that method is
        // overridden below to answer from lastRoundOutcome, which roundHandler.afterRoundPlayed() is about
        // to update for *this* round; reading through it here would see the *previous* round's answer.
        this.roundHandler.afterRoundPlayed(this, creditsBeforePlay, this.baseSession.getWinEvaluationResult());
    }

    // StakeAmountDetermining: a respin never charges a real stake — see HoldAndWinRoundHandler, which
    // restores credits to their pre-play value for exactly that case. Same condition canPlayNextGame() uses
    // to let such a spin through regardless of balance, kept as one source of truth.
    public getStakeAmount(): number {
        return this.active ? 0 : this.getBet();
    }

    // Standard result API stabilization: reports what the *last played round* actually paid out, per
    // getHoldAndWinLastRoundOutcome() — never re-derived from isHoldAndWinActive() here (see
    // HoldAndWinRoundOutcome's own doc comment on why that would be wrong for both the triggering spin and
    // the completing respin). "ordinary" forwards straight to the wrapped session (a plain spin, or the
    // common case of a triggering spin that didn't also immediately complete the feature); "suppressed"
    // reports 0 (a respin's own wrapped-paytable win was collected then discarded, never actually paid);
    // "completed" reports baseWinAmount + payout — both components genuinely applied to credits this round
    // (see HoldAndWinRoundHandler.complete()).
    public override getWinAmount(): number {
        const outcome = this.lastRoundOutcome;
        if (outcome.kind === "ordinary") {
            return this.baseSession.getWinAmount();
        }
        if (outcome.kind === "suppressed") {
            return 0;
        }
        return outcome.baseWinAmount + outcome.payout;
    }

    // Same stabilization for the unified win-breakdown surface (see WinEvaluationResult): "ordinary"
    // forwards to the wrapped session unchanged; "suppressed" is a genuinely empty result (no wins to show
    // for a discarded respin); "completed" is built by buildCompletedWinEvaluationResult() below, coherent
    // with getWinAmount() above by construction (its own getTotalWin() always equals baseWinAmount + payout).
    public override getWinEvaluationResult(): WinEvaluationResult<T> {
        const outcome = this.lastRoundOutcome;
        if (outcome.kind === "ordinary") {
            return this.baseSession.getWinEvaluationResult();
        }
        if (outcome.kind === "suppressed") {
            return new WinEvaluationResult<T>();
        }
        return this.buildCompletedWinEvaluationResult(outcome);
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

    // Reconstructs a coherent win-component breakdown for a "completed" outcome: every locked "value"
    // symbol becomes its own ValueWinComponent, attributed a proportional share of "payout" (amount /
    // sum-of-raw-amounts) — this is what keeps the reconstruction's own getTotalWin() equal to "payout"
    // exactly by construction, regardless of what formula the injected HoldAndWinPayoutAggregating actually
    // used internally (this class has no visibility into that; proportional attribution is honest about
    // being an attribution of the authoritative total, not a claim of reproducing the aggregator's own
    // arithmetic). Locked "multiplier" symbols contribute no component of their own (they scale, they don't
    // themselves pay) — noted in metadata instead. A payout with no locked "value" symbols at all (e.g. an
    // aggregator paying purely off multiplier symbols, or a zero-locked-value edge case) falls back to one
    // component spanning every locked position, so the total is still never silently dropped.
    // "baseWinAmount"/"baseWinEvaluationResult" only ever contribute real components (rather than 0) for the
    // rare immediate-trigger-board-full case — see HoldAndWinRoundHandler.afterRoundPlayed's own comment on
    // why a respin's own win is always the empty WinEvaluationResult by the time it reaches here.
    private buildCompletedWinEvaluationResult(outcome: Extract<HoldAndWinRoundOutcome<T>, {kind: "completed"}>): WinEvaluationResult<T> {
        const valueLocked = outcome.lockedSymbols.filter(isValueLocked<T>);
        const rawSum = valueLocked.reduce((sum, locked) => sum + locked.effect.amount, 0);
        const featureValueWins: ValueWinComponent<T>[] = [];

        if (outcome.payout > 0 && valueLocked.length > 0 && rawSum > 0) {
            for (const locked of valueLocked) {
                const share = (locked.effect.amount / rawSum) * outcome.payout;
                featureValueWins.push(new ValueWinComponent<T>(new WinningValue<T>(locked.symbolId, [[...locked.position]], share)));
            }
        } else if (outcome.payout > 0 && outcome.lockedSymbols.length > 0) {
            const attributedTo = outcome.lockedSymbols[outcome.lockedSymbols.length - 1];
            featureValueWins.push(
                new ValueWinComponent<T>(
                    new WinningValue<T>(
                        attributedTo.symbolId,
                        outcome.lockedSymbols.map((locked) => [...locked.position]),
                        outcome.payout,
                    ),
                ),
            );
        }

        return new WinEvaluationResult<T>({
            winComponents: [...outcome.baseWinEvaluationResult.getWinComponents(), ...featureValueWins],
            metadata: {
                holdAndWin: {
                    baseWinAmount: outcome.baseWinAmount,
                    payout: outcome.payout,
                    lockedSymbols: outcome.lockedSymbols,
                },
            },
        });
    }

    private supportsSessionStateCapture(session: VideoSlotSessionHandling<T>): session is VideoSlotSessionHandling<T> & ConvertableToSessionState {
        return typeof (session as Partial<ConvertableToSessionState>).toSessionState === "function";
    }

    private supportsSessionStateRestore(session: VideoSlotSessionHandling<T>): session is VideoSlotSessionHandling<T> & BuildableFromSessionState {
        return typeof (session as Partial<BuildableFromSessionState>).fromSessionState === "function";
    }
}
