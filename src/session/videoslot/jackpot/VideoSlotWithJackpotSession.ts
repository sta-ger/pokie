import type {BuildableFromSessionState} from "../../BuildableFromSessionState.js";
import type {ConvertableToSessionState} from "../../ConvertableToSessionState.js";
import type {SimulationCategoryDetermining} from "../../SimulationCategoryDetermining.js";
import type {StakeAmountDetermining} from "../../StakeAmountDetermining.js";
import {AbstractVideoSlotSessionDecorator} from "../AbstractVideoSlotSessionDecorator.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";
import {ValueWinComponent} from "../winevaluation/ValueWinComponent.js";
import {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
import {WinningValue} from "../WinningValue.js";
import type {JackpotAwarding} from "./JackpotAwarding.js";
import type {JackpotContributing} from "./JackpotContributing.js";
import {JackpotRoundHandler} from "./JackpotRoundHandler.js";
import type {JackpotRoundHandling} from "./JackpotRoundHandling.js";
import type {JackpotRoundOutcome} from "./JackpotRoundOutcome.js";
import type {JackpotPoolRepresenting} from "./JackpotPoolRepresenting.js";
import type {JackpotTriggering} from "./JackpotTriggering.js";
import {NoJackpotTrigger} from "./NoJackpotTrigger.js";
import {PercentageOfBetJackpotContributor} from "./PercentageOfBetJackpotContributor.js";
import {SingleTierJackpotAwarding} from "./SingleTierJackpotAwarding.js";
import type {VideoSlotWithJackpotSessionHandling} from "./VideoSlotWithJackpotSessionHandling.js";
import type {VideoSlotWithJackpotSessionState} from "./VideoSlotWithJackpotSessionState.js";

// A first-class jackpot mechanic, composed onto any existing VideoSlotSessionHandling exactly the way
// VideoSlotWithFreeGamesSession/VideoSlotWithHoldAndWinSession compose their own mechanics — via decoration,
// not by changing VideoSlotSession itself. Every one of "fixed"/"local"/"progressive"-style jackpot sources
// is just a different JackpotPoolRepresenting implementation (see FixedJackpotPool/AccumulatingJackpotPool),
// never a different code path here. Deliberately does not implement any wallet/operator jackpot
// infrastructure (real cross-process shared pools, persistence beyond plain session-state serialization,
// funding reconciliation, ...) — see AccumulatingJackpotPool's own doc comment on that boundary.
//
// All the actual contribution/trigger/award logic lives in the injected JackpotRoundHandling collaborator
// (default JackpotRoundHandler) — this class is purely the composition point: constructor wiring, delegating
// play(), and exposing/persisting the handler's own state via JackpotStateDetermining/Setting. With every
// constructor argument left at its default (an empty pools list, a 0% contributor, a NoJackpotTrigger), this
// behaves exactly like the wrapped session on its own — the same "safe until explicitly configured"
// precedent VideoSlotWithBetModesSession's own defaults establish.
//
// Transparently forwards StakeAmountDetermining/SimulationCategoryDetermining from the wrapped session for
// every round the jackpot itself had no say in — critical for correct stacking (e.g. wrapping a
// VideoSlotWithHoldAndWinSession or VideoSlotWithFreeGamesSession): without this, a caller checking
// isStakeAmountDetermining() on *this* decorator would never see through to the wrapped session's own
// zero-stake respin/free-round signal, silently overcharging a real-money stake during what should be a free
// round of whatever this jackpot decorator happens to wrap.
export class VideoSlotWithJackpotSession<T extends string | number | symbol = string>
    extends AbstractVideoSlotSessionDecorator<T>
    implements
        VideoSlotWithJackpotSessionHandling<T>,
        ConvertableToSessionState<VideoSlotWithJackpotSessionState>,
        BuildableFromSessionState<VideoSlotWithJackpotSessionState>,
        StakeAmountDetermining,
        SimulationCategoryDetermining {
    private readonly pools: readonly JackpotPoolRepresenting[];
    private readonly roundHandler: JackpotRoundHandling<T>;
    private lastRoundOutcome: JackpotRoundOutcome<T> = {kind: "ordinary"};
    private awardCount = 0;
    private totalAwarded = 0;

    constructor(
        baseSession: VideoSlotSessionHandling<T>,
        pools: readonly JackpotPoolRepresenting[] = [],
        contributor: JackpotContributing = new PercentageOfBetJackpotContributor(0),
        trigger: JackpotTriggering<T> = new NoJackpotTrigger<T>(),
        awarding: JackpotAwarding<T> = new SingleTierJackpotAwarding<T>(),
        roundHandler: JackpotRoundHandling<T> = new JackpotRoundHandler<T>(contributor, trigger, awarding),
    ) {
        super(baseSession);
        this.pools = pools;
        this.roundHandler = roundHandler;
    }

    public getJackpotPools(): readonly JackpotPoolRepresenting[] {
        return this.pools;
    }

    public getJackpotLastRoundOutcome(): JackpotRoundOutcome<T> {
        return this.lastRoundOutcome;
    }

    public setJackpotLastRoundOutcome(value: JackpotRoundOutcome<T>): void {
        this.lastRoundOutcome = value;
    }

    public getJackpotAwardCount(): number {
        return this.awardCount;
    }

    public setJackpotAwardCount(value: number): void {
        this.awardCount = value;
    }

    public getJackpotTotalAwarded(): number {
        return this.totalAwarded;
    }

    public setJackpotTotalAwarded(value: number): void {
        this.totalAwarded = value;
    }

    public toSessionState(): VideoSlotWithJackpotSessionState {
        const state: VideoSlotWithJackpotSessionState = {awardCount: this.awardCount, totalAwarded: this.totalAwarded};
        const poolStates: Record<string, unknown> = {};
        let anyPoolCapturable = false;
        for (const pool of this.pools) {
            if (this.supportsPoolStateCapture(pool)) {
                poolStates[pool.getId()] = pool.toSessionState();
                anyPoolCapturable = true;
            }
        }
        if (anyPoolCapturable) {
            state.pools = poolStates;
        }
        if (this.supportsSessionStateCapture(this.baseSession)) {
            state.base = this.baseSession.toSessionState();
        }
        return state;
    }

    public fromSessionState(value: VideoSlotWithJackpotSessionState): this {
        this.awardCount = value.awardCount;
        this.totalAwarded = value.totalAwarded;
        if (value.pools !== undefined) {
            for (const pool of this.pools) {
                const poolState = value.pools[pool.getId()];
                if (poolState !== undefined && this.supportsPoolStateRestore(pool)) {
                    pool.fromSessionState(poolState);
                }
            }
        }
        if (value.base !== undefined && this.supportsSessionStateRestore(this.baseSession)) {
            this.baseSession.fromSessionState(value.base);
        }
        return this;
    }

    public override play(): void {
        if (!this.canPlayNextGame()) {
            return;
        }
        // Read before baseSession.play() — the stake a round actually charges is only meaningful as of
        // right before it plays (same principle VideoSlotWithBetModesSession's own play() relies on for
        // totalIntendedCharge).
        const stake = this.supportsStakeAmount(this.baseSession) ? this.baseSession.getStakeAmount() : this.baseSession.getBet();
        this.baseSession.play();
        // Read directly off baseSession, never via this.getWinEvaluationResult() — that method is
        // overridden below to answer from lastRoundOutcome, which roundHandler.afterRoundPlayed() is about
        // to update for *this* round; reading through it here would see the *previous* round's answer.
        this.roundHandler.afterRoundPlayed(this, stake, this.baseSession.getWinEvaluationResult());
    }

    // StakeAmountDetermining: the jackpot itself never changes what a round costs — always transparently
    // forwards the wrapped session's own answer when it has one (see this class's own doc comment on why
    // that's essential for correct stacking), falling back to the plain getBet() default every
    // StakeAmountDetermining implementer without an opinion already falls back to.
    public getStakeAmount(): number {
        return this.supportsStakeAmount(this.baseSession) ? this.baseSession.getStakeAmount() : this.getBet();
    }

    // Standard result API stabilization, mirroring VideoSlotWithHoldAndWinSession's own: "ordinary" forwards
    // straight to the wrapped session; "awarded" reports baseWinAmount + amount — both components genuinely
    // applied to credits this round (see JackpotRoundHandler.afterRoundPlayed()).
    public override getWinAmount(): number {
        const outcome = this.lastRoundOutcome;
        if (outcome.kind === "ordinary") {
            return this.baseSession.getWinAmount();
        }
        return outcome.baseWinAmount + outcome.amount;
    }

    // Same stabilization for the unified win-breakdown surface. Unlike Hold & Win's own reconstruction (which
    // has to proportionally split one payout across several locked symbols, and therefore worry about
    // floating-point residual — see VideoSlotWithHoldAndWinSession's own doc comment), a jackpot award is
    // always exactly one amount attributed to at most one symbol, so there is no splitting and no residual to
    // manage: the reconstruction is exact by construction. getWinningLines()/getWinningScatters()/
    // getLinesWinning()/getScattersWinning() are deliberately *not* overridden — unlike a Hold & Win respin, a
    // jackpot round never discards or suppresses the wrapped session's own line/scatter result, so the
    // inherited pass-through (see AbstractVideoSlotSessionDecorator) is already correct.
    public override getWinEvaluationResult(): WinEvaluationResult<T> {
        const outcome = this.lastRoundOutcome;
        if (outcome.kind === "ordinary") {
            return this.baseSession.getWinEvaluationResult();
        }
        const jackpotComponent =
            outcome.symbolId !== undefined ? [new ValueWinComponent<T>(new WinningValue<T>(outcome.symbolId, [], outcome.amount))] : [];
        return new WinEvaluationResult<T>({
            winComponents: [...outcome.baseWinEvaluationResult.getWinComponents(), ...jackpotComponent],
            metadata: {jackpot: {poolId: outcome.poolId, amount: outcome.amount}},
        });
    }

    // SimulationCategoryDetermining: pure transparency, *never* reports "jackpot" itself here — always
    // forwards to the wrapped session's own opinion when it has one (e.g. "holdAndWin"/"base" from a wrapped
    // VideoSlotWithHoldAndWinSession), or punts entirely (empty string — "no opinion," per this interface's
    // own doc comment) when it doesn't, letting StakeBasedSimulationRoundCategoryDeterminer decide instead.
    //
    // This is deliberate, not an oversight: AggregateSimulationRunner reads a session's category *before*
    // play() but its payout *after* play() (see its own "read before play(), same as nominalBet" comment) —
    // fine for something knowable in advance, like "is the upcoming round a respin" (Hold & Win's own
    // isHoldAndWinActive()), but a jackpot trigger is only ever discovered *during* play(), once the grid
    // exists. Reporting "jackpot" here for the round that just won would actually attribute that category to
    // the *next* round instead (whatever lastRoundOutcome happened to say before that next round's own
    // play() overwrites it) — a real, silent misattribution bug, not a rounding-error-scale imprecision. See
    // getJackpotAwardCount()/getJackpotTotalAwarded() for the correct way to observe jackpot-specific
    // simulation statistics; the overall accumulator's own totalPayout (via getWinAmount(), read *after*
    // play() by both AggregateSimulationRunner and any real caller) already correctly includes every award
    // regardless.
    public getSimulationCategory(): string {
        return this.supportsSimulationCategory(this.baseSession) ? this.baseSession.getSimulationCategory() : "";
    }

    private supportsStakeAmount(session: VideoSlotSessionHandling<T>): session is VideoSlotSessionHandling<T> & StakeAmountDetermining {
        return typeof (session as Partial<StakeAmountDetermining>).getStakeAmount === "function";
    }

    private supportsSimulationCategory(session: VideoSlotSessionHandling<T>): session is VideoSlotSessionHandling<T> & SimulationCategoryDetermining {
        return typeof (session as Partial<SimulationCategoryDetermining>).getSimulationCategory === "function";
    }

    private supportsSessionStateCapture(session: VideoSlotSessionHandling<T>): session is VideoSlotSessionHandling<T> & ConvertableToSessionState {
        return typeof (session as Partial<ConvertableToSessionState>).toSessionState === "function";
    }

    private supportsSessionStateRestore(session: VideoSlotSessionHandling<T>): session is VideoSlotSessionHandling<T> & BuildableFromSessionState {
        return typeof (session as Partial<BuildableFromSessionState>).fromSessionState === "function";
    }

    private supportsPoolStateCapture(pool: JackpotPoolRepresenting): pool is JackpotPoolRepresenting & ConvertableToSessionState {
        return typeof (pool as Partial<ConvertableToSessionState>).toSessionState === "function";
    }

    private supportsPoolStateRestore(pool: JackpotPoolRepresenting): pool is JackpotPoolRepresenting & BuildableFromSessionState {
        return typeof (pool as Partial<BuildableFromSessionState>).fromSessionState === "function";
    }
}
