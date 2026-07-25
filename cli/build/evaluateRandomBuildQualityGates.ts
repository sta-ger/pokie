import type {SmokeSimulationOutcome} from "./runSmokeSimulation.js";

type SuccessfulSmokeSimulationOutcome = Extract<SmokeSimulationOutcome, {ok: true}>;

// Generous on purpose: this is a sanity backstop against a broken generator (NaN/negative payouts, a
// runaway multiplier), not a target-RTP or volatility limit. RandomGameBlueprintGenerator's own math is
// structurally valid by construction (see its doc comment) but deliberately unqualified for production
// tuning, so a legitimately large rare win over a short smoke run must never trip this into a hard
// failure -- see BuildCommand/CreateCommand's "random" paths, which only ever print these as warnings.
const MAX_WIN_TO_AVERAGE_BET_SANITY_MULTIPLIER = 100_000;

// Bounded, best-effort quality gates run after a random build's own smoke simulation (see
// runSmokeSimulation.ts). Neither check ever fails the build on its own -- callers only print the
// returned warnings, they never turn them into a non-zero exit code -- because a randomly generated
// blueprint's math is structurally valid, not production-tuned, and these are sanity backstops against a
// broken generator, not a promise about RTP, volatility, or win-size distribution:
//   - "feature termination": the session should be able to play every round the smoke simulation asked
//     for. If it stops early (canPlayNextGame() turns false before the round budget is spent), some
//     mechanic isn't letting play continue -- worth a human's attention even though it isn't itself
//     unsafe to ship.
//   - "max-win sanity": the largest single payout observed should be a finite, non-negative amount, and
//     not wildly out of proportion to the average bet -- a NaN/Infinity/absurd multiplier is the
//     signature of broken paytable/winModel math, not of a legitimately rare big win.
export function evaluateRandomBuildQualityGates(smoke: SuccessfulSmokeSimulationOutcome): string[] {
    const warnings: string[] = [];

    if (smoke.rounds < smoke.roundsRequested) {
        warnings.push(
            `feature termination: only ${smoke.rounds}/${smoke.roundsRequested} smoke-simulation rounds completed -- ` +
                `a mechanic may be preventing the session from continuing to play.`,
        );
    }

    if (!Number.isFinite(smoke.maxWin) || smoke.maxWin < 0) {
        warnings.push(`max-win sanity: observed max win (${smoke.maxWin}) is not a finite, non-negative amount.`);
    } else if (smoke.averageBet > 0 && smoke.maxWin / smoke.averageBet > MAX_WIN_TO_AVERAGE_BET_SANITY_MULTIPLIER) {
        warnings.push(
            `max-win sanity: observed max win is ${(smoke.maxWin / smoke.averageBet).toFixed(0)}x the average bet, ` +
                `beyond the ${MAX_WIN_TO_AVERAGE_BET_SANITY_MULTIPLIER}x sanity threshold -- verify the paytable/winModel math.`,
        );
    }

    return warnings;
}
