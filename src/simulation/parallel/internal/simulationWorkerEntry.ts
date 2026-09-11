import {loadPokieGame, releasePokieGame} from "../../../gamepackage/loadPokieGame.js";
import {parentPort, workerData} from "worker_threads";
import {FixedBetModeForNextSimulationRoundSetting} from "../../FixedBetModeForNextSimulationRoundSetting.js";
import {SimulationConvergenceChecker} from "../../SimulationConvergenceChecker.js";
import {runChunkedSimulation} from "./runChunkedSimulation.js";
import type {SimulationWorkerMessage} from "./SimulationWorkerMessage.js";
import type {SimulationWorkerRequest} from "../SimulationWorkerRequest.js";

// The actual code a worker thread runs (spawned by SimulationWorkerCoordinator, see its own doc
// comment for why the entry point is a real file rather than an eval'd string) — loads the SAME game
// package independently (a live PokieGame/session can't cross the worker_threads boundary, only the
// packageRoot string can, see SimulationWorkerRequest), plays its own share of rounds via the shared
// runChunkedSimulation() (the exact same AggregateSimulationRunner/SimulationAccumulator every other
// simulation path uses), and reports back via postMessage only: progress messages while running, then
// exactly one terminal result or error message. Never lets an exception escape uncaught — every
// failure is turned into a safe, stack-trace-free {type: "error"} message (see docs/simulation.md).
async function main(): Promise<void> {
    if (!parentPort) {
        throw new Error("simulationWorkerEntry.ts must be run inside a worker_threads Worker.");
    }
    const port = parentPort;
    const request = workerData as SimulationWorkerRequest;

    let game: Awaited<ReturnType<typeof loadPokieGame>> | undefined;
    let terminal: SimulationWorkerMessage;
    try {
        game = await loadPokieGame(request.packageRoot);
        const session = game.createSession(request.seed === undefined ? undefined : {seed: request.seed});
        // Simulations measure RTP/volatility, not risk of ruin — same as every other simulation path.
        session.setCreditsAmount(Number.MAX_SAFE_INTEGER);

        const betModeSelector =
            request.betModeId !== undefined ? new FixedBetModeForNextSimulationRoundSetting(request.betModeId) : undefined;
        const convergenceChecker = request.convergence ? new SimulationConvergenceChecker(request.convergence) : undefined;

        const {accumulator, breakdown, jackpot, roundsCompleted, stopReason} = await runChunkedSimulation(
            session,
            request.rounds,
            request.progressChunkSize,
            {
                onChunkComplete: ({roundsCompleted: completed}) => {
                    const progress: SimulationWorkerMessage = {type: "progress", workerIndex: request.workerIndex, roundsCompleted: completed};
                    port.postMessage(progress);
                },
                checkConvergence: convergenceChecker
                    ? (acc, completed) => convergenceChecker.check(acc, completed).converged
                    : undefined,
            },
            betModeSelector,
        );

        terminal = {
            type: "result",
            workerIndex: request.workerIndex,
            manifest: game.getManifest(),
            configHash: game.getConfigHash?.(),
            accumulator: accumulator.toSnapshot(),
            breakdown,
            jackpot,
            roundsCompleted,
            stopReason,
            convergence: convergenceChecker?.buildOutcome(),
        };
    } catch (error) {
        terminal = {
            type: "error",
            workerIndex: request.workerIndex,
            message: error instanceof Error ? error.message : String(error),
        };
    } finally {
        if (game !== undefined) {
            try {
                await releasePokieGame(game);
            } catch (error) {
                terminal = {
                    type: "error",
                    workerIndex: request.workerIndex,
                    message: `could not release game runtime: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        }
    }
    // The coordinator terminates workers immediately after their terminal message. Publish only after
    // releasing the invocation-owned snapshot, otherwise that termination races the worker's cleanup.
    port.postMessage(terminal!);
}

main().catch((error) => {
    // Only reachable if parentPort itself was missing (the one case main() throws instead of posting
    // an {type: "error"} message) — surfaces as a real uncaught exception so the coordinator's own
    // 'error'/'exit' handling (not the message protocol) catches it.
    throw error;
});
