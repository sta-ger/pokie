import {PercentageOfBetJackpotContributor} from "./PercentageOfBetJackpotContributor.js";
import {SymbolCountJackpotTrigger} from "./SymbolCountJackpotTrigger.js";
import {NoJackpotTrigger} from "./NoJackpotTrigger.js";
import {SingleTierJackpotAwarding} from "./SingleTierJackpotAwarding.js";
import {rejectScreenGeometry} from "../coordinates/projectSymbolsCombination.js";
import {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
import {applyJackpotPoolStatisticsDelta} from "./applyJackpotPoolStatisticsDelta.js";
import type {JackpotAwarding} from "./JackpotAwarding.js";
import type {JackpotContributing} from "./JackpotContributing.js";
import type {JackpotRoundHandling} from "./JackpotRoundHandling.js";
import type {JackpotTriggerContext} from "./JackpotTriggerContext.js";
import type {JackpotTriggering} from "./JackpotTriggering.js";
import type {VideoSlotWithJackpotSessionHandling} from "./VideoSlotWithJackpotSessionHandling.js";

// The actual jackpot state machine — see JackpotRoundHandling's own doc comment for why this lives in a
// separate, replaceable collaborator rather than in VideoSlotWithJackpotSession itself.
//
// - **Contribution**: every configured pool (see session.getJackpotPools()) is contributed to once per
//   round, via "contributor" — but only for a round that actually charged a real stake (stake > 0); a
//   zero-stake round (e.g. a free spin, or a respin of some other feature this session happens to be stacked
//   under) never grows the jackpot. Contribution happens whether or not the round goes on to trigger a
//   jackpot — that is the entire point of a jackpot pool: it accumulates across many non-winning rounds
//   until, eventually, one round wins it.
// - **Trigger/eligibility**: "trigger" makes one yes/no decision for the whole round (see JackpotTriggering).
//   Never consulted at all when no pools are configured — there would be nothing to award.
// - **Award resolution**: once triggered, "awarding" resolves which configured pool pays out and how much,
//   calling that pool's own award() exactly once (see JackpotAwarding).
// - **Payout attribution**: the awarded amount is added directly to credits, on top of whatever the wrapped
//   session's own round already paid (never discarded/suppressed, unlike a Hold & Win respin) — see
//   JackpotRoundOutcome's own doc comment on why this outcome model is simpler than Hold & Win's.
// - **Statistics**: session.getJackpotPoolStatistics() (keyed by poolId, updated via
//   applyJackpotPoolStatisticsDelta()) is the single source of truth for contribution/award-count/
//   total-awarded, per pool — every contribution and every award updates it, whether or not this round
//   went on to trigger anything. getJackpotAwardCount()/getJackpotTotalAwarded()/getJackpotTotalContributed()
//   are just sums over it — see JackpotStateDetermining's own doc comment on why this, not
//   SimulationCategoryDetermining, is the correct way to observe jackpot-specific simulation statistics.
export class JackpotRoundHandler<T extends string | number | symbol = string> implements JackpotRoundHandling<T> {
    private readonly contributor: JackpotContributing;
    private readonly trigger: JackpotTriggering<T>;
    private readonly awarding: JackpotAwarding<T>;

    constructor(contributor: JackpotContributing, trigger: JackpotTriggering<T>, awarding: JackpotAwarding<T>) {
        this.contributor = contributor;
        this.trigger = trigger;
        this.awarding = awarding;
    }

    public isStatelessForSessionRestoration(): boolean {
        return this.constructor === JackpotRoundHandler && this.contributor instanceof PercentageOfBetJackpotContributor && this.contributor.isStatelessForSessionRestoration() &&
            (this.trigger instanceof SymbolCountJackpotTrigger || this.trigger instanceof NoJackpotTrigger) && this.trigger.isStatelessForSessionRestoration() &&
            this.awarding instanceof SingleTierJackpotAwarding && this.awarding.isStatelessForSessionRestoration();
    }

    public afterRoundPlayed(
        session: VideoSlotWithJackpotSessionHandling<T>,
        stake: number,
        baseWinEvaluationResult: WinEvaluationResult<T> = new WinEvaluationResult<T>(),
    ): void {
        rejectScreenGeometry(session, "Jackpot");
        const pools = session.getJackpotPools();
        const credits = session.getCreditsAmount();
        const statistics = session.getJackpotPoolStatistics();
        const rollbacks = pools.flatMap(pool => {
            const codec = pool as typeof pool & {toSessionState?: () => unknown; fromSessionState?: (state: unknown) => unknown};
            if (!codec.toSessionState || !codec.fromSessionState) return [];
            const state = codec.toSessionState();
            return [() => codec.fromSessionState!(state)];
        });
        try {
            let poolStatistics = session.getJackpotPoolStatistics();

            if (stake > 0) {
                for (const pool of pools) {
                    const contribution = this.contributor.computeContribution(pool.getId(), stake);
                    if (!Number.isFinite(contribution)) throw new Error("Jackpot contribution overflow.");
                    if (contribution > 0) {
                        pool.contribute(contribution);
                        if (!Number.isFinite(pool.getValue())) throw new Error("Jackpot pool overflow.");
                        poolStatistics = applyJackpotPoolStatisticsDelta(poolStatistics, pool.getId(), {totalContributed: contribution});
                    }
                }
            }
            this.validateStatistics(poolStatistics);
            session.setJackpotPoolStatistics(poolStatistics);

            if (pools.length === 0) {
                session.setJackpotLastRoundOutcome({kind: "ordinary"});
                return;
            }

            const context: JackpotTriggerContext<T> = {
                bet: session.getBet(),
                stake,
                symbols: session.getSymbolsCombination().toMatrix(),
            };
            if (!this.trigger.isTriggered(context)) {
                session.setJackpotLastRoundOutcome({kind: "ordinary"});
                return;
            }

            const award = this.awarding.resolveAward(pools, context);
            const payout = baseWinEvaluationResult.getTotalWin() + award.amount;
            const balance = session.getCreditsAmount() + award.amount;
            if (!Number.isFinite(award.amount) || !Number.isFinite(payout) || !Number.isFinite(balance)) throw new Error("Jackpot payout or balance overflow.");
            const nextStatistics = applyJackpotPoolStatisticsDelta(poolStatistics, award.poolId, {awardCount: 1, totalAwarded: award.amount});
            this.validateStatistics(nextStatistics);
            session.setCreditsAmount(balance);
            session.setJackpotPoolStatistics(nextStatistics);
            session.setJackpotLastRoundOutcome({
                kind: "awarded",
                poolId: award.poolId,
                amount: award.amount,
                symbolId: award.symbolId,
                baseWinAmount: baseWinEvaluationResult.getTotalWin(),
                baseWinEvaluationResult,
            });
        } catch (error) {
            for (const rollback of rollbacks) rollback();
            session.setCreditsAmount(credits);
            session.setJackpotPoolStatistics(statistics);
            session.setJackpotLastRoundOutcome({kind: "ordinary"});
            throw error;
        }
    }
    private validateStatistics(statistics: ReturnType<VideoSlotWithJackpotSessionHandling<T>["getJackpotPoolStatistics"]>): void {
        for (const field of ["awardCount", "totalAwarded", "totalContributed"] as const) {
            if (!Number.isFinite(Object.values(statistics).reduce((sum, value) => sum + value[field], 0))) throw new Error("Jackpot statistics overflow.");
        }
    }

}
