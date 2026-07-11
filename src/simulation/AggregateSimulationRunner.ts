import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {NextSessionRoundPlayableDetermining} from "./playstrategy/NextSessionRoundPlayableDetermining.js";
import type {SimulationBreakdownComponent} from "./SimulationBreakdownComponent.js";
import type {SimulationRoundCategoryDetermining} from "./SimulationRoundCategoryDetermining.js";
import {SimulationAccumulator} from "./SimulationAccumulator.js";
import {StakeBasedSimulationRoundCategoryDeterminer} from "./StakeBasedSimulationRoundCategoryDeterminer.js";

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

    private lastBreakdown: Record<string, SimulationBreakdownComponent> | undefined;

    constructor(
        session: GameSessionHandling,
        rounds: number,
        playStrategy?: NextSessionRoundPlayableDetermining,
        roundCategoryDeterminer: SimulationRoundCategoryDetermining = new StakeBasedSimulationRoundCategoryDeterminer(),
    ) {
        this.session = session;
        this.rounds = rounds;
        this.playStrategy = playStrategy;
        this.roundCategoryDeterminer = roundCategoryDeterminer;
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
            const bet = this.session.getBet();
            const supportsCategorization = this.roundCategoryDeterminer.supportsRoundCategorization(this.session);
            const category = supportsCategorization ? this.roundCategoryDeterminer.categorizeRound(this.session) : undefined;

            this.session.play();
            const payout = this.session.getWinAmount();
            accumulator.addRound(bet, payout);

            if (supportsCategorization && category !== undefined) {
                categorizationSupported = true;
                this.addToCategoryTotals(categoryTotals, category, bet, payout);
            }
        }

        this.lastBreakdown = categorizationSupported ? this.toBreakdownComponents(categoryTotals) : undefined;
        return accumulator;
    }

    // Populated by the most recent run(); undefined when the session never exposed the optional
    // categorization contract (see SimulationRoundCategoryDetermining), not merely when a category
    // happened to have zero rounds.
    public getBreakdownStatistics(): Record<string, SimulationBreakdownComponent> | undefined {
        return this.lastBreakdown;
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
