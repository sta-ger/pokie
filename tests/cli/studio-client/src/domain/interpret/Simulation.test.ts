import {
    describeBreakdown,
    describeSimulationProgress,
    describeSimulationReport,
    isSimulationActive,
    isSimulationTerminal,
} from "../../../../../../cli/studio-client/src/domain/interpret/Simulation";
import type {SimulationReport, StudioSimulationJobView} from "../../../../../../cli/studio-client/src/api/types";

function createJob(overrides: Partial<StudioSimulationJobView> = {}): StudioSimulationJobView {
    return {
        id: "job-1",
        status: "running",
        rounds: 1000,
        workers: 1,
        startedAt: "2026-01-01T00:00:00.000Z",
        roundsCompleted: 250,
        durationMs: 500,
        ...overrides,
    };
}

describe("describeSimulationProgress", () => {
    it("computes a rounded percent from roundsCompleted/rounds", () => {
        const view = describeSimulationProgress(createJob({roundsCompleted: 250, rounds: 1000}));

        expect(view).toEqual({status: "running", roundsCompleted: 250, rounds: 1000, workers: 1, percent: 25, durationMs: 500});
    });

    it("carries through the workers count", () => {
        const view = describeSimulationProgress(createJob({workers: 4}));

        expect(view.workers).toBe(4);
    });

    it("caps percent at 100 even if roundsCompleted momentarily exceeds rounds", () => {
        const view = describeSimulationProgress(createJob({roundsCompleted: 1000, rounds: 999}));

        expect(view.percent).toBe(100);
    });

    it("is 0% when rounds is 0 (avoids dividing by zero)", () => {
        const view = describeSimulationProgress(createJob({rounds: 0, roundsCompleted: 0}));

        expect(view.percent).toBe(0);
    });

    it("carries through the job's own error message when failed", () => {
        const view = describeSimulationProgress(createJob({status: "failed", error: "Cannot find module './dist/index.js'"}));

        expect(view.error).toBe("Cannot find module './dist/index.js'");
    });
});

describe("isSimulationActive / isSimulationTerminal", () => {
    it("treats queued/running as active, not terminal", () => {
        expect(isSimulationActive(createJob({status: "queued"}))).toBe(true);
        expect(isSimulationActive(createJob({status: "running"}))).toBe(true);
        expect(isSimulationTerminal(createJob({status: "queued"}))).toBe(false);
        expect(isSimulationTerminal(createJob({status: "running"}))).toBe(false);
    });

    it("treats completed/failed/cancelled as terminal, not active", () => {
        for (const status of ["completed", "failed", "cancelled"] as const) {
            expect(isSimulationTerminal(createJob({status}))).toBe(true);
            expect(isSimulationActive(createJob({status}))).toBe(false);
        }
    });
});

function createReport(overrides: Partial<SimulationReport> = {}): SimulationReport {
    return {
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        requestedRounds: 1000,
        rounds: 1000,
        seed: "demo",
        totalBet: 1000,
        totalWin: 950,
        rtp: 0.95,
        hitFrequency: 0.25,
        maxWin: 120,
        durationMs: 500,
        spinsPerSecond: 2000,
        ...overrides,
    };
}

describe("describeBreakdown", () => {
    it("returns undefined when the report has no breakdown at all", () => {
        expect(describeBreakdown(createReport())).toBeUndefined();
    });

    it("flattens the breakdown components into rows, keeping the category as a field", () => {
        const report = createReport({
            breakdown: {
                components: {
                    base: {rounds: 900, totalBet: 900, totalWin: 800, rtp: 0.888, hitFrequency: 0.2, maxWin: 100, contribution: 0.8},
                    freeGames: {rounds: 100, totalBet: 0, totalWin: 150, rtp: 0, hitFrequency: 0.5, maxWin: 120, contribution: 0.15},
                },
            },
        });

        const rows = describeBreakdown(report);

        expect(rows).toEqual([
            {category: "base", rounds: 900, totalBet: 900, totalWin: 800, rtp: 0.888, hitFrequency: 0.2, maxWin: 100, contribution: 0.8},
            {category: "freeGames", rounds: 100, totalBet: 0, totalWin: 150, rtp: 0, hitFrequency: 0.5, maxWin: 120, contribution: 0.15},
        ]);
    });
});

describe("describeSimulationReport", () => {
    it("maps the core report fields and defaults warnings to an empty list", () => {
        const view = describeSimulationReport(createReport());

        expect(view).toMatchObject({
            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            rounds: 1000,
            requestedRounds: 1000,
            seed: "demo",
            totalBet: 1000,
            totalWin: 950,
            rtp: 0.95,
            hitFrequency: 0.25,
            maxWin: 120,
            durationMs: 500,
            spinsPerSecond: 2000,
            warnings: [],
            recommendations: [],
        });
        expect(view.breakdown).toBeUndefined();
        expect(view.volatility).toBeUndefined();
        expect(view.payoutHistogram).toBeUndefined();
        expect(view.reproducibilityCommand).toBeUndefined();
    });

    it("carries through recommendations when present", () => {
        const report = createReport({recommendations: ["Increase --rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates."]});

        const view = describeSimulationReport(report);

        expect(view.recommendations).toEqual(["Increase --rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates."]);
    });

    it("carries through the payout histogram from statistics when given", () => {
        const view = describeSimulationReport(createReport(), {
            volatility: 12.5,
            payoutStandardDeviation: 12.5,
            returnStandardDeviation: 0.5,
            averagePayoutConfidenceInterval95: {low: 0.9, high: 1.1},
            rtpConfidenceInterval95: {low: 0.93, high: 0.97},
            payoutHistogram: {"0": 750, "1-5": 200, "5+": 50},
        });

        expect(view.payoutHistogram).toEqual({"0": 750, "1-5": 200, "5+": 50});
    });

    it("carries through warnings and the reproducibility command when present", () => {
        const report = createReport({
            warnings: ["No seed was provided — this run is not reproducible."],
            reproducibility: {
                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                seed: "demo",
                requestedRounds: 1000,
                actualRounds: 1000,
                command: "pokie sim <packageRoot> --rounds 1000 --seed demo",
            },
        });

        const view = describeSimulationReport(report);

        expect(view.warnings).toEqual(["No seed was provided — this run is not reproducible."]);
        expect(view.reproducibilityCommand).toBe("pokie sim <packageRoot> --rounds 1000 --seed demo");
    });

    it("merges in the extra Studio statistics (volatility/confidence intervals) when given", () => {
        const view = describeSimulationReport(createReport(), {
            volatility: 12.5,
            payoutStandardDeviation: 12.5,
            returnStandardDeviation: 0.5,
            averagePayoutConfidenceInterval95: {low: 0.9, high: 1.1},
            rtpConfidenceInterval95: {low: 0.93, high: 0.97},
        });

        expect(view.volatility).toBe(12.5);
        expect(view.rtpConfidenceInterval95).toEqual({low: 0.93, high: 0.97});
    });

    it("leaves statistics fields undefined when not given (old/reconstructed job views)", () => {
        const view = describeSimulationReport(createReport());

        expect(view.volatility).toBeUndefined();
        expect(view.payoutStandardDeviation).toBeUndefined();
        expect(view.rtpConfidenceInterval95).toBeUndefined();
        expect(view.averagePayoutConfidenceInterval95).toBeUndefined();
    });

    it("includes the breakdown rows when the report has one", () => {
        const report = createReport({
            breakdown: {
                components: {
                    base: {rounds: 900, totalBet: 900, totalWin: 800, rtp: 0.888, hitFrequency: 0.2, maxWin: 100, contribution: 0.8},
                },
            },
        });

        const view = describeSimulationReport(report);

        expect(view.breakdown).toEqual([
            {category: "base", rounds: 900, totalBet: 900, totalWin: 800, rtp: 0.888, hitFrequency: 0.2, maxWin: 100, contribution: 0.8},
        ]);
    });
});
