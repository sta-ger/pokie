import {ParallelSimulationRunner} from "pokie";

const SMOKE_SIMULATION_ROUNDS = 200;

export type SmokeSimulationOutcome =
    | {
          ok: true;
          rounds: number;
          // How many rounds were actually asked for (always SMOKE_SIMULATION_ROUNDS today) -- carried on
          // the outcome itself, rather than left for a caller to import the constant, so
          // evaluateRandomBuildQualityGates's "did every requested round actually get played" check
          // (see that module) has everything it needs from one object.
          roundsRequested: number;
          rtp: number;
          hitFrequency: number;
          // The largest single-round payout observed -- feeds evaluateRandomBuildQualityGates's max-win
          // sanity check (a NaN/Infinity/absurd value there is the signature of broken paytable math, not
          // of a legitimately rare big win).
          maxWin: number;
          averageBet: number;
      }
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
            roundsRequested: SMOKE_SIMULATION_ROUNDS,
            rtp: result.statistics.rtp,
            hitFrequency: result.statistics.rounds > 0 ? result.statistics.hitCount / result.statistics.rounds : 0,
            maxWin: result.statistics.maxWin,
            averageBet: result.statistics.averageBet,
        };
    } catch (error) {
        return {ok: false, error: error instanceof Error ? error.message : String(error)};
    }
}
