import {evaluateRandomBuildQualityGates} from "../../../cli/build/evaluateRandomBuildQualityGates.js";
import {SmokeSimulationOutcome} from "../../../cli/build/runSmokeSimulation.js";

type SuccessfulSmokeSimulationOutcome = Extract<SmokeSimulationOutcome, {ok: true}>;

const cleanSmoke: SuccessfulSmokeSimulationOutcome = {
    ok: true,
    rounds: 200,
    roundsRequested: 200,
    rtp: 0.96,
    hitFrequency: 0.3,
    maxWin: 250,
    averageBet: 5,
};

describe("evaluateRandomBuildQualityGates", () => {
    it("returns no warnings for a clean smoke simulation", () => {
        expect(evaluateRandomBuildQualityGates(cleanSmoke)).toEqual([]);
    });

    it("warns on feature termination when fewer rounds completed than were requested", () => {
        const warnings = evaluateRandomBuildQualityGates({...cleanSmoke, rounds: 120});

        expect(warnings).toEqual([
            "feature termination: only 120/200 smoke-simulation rounds completed -- a mechanic may be preventing the session from continuing to play.",
        ]);
    });

    it("does not warn on feature termination when every requested round completed", () => {
        const warnings = evaluateRandomBuildQualityGates({...cleanSmoke, rounds: cleanSmoke.roundsRequested});

        expect(warnings).toEqual([]);
    });

    it.each([NaN, Infinity, -Infinity, -1])("warns on max-win sanity when maxWin is %p", (maxWin) => {
        const warnings = evaluateRandomBuildQualityGates({...cleanSmoke, maxWin});

        expect(warnings).toEqual([
            `max-win sanity: observed max win (${maxWin}) is not a finite, non-negative amount.`,
        ]);
    });

    it("warns on max-win sanity when maxWin is far beyond the average-bet sanity multiplier", () => {
        const warnings = evaluateRandomBuildQualityGates({...cleanSmoke, averageBet: 5, maxWin: 5 * 200_000});

        expect(warnings).toEqual([
            "max-win sanity: observed max win is 200000x the average bet, beyond the 100000x sanity threshold -- verify the paytable/winModel math.",
        ]);
    });

    it("does not warn on max-win sanity right at the threshold", () => {
        const warnings = evaluateRandomBuildQualityGates({...cleanSmoke, averageBet: 5, maxWin: 5 * 100_000});

        expect(warnings).toEqual([]);
    });

    it("does not warn on max-win sanity when averageBet is 0 (nothing to divide by)", () => {
        const warnings = evaluateRandomBuildQualityGates({...cleanSmoke, averageBet: 0, maxWin: 1_000_000});

        expect(warnings).toEqual([]);
    });

    it("can report both warnings together", () => {
        const warnings = evaluateRandomBuildQualityGates({...cleanSmoke, rounds: 50, maxWin: NaN});

        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toContain("feature termination");
        expect(warnings[1]).toContain("max-win sanity");
    });
});
