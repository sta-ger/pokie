import type {JackpotStatisticsProviding} from "../session/JackpotStatisticsProviding.js";
import type {JackpotStatisticsSnapshot} from "../session/JackpotStatisticsSnapshot.js";
import type {StakeAmountDetermining} from "../session/StakeAmountDetermining.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {BetModeForNextSimulationRoundSetting} from "./BetModeForNextSimulationRoundSetting.js";
import {ExplicitSimulationRoundCategoryDeterminer} from "./ExplicitSimulationRoundCategoryDeterminer.js";
import {FallbackSimulationRoundCategoryDeterminer} from "./FallbackSimulationRoundCategoryDeterminer.js";
import type {NextSessionRoundPlayableDetermining} from "./playstrategy/NextSessionRoundPlayableDetermining.js";
import type {SimulationBreakdownComponent} from "./SimulationBreakdownComponent.js";
import {SimulationCategoryNameNormalizer} from "./SimulationCategoryNameNormalizer.js";
import type {SimulationRoundCategoryDetermining} from "./SimulationRoundCategoryDetermining.js";
import {SimulationAccumulator} from "./SimulationAccumulator.js";
import {StakeBasedSimulationRoundCategoryDeterminer} from "./StakeBasedSimulationRoundCategoryDeterminer.js";

// A session's own explicit SimulationCategoryDetermining answer (e.g. "bonus", "respins") always
// takes priority when present; StakeBasedSimulationRoundCategoryDeterminer's base/freeGames inference
// is only a fallback for rounds (or whole sessions) the explicit contract doesn't cover. Sessions that
// implement neither are unaffected either way — this default is 100% backward compatible.
function createDefaultRoundCategoryDeterminer(): SimulationRoundCategoryDetermining {
    return new FallbackSimulationRoundCategoryDeterminer([
        new ExplicitSimulationRoundCategoryDeterminer(),
        new StakeBasedSimulationRoundCategoryDeterminer(),
    ]);
}

type CategoryTotals = {
    rounds: number;
    hitCount: number;
    totalBet: number;
    totalWin: number;
    maxWin: number;
};

export class AggregateSimulationRunner {
    private readonly session: GameSessionHandling;
    private readonly rounds: number;
    private readonly playStrategy?: NextSessionRoundPlayableDetermining;
    private readonly roundCategoryDeterminer: SimulationRoundCategoryDetermining;
    private readonly betModeSelector?: BetModeForNextSimulationRoundSetting;

    private lastBreakdown: Record<string, SimulationBreakdownComponent> | undefined;
    private lastJackpotStatistics: JackpotStatisticsSnapshot | undefined;

    constructor(
        session: GameSessionHandling,
        rounds: number,
        playStrategy?: NextSessionRoundPlayableDetermining,
        roundCategoryDeterminer: SimulationRoundCategoryDetermining = createDefaultRoundCategoryDeterminer(),
        // Locks the run to one bet mode (see FixedBetModeForNextSimulationRoundSetting) — absent by
        // default, so an existing caller that never touches bet modes gets byte-identical behavior.
        // Its presence also switches the *breakdown's* own bet accounting from the nominal getBet()
        // (used for the overall accumulator below, unconditionally, exactly as always) to
        // getStakeAmount() (see resolveStakeAmount()): a mode-locked run's whole point is measuring
        // what a bet mode actually costs, which is exactly what StakeAmountDetermining -- already the
        // runtime's own source of truth, never recomputed here -- reports.
        betModeSelector: BetModeForNextSimulationRoundSetting | undefined = undefined,
    ) {
        this.session = session;
        this.rounds = rounds;
        this.playStrategy = playStrategy;
        this.roundCategoryDeterminer = roundCategoryDeterminer;
        this.betModeSelector = betModeSelector;
    }

    public run(): SimulationAccumulator {
        const accumulator = new SimulationAccumulator();
        const categoryTotals = new Map<string, CategoryTotals>();
        let categorizationSupported = false;

        for (let round = 0; round < this.rounds; round++) {
            if (!this.session.canPlayNextGame()) {
                break;
            }
            if (this.playStrategy && !this.playStrategy.canPlayNextSimulationRound(this.session)) {
                break;
            }
            this.betModeSelector?.setBetModeForNextRound(this.session);

            const nominalBet = this.session.getBet();
            // Read before play(), same as nominalBet — getStakeAmount()'s own contract (see
            // StakeAmountDetermining) is "what the *next* play() will actually charge".
            const stakeAmount = this.betModeSelector ? this.resolveStakeAmount() : nominalBet;
            const supportsCategorization = this.roundCategoryDeterminer.supportsRoundCategorization(this.session);
            // Normalized/validated here, centrally, regardless of which determiner produced it — an
            // injected custom SimulationRoundCategoryDetermining (see the extension point) gets the same
            // safety net as the built-in ExplicitSimulationRoundCategoryDeterminer, so no determiner can
            // put an empty/oversized/unsafe string directly into a breakdown key. An invalid category is
            // treated exactly like "this determiner doesn't support this round" — the round still plays
            // and counts toward the overall totals, it just isn't attributed to any breakdown category.
            const category = supportsCategorization
                ? SimulationCategoryNameNormalizer.normalize(this.roundCategoryDeterminer.categorizeRound(this.session))
                : undefined;

            this.session.play();
            const payout = this.session.getWinAmount();
            // Unconditionally nominal-bet-based, exactly as before betModeSelector existed — free/bonus
            // rounds still count at their nominal wager value here, which is what makes this the right
            // basis for the *overall*, mode-blind accumulator (see SimulationAccumulator's own bet > 0
            // requirement: stakeAmount is 0 mid a free round, which this never feeds it).
            accumulator.addRound(nominalBet, payout);

            if (category !== undefined) {
                categorizationSupported = true;
                this.addToCategoryTotals(categoryTotals, category, stakeAmount, payout);
            }
        }

        this.lastBreakdown = categorizationSupported ? this.toBreakdownComponents(categoryTotals) : undefined;
        // A single read, after the loop, never per-round/per-category — see JackpotStatisticsProviding's own
        // doc comment on why this must never be routed through SimulationCategoryDetermining/categoryTotals
        // above (a per-round category read happens *before* play(), a jackpot trigger is only known *after*
        // it). The snapshot itself is already cumulative for this session, so one read is always correct
        // regardless of how many rounds this run() call actually played.
        this.lastJackpotStatistics = this.supportsJackpotStatistics(this.session) ? this.session.getJackpotStatisticsSnapshot() : undefined;
        return accumulator;
    }

    // Populated by the most recent run(); undefined when the session never exposed the optional
    // categorization contract (see SimulationRoundCategoryDetermining), not merely when a category
    // happened to have zero rounds.
    public getBreakdownStatistics(): Record<string, SimulationBreakdownComponent> | undefined {
        return this.lastBreakdown;
    }

    // Populated by the most recent run(); undefined when the session never exposed
    // JackpotStatisticsProviding. See that interface's own doc comment for why this, not
    // SimulationCategoryDetermining, is the correct way to observe jackpot-specific simulation statistics.
    public getJackpotStatistics(): JackpotStatisticsSnapshot | undefined {
        return this.lastJackpotStatistics;
    }

    private addToCategoryTotals(categoryTotals: Map<string, CategoryTotals>, category: string, bet: number, payout: number): void {
        const totals = categoryTotals.get(category) ?? {rounds: 0, hitCount: 0, totalBet: 0, totalWin: 0, maxWin: 0};
        totals.rounds++;
        totals.totalBet += bet;
        totals.totalWin += payout;
        if (payout > 0) {
            totals.hitCount++;
        }
        if (payout > totals.maxWin) {
            totals.maxWin = payout;
        }
        categoryTotals.set(category, totals);
    }

    private resolveStakeAmount(): number {
        return this.supportsStakeAmount(this.session) ? this.session.getStakeAmount() : this.session.getBet();
    }

    private supportsStakeAmount(session: GameSessionHandling): session is GameSessionHandling & StakeAmountDetermining {
        return typeof (session as Partial<StakeAmountDetermining>).getStakeAmount === "function";
    }

    private supportsJackpotStatistics(session: GameSessionHandling): session is GameSessionHandling & JackpotStatisticsProviding {
        return typeof (session as Partial<JackpotStatisticsProviding>).getJackpotStatisticsSnapshot === "function";
    }

    private toBreakdownComponents(categoryTotals: Map<string, CategoryTotals>): Record<string, SimulationBreakdownComponent> {
        const components: Record<string, SimulationBreakdownComponent> = {};
        categoryTotals.forEach((totals, category) => {
            components[category] = {
                rounds: totals.rounds,
                totalBet: totals.totalBet,
                totalWin: totals.totalWin,
                rtp: totals.totalBet > 0 ? totals.totalWin / totals.totalBet : 0,
                hitFrequency: totals.rounds > 0 ? totals.hitCount / totals.rounds : 0,
                maxWin: totals.maxWin,
            };
        });
        return components;
    }
}
