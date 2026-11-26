import {describeSimulationDiagnostics, describeSimulationPrecision, describeSimulationStopReason} from "../../../src/reporting/describeSimulationDiagnostics.js";

describe("simulation report labels", () => {
    it("turns precision enums into readable verdicts", () => {
        expect(describeSimulationPrecision("notRequested")).toBe("no precision target requested");
        expect(describeSimulationPrecision("insufficientPrecision")).toBe("requested precision not reached");
        expect(describeSimulationPrecision("empiricalPrecision")).toBe("empirical precision target reached");
    });

    it("turns stop-reason enums into readable outcomes", () => {
        expect(describeSimulationStopReason("maxRounds")).toBe("requested spins completed");
        expect(describeSimulationStopReason("sessionStopped")).toBe("session stopped early");
        expect(describeSimulationStopReason("converged")).toBe("converged");
    });

    it("separates requested plays from completed paid rounds in diagnostics", () => {
        const lines = describeSimulationDiagnostics({
            requestedRounds: 100_000,
            rounds: 68_701,
            sampling: {unit: "completed-logical-round", acceptedSubrounds: 100_000, excludedSubrounds: 0, trajectories: "independent-session-per-worker"},
            diagnostics: {sampleUnit: "completed-logical-round", samples: 68_701, achievedRtpHalfWidth: 0.0177, precision: "notRequested", coverageLimitations: []},
            stopReason: "maxRounds",
        });
        expect(lines[0]).toContain("requested spin budget 100000; 100000 spins accepted; usable samples 68701 completed paid rounds");
        expect(lines.join("\n")).toContain("completed paid rounds: 68701");
        expect(lines.join("\n")).toContain("requested spins completed");
    });
});

describe("simulation progress labels", () => {
    it("turns runtime preparation and cleanup stages into readable phases", async () => {
        const {describeSimulationProgress} = await import("../../../cli/studio-client/src/domain/interpret/Simulation.js");
        const job = {
            id: "job-1",
            status: "running",
            requestedRounds: 1000,
            rounds: 1000,
            seed: "bench",
            workers: 1,
            startedAt: "2026-01-01T00:00:00.000Z",
            roundsCompleted: 0,
            durationMs: 120,
            sourceCurrent: true,
            progress: {stage: "preparing", unit: "rounds", current: 0, total: 1000},
        };
        expect(describeSimulationProgress(job as never).phase).toBe("Preparing the game runtime");
        job.progress.stage = "finalizing / cleanup";
        expect(describeSimulationProgress(job as never).phase).toBe("Finalizing and cleanup");
    });
});

describe("simulation metric scope labels", () => {
    it("marks whole-round metrics when feature plays were observed", async () => {
        const {simulationHasFeatures, simulationScopeSuffix} = await import("../../../cli/studio-client/src/domain/interpret/Simulation.js");
        const base = {
            game: {id: "g", name: "G", version: "1"}, rounds: 1, requestedRounds: 1, seed: null,
            totalBet: 1, totalWin: 1, rtp: 1, hitFrequency: 1, maxWin: 1, durationMs: 1, spinsPerSecond: 1,
            workers: 1, warnings: [], recommendations: [],
        };
        expect(simulationHasFeatures(base)).toBe(false);
        expect(simulationScopeSuffix(base)).toBe("");
        const withFreeGames = {
            ...base,
            analytics: {features: {freeGames: {entries: 1}, holdAndWin: {entries: 0}}},
        } as never;
        expect(simulationHasFeatures(withFreeGames)).toBe(true);
        expect(simulationScopeSuffix(withFreeGames)).toBe(" — whole paid round, incl. features");
    });
});
