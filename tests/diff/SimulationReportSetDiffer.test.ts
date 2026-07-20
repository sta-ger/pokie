import {SimulationReport, SimulationReportDiffing, SimulationReportSet, SimulationReportSetDiffer} from "pokie";

function buildReport(betMode: string, rtp: number): SimulationReport {
    return {
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        requestedRounds: 1000,
        rounds: 1000,
        seed: "demo",
        totalBet: 1000,
        totalWin: rtp * 1000,
        rtp,
        hitFrequency: 0.25,
        maxWin: 50,
        durationMs: 10,
        spinsPerSecond: 100,
        betMode,
    };
}

function buildSet(modes: Record<string, SimulationReport>, gameId = "crazy-fruits"): SimulationReportSet {
    return {
        game: {id: gameId, name: "Crazy Fruits", version: "0.1.0"},
        requestedRounds: 1000,
        seed: "demo",
        workers: 1,
        modes,
    };
}

describe("SimulationReportSetDiffer", () => {
    it("diffs every mode present on both sides by delegating to the injected SimulationReportDiffing, never reimplementing metric math itself", () => {
        const recordedCalls: Array<[SimulationReport, SimulationReport]> = [];
        const spyDiffer: SimulationReportDiffing = {
            diff: (left, right) => {
                recordedCalls.push([left, right]);
                return {left, right} as unknown as ReturnType<SimulationReportDiffing["diff"]>;
            },
        };
        const left = buildSet({base: buildReport("base", 0.94), ante: buildReport("ante", 0.965)});
        const right = buildSet({base: buildReport("base", 0.95), ante: buildReport("ante", 0.97)});
        const differ = new SimulationReportSetDiffer(spyDiffer);

        const setDiff = differ.diff(left, right);

        expect(recordedCalls).toHaveLength(2);
        expect(Object.keys(setDiff.perMode)).toEqual(["base", "ante"]);
    });

    it("uses a real SimulationReportDiffer by default (no differ needs to be supplied)", () => {
        const left = buildSet({base: buildReport("base", 0.9)});
        const right = buildSet({base: buildReport("base", 0.95)});
        const differ = new SimulationReportSetDiffer();

        const setDiff = differ.diff(left, right);

        expect(setDiff.perMode.base.rtp.left).toBe(0.9);
        expect(setDiff.perMode.base.rtp.right).toBe(0.95);
        expect(setDiff.perMode.base.rtp.delta).toBeCloseTo(0.05, 10);
    });

    it("lists a mode present only on the left under onlyInLeft, not diffed against anything", () => {
        const left = buildSet({base: buildReport("base", 0.9), "buy-10": buildReport("buy-10", 0.8)});
        const right = buildSet({base: buildReport("base", 0.9)});
        const differ = new SimulationReportSetDiffer();

        const setDiff = differ.diff(left, right);

        expect(setDiff.onlyInLeft).toEqual(["buy-10"]);
        expect(setDiff.onlyInRight).toEqual([]);
        expect(setDiff.perMode["buy-10"]).toBeUndefined();
    });

    it("lists a mode present only on the right under onlyInRight", () => {
        const left = buildSet({base: buildReport("base", 0.9)});
        const right = buildSet({base: buildReport("base", 0.9), "buy-20": buildReport("buy-20", 0.85)});
        const differ = new SimulationReportSetDiffer();

        const setDiff = differ.diff(left, right);

        expect(setDiff.onlyInRight).toEqual(["buy-20"]);
        expect(setDiff.onlyInLeft).toEqual([]);
    });

    it("reports game.changed based on id/name/version, same as SimulationReportDiffer", () => {
        const left = buildSet({base: buildReport("base", 0.9)}, "crazy-fruits");
        const right = buildSet({base: buildReport("base", 0.9)}, "crazy-fruits-v2");
        const differ = new SimulationReportSetDiffer();

        const setDiff = differ.diff(left, right);

        expect(setDiff.game.changed).toBe(true);
        expect(setDiff.game.left.id).toBe("crazy-fruits");
        expect(setDiff.game.right.id).toBe("crazy-fruits-v2");
    });

    it("never adds a blended/overall metric across modes -- only game, perMode, onlyInLeft, onlyInRight", () => {
        const left = buildSet({base: buildReport("base", 0.9), ante: buildReport("ante", 0.95)});
        const right = buildSet({base: buildReport("base", 0.91), ante: buildReport("ante", 0.96)});
        const differ = new SimulationReportSetDiffer();

        const setDiff = differ.diff(left, right);

        expect(Object.keys(setDiff).sort()).toEqual(["game", "onlyInLeft", "onlyInRight", "perMode"]);
    });
});
