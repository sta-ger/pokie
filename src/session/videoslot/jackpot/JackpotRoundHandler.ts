import {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
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
// - **Statistics**: getJackpotAwardCount()/getJackpotTotalAwarded() accumulate on every award — see
//   JackpotStateDetermining's own doc comment on why these, not SimulationCategoryDetermining, are the
//   correct way to observe jackpot-specific simulation statistics.
export class JackpotRoundHandler<T extends string | number | symbol = string> implements JackpotRoundHandling<T> {
    private readonly contributor: JackpotContributing;
    private readonly trigger: JackpotTriggering<T>;
    private readonly awarding: JackpotAwarding<T>;

    constructor(contributor: JackpotContributing, trigger: JackpotTriggering<T>, awarding: JackpotAwarding<T>) {
        this.contributor = contributor;
        this.trigger = trigger;
        this.awarding = awarding;
    }

    public afterRoundPlayed(
        session: VideoSlotWithJackpotSessionHandling<T>,
        stake: number,
        baseWinEvaluationResult: WinEvaluationResult<T> = new WinEvaluationResult<T>(),
    ): void {
        const pools = session.getJackpotPools();

        if (stake > 0) {
            for (const pool of pools) {
                const contribution = this.contributor.computeContribution(pool.getId(), stake);
                if (contribution > 0) {
                    pool.contribute(contribution);
                }
            }
        }

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
        session.setCreditsAmount(session.getCreditsAmount() + award.amount);
        session.setJackpotAwardCount(session.getJackpotAwardCount() + 1);
        session.setJackpotTotalAwarded(session.getJackpotTotalAwarded() + award.amount);
        session.setJackpotLastRoundOutcome({
            kind: "awarded",
            poolId: award.poolId,
            amount: award.amount,
            symbolId: award.symbolId,
            baseWinAmount: baseWinEvaluationResult.getTotalWin(),
            baseWinEvaluationResult,
        });
    }
}
