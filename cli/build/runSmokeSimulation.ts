import {ParallelSimulationRunner} from "pokie";

const SMOKE_SIMULATION_ROUNDS = 200;

export type SmokeSimulationOutcome =
    | {ok: true; rounds: number; rtp: number; hitFrequency: number}
    | {ok: false; error: string};

// A short, in-process simulation run against an already-built (real, on-disk) package -- the actual
// sanity check behind "pokie build random"/"pokie create --random"'s smoke-test step: can this
// randomly generated content actually be loaded and played, not just shape-valid? Reuses the exact
// same ParallelSimulationRunner "pokie sim" itself calls (workers: 1, fully in-process) rather than
// reimplementing any simulation logic here.
export async function runSmokeSimulation(projectRoot: string, seed: number): Promise<SmokeSimulationOutcome> {
    try {
        const result = await new ParallelSimulationRunner(projectRoot, SMOKE_SIMULATION_ROUNDS, {
            seed: `random-build-smoke-${seed}`,
        }).run();

        return {
            ok: true,
            rounds: result.statistics.rounds,
            rtp: result.statistics.rtp,
            hitFrequency: result.statistics.rounds > 0 ? result.statistics.hitCount / result.statistics.rounds : 0,
        };
    } catch (error) {
        return {ok: false, error: error instanceof Error ? error.message : String(error)};
    }
}
