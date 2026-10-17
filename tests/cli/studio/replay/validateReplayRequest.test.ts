import {MAX_STUDIO_REPLAY_ROUND} from "../../../../cli/studio/replay/StudioReplayLimits.js";
import {bindReplayToSimulationReport, validateReplayRequest} from "../../../../cli/studio/replay/validateReplayRequest.js";
import {SimulationReportBuilder} from "../../../../src/reporting/SimulationReportBuilder.js";
import {SimulationAccumulator} from "../../../../src/simulation/SimulationAccumulator.js";

describe("bindReplayToSimulationReport", () => {
    const report = new SimulationReportBuilder().build({manifest: {id: "binding", name: "Binding", version: "1.0.0"}, requestedRounds: 1,
        seed: "0", workers: 1, durationMs: 1, statistics: new SimulationAccumulator().getStatistics(), betMode: "base", configHash: "retained-config"});
    const retained = {...report, rounds: 1};

    it.each([
        {round: 2, seed: "0"}, {round: 1}, {round: 1, seed: "different"}, {round: 1, seed: "0", modeName: "different"},
        {round: 1, seed: "0", unit: "logical-round"}, {round: 1, seed: "0", entryCommands: []},
        {round: 1, seed: "0", entryCommands: [{kind: "spin", bet: 7.5}]},
    ])("rejects a non-sample %p without changing its valid standalone shape", input => {
        const request = validateReplayRequest(input);
        expect(() => bindReplayToSimulationReport(request, retained)).toThrow("Simulation replay requires the retained seed, selected mode and step range from a single-worker run.");
        expect(validateReplayRequest(input)).toEqual(request);
        for (const unit of [undefined, "step"] as const) {
            expect(bindReplayToSimulationReport({round: 1, seed: "0", unit}, retained)).toMatchObject({round: 1, seed: "0", modeName: "base", expectedConfigHash: "retained-config"});
        }
    });

    it("selects own concrete all-mode reports and normalizes single-mode omission", () => {
        const all = {game: report.game, requestedRounds: 1, seed: "0", workers: 1, modes: {base: retained}};
        for (const modeName of [undefined, "all", "unknown", "toString", "__proto__"]) {
            expect(() => bindReplayToSimulationReport({round: 1, seed: "0", modeName}, all)).toThrow("Select a concrete mode from the all-mode simulation to replay.");
        }
        expect(bindReplayToSimulationReport({round: 1, seed: "0", modeName: "base"}, all)).toEqual(bindReplayToSimulationReport({round: 1, seed: "0"}, retained));
        expect(() => bindReplayToSimulationReport({round: 1, seed: "0", modeName: "base"}, {...all, workers: 2})).toThrow(/single-worker/);
    });

    it("uses accepted subrounds rather than requested or logical rounds and preserves legacy omissions", () => {
        const sampled = {...retained, requestedRounds: 99, sampling: {unit: "completed-logical-round" as const, acceptedSubrounds: 3, excludedSubrounds: 2, trajectories: "independent-session-per-worker" as const}};
        expect(bindReplayToSimulationReport({round: 3, seed: "0"}, sampled)).toMatchObject({round: 3, modeName: "base"});
        expect(() => bindReplayToSimulationReport({round: 4, seed: "0"}, sampled)).toThrow(/step range/);
        for (const changed of [{...retained, workers: 2}, {...retained, seed: null}, {...retained, rounds: NaN}]) {
            expect(() => bindReplayToSimulationReport({round: 1, seed: "0"}, changed)).toThrow(/single-worker/);
        }
        expect(bindReplayToSimulationReport({round: 1, seed: "0"}, {...retained, workers: undefined, reproducibility: undefined, betMode: undefined})).toEqual({round: 1, seed: "0", modeName: undefined, expectedConfigHash: undefined});
    });
});

describe("validateReplayRequest", () => {
    it("accepts a positive integer round with no seed", () => {
        expect(validateReplayRequest({round: 42})).toEqual({round: 42});
    });

    it("accepts a positive integer round with a non-empty seed", () => {
        expect(validateReplayRequest({round: 42, seed: "demo"})).toEqual({round: 42, seed: "demo"});
    });

    it.each(["0", " exact seed "])("preserves the exact supplied seed %p", seed => {
        expect(validateReplayRequest({round: 1, seed})).toEqual({round: 1, seed});
    });

    it("requires the recorded seed and mode for exact outcome-library replay without changing package replay", () => {
        expect(() => validateReplayRequest({round: 42}, {requireOutcomeSourceProvenance: true})).toThrow(/without a seed/i);
        expect(() => validateReplayRequest({round: 42, seed: "demo"}, {requireOutcomeSourceProvenance: true})).toThrow(/without its recorded mode/i);
        expect(validateReplayRequest({round: 42, seed: "demo", modeName: "base"}, {requireOutcomeSourceProvenance: true})).toEqual({
            round: 42,
            seed: "demo",
            modeName: "base",
        });
    });

    it("rejects a missing round", () => {
        expect(() => validateReplayRequest({})).toThrow('"round" must be a positive integer.');
    });

    it("rejects a non-numeric round", () => {
        expect(() => validateReplayRequest({round: "42"})).toThrow('"round" must be a positive integer.');
    });

    it("rejects a non-integer round", () => {
        expect(() => validateReplayRequest({round: 4.2})).toThrow('"round" must be a positive integer.');
    });

    it("rejects a round less than 1", () => {
        expect(() => validateReplayRequest({round: 0})).toThrow('"round" must be a positive integer.');
        expect(() => validateReplayRequest({round: -5})).toThrow('"round" must be a positive integer.');
    });

    it("rejects a round above the safe Studio limit", () => {
        expect(() => validateReplayRequest({round: MAX_STUDIO_REPLAY_ROUND + 1})).toThrow(
            `"round" must not exceed ${MAX_STUDIO_REPLAY_ROUND}.`,
        );
    });

    it("accepts a round exactly at the safe Studio limit", () => {
        expect(validateReplayRequest({round: MAX_STUDIO_REPLAY_ROUND})).toEqual({round: MAX_STUDIO_REPLAY_ROUND});
    });

    it("rejects an empty seed", () => {
        expect(() => validateReplayRequest({round: 1, seed: ""})).toThrow('"seed" must be a non-empty string when given.');
    });

    it("rejects a whitespace-only seed", () => {
        expect(() => validateReplayRequest({round: 1, seed: "   "})).toThrow('"seed" must be a non-empty string when given.');
    });

    it.each([42, null, {}, []])("rejects a non-string seed %p without coercion", seed => {
        expect(() => validateReplayRequest({round: 1, seed})).toThrow('"seed" must be a non-empty string when given.');
    });
});
