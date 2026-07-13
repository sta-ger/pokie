import type {SimulationWorkerResult} from "../SimulationWorkerResult.js";

// The postMessage protocol a worker thread speaks to SimulationWorkerCoordinator — internal transport
// detail, never part of the public API: a caller only ever sees the public SimulationWorkerRequest it
// hands in and the SimulationWorkerResult (or thrown error) it gets back, never the wire messages in
// between. A tagged union so the coordinator never has to guess what an incoming message means or
// rely on uncaught-exception serialization for error reporting (see simulationWorkerEntry.ts, which
// never lets an exception escape uncaught: every failure is turned into an explicit {type: "error"}
// message with a safe, stack-trace-free reason).
export type SimulationWorkerProgressMessage = {
    type: "progress";
    workerIndex: number;
    roundsCompleted: number;
};

export type SimulationWorkerResultMessage = {
    type: "result";
} & SimulationWorkerResult;

export type SimulationWorkerErrorMessage = {
    type: "error";
    workerIndex: number;
    // Always `error.message` (or String(error) for a non-Error throw) — never a stack trace, see
    // docs/simulation.md.
    message: string;
};

export type SimulationWorkerMessage = SimulationWorkerProgressMessage | SimulationWorkerResultMessage | SimulationWorkerErrorMessage;
