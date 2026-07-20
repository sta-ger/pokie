import {AggregateSimulationRunner} from "../../AggregateSimulationRunner.js";
import type {BetModeForNextSimulationRoundSetting} from "../../BetModeForNextSimulationRoundSetting.js";
import {SimulationAccumulator} from "../../SimulationAccumulator.js";
import type {SimulationBreakdownComponent} from "../../SimulationBreakdownComponent.js";
import {mergeSimulationBreakdowns} from "../../SimulationBreakdownMerging.js";
import type {SimulationStopReason} from "../../SimulationStopReason.js";
import type {GameSessionHandling} from "../../../session/GameSessionHandling.js";
import {SimulationCancelledError} from "../SimulationCancelledError.js";

export type ChunkedSimulationChunkInfo = {
    roundsCompleted: number;
    // True once there is nothing left to do: either every requested round has been played, or the
    // session stopped itself early (canPlayNextGame() returning false). Lets a caller that yields
    // between chunks (see ParallelSimulationRunner's in-process path) skip a pointless final yield.
    isFinished: boolean;
};

export type ChunkedSimulationCallbacks = {
    // Checked at the top of every chunk, before that chunk plays a single round — mirrors
    // StudioSimulationService's original "cancellation can only take effect between chunks" behavior.
    // Throws SimulationCancelledError to stop, same as ParallelSimulationRunner's worker-thread path.
    shouldStop?: () => boolean;
    onChunkComplete?: (info: ChunkedSimulationChunkInfo) => Promise<void> | void;
    // Opt-in adaptive early stop (see SimulationConvergenceChecker) -- checked once per chunk, right
    // after that chunk is merged into the running accumulator, but only when the session didn't already
    // stop the chunk early on its own (see stopReason precedence below). Returning true ends the run at
    // this chunk boundary, reported as stopReason "converged" rather than "maxRounds"/"sessionStopped".
    // Absent by default, so a caller that never sets it is unaffected -- the loop always plays every
    // requested round, exactly as before this existed.
    checkConvergence?: (accumulator: SimulationAccumulator, roundsCompleted: number) => boolean;
};

export type ChunkedSimulationResult = {
    accumulator: SimulationAccumulator;
    breakdown?: Record<string, SimulationBreakdownComponent>;
    roundsCompleted: number;
    stopReason: SimulationStopReason;
};

// Plays `rounds` rounds against `session` in bounded chunks (via the existing
// AggregateSimulationRunner, merged via the existing SimulationAccumulator.merge()/
// mergeSimulationBreakdowns — never a reimplementation of either), reporting progress after each
// chunk. This is the one place that chunking logic lives: both simulationWorkerEntry.ts (reporting
// progress via postMessage) and ParallelSimulationRunner's in-process workers=1 path (reporting via a
// plain callback and yielding to the event loop between chunks) call this same function rather than
// each maintaining their own copy of it.
//
// `chunkSize >= rounds` (the default for a caller that doesn't need incremental progress/cancellation,
// e.g. `pokie sim`'s workers=1 path) makes this run in a single chunk — mathematically and
// numerically identical to one direct `new AggregateSimulationRunner(session, rounds).run()` call,
// since chunking never changes the sequence of session.play() calls, only how the (already correct,
// already merge-capable) running totals are batched.
export async function runChunkedSimulation(
    session: GameSessionHandling,
    rounds: number,
    chunkSize: number,
    callbacks: ChunkedSimulationCallbacks = {},
    // Locks every chunk's AggregateSimulationRunner to one bet mode (see ParallelSimulationRunOptions.
    // betModeId) — undefined by default, so a caller that never touches bet modes is unaffected.
    betModeSelector: BetModeForNextSimulationRoundSetting | undefined = undefined,
): Promise<ChunkedSimulationResult> {
    const accumulator = new SimulationAccumulator();
    let breakdown: Record<string, SimulationBreakdownComponent> | undefined;
    let roundsCompleted = 0;
    let roundsRemaining = rounds;
    let stopReason: SimulationStopReason = "maxRounds";

    while (roundsRemaining > 0) {
        if (callbacks.shouldStop?.()) {
            throw new SimulationCancelledError();
        }

        const chunkRounds = Math.min(chunkSize, roundsRemaining);
        const runner = new AggregateSimulationRunner(session, chunkRounds, undefined, undefined, betModeSelector);
        const chunkAccumulator = runner.run();
        accumulator.merge(chunkAccumulator);
        const chunkBreakdown = runner.getBreakdownStatistics();
        if (chunkBreakdown) {
            breakdown = mergeSimulationBreakdowns(breakdown, chunkBreakdown);
        }

        const chunkRoundsPlayed = chunkAccumulator.getStatistics().rounds;
        roundsCompleted += chunkRoundsPlayed;
        const stoppedEarly = chunkRoundsPlayed < chunkRounds;
        roundsRemaining -= chunkRounds;
        // Never checked once the session has already stopped itself early this chunk — sessionStopped
        // always takes precedence over converged, since there's no meaningful "converged" statistic to
        // report on a run the session itself cut short.
        const converged = !stoppedEarly && (callbacks.checkConvergence?.(accumulator, roundsCompleted) ?? false);

        await callbacks.onChunkComplete?.({roundsCompleted, isFinished: stoppedEarly || converged || roundsRemaining <= 0});

        // The session stopped playing on its own before using every round in this chunk — no point
        // scheduling further chunks once that's happened.
        if (stoppedEarly) {
            stopReason = "sessionStopped";
            break;
        }
        if (converged) {
            stopReason = "converged";
            break;
        }
    }

    return {accumulator, breakdown, roundsCompleted, stopReason};
}
