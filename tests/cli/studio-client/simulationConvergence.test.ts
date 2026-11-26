import {buildSimulationConvergence, getSimulationPrecisionError, toSimulationConvergenceRequest} from "../../../cli/studio-client/src/domain/simulationConvergence.js";

describe("simulation target precision", () => {
    it("turns a ±1 pp target into an adaptive stop policy with the play budget as a ceiling", () => {
        expect(buildSimulationConvergence(200_000, 1)).toEqual({
            minRounds: 5_000,
            rtpTolerance: 0.01,
            checkIntervalRounds: 10_000,
            stableChecks: 3,
        });
    });

    it("scales the check cadence for a small quick-look budget", () => {
        expect(buildSimulationConvergence(10_000, 0.5)).toEqual({
            minRounds: 5_000,
            rtpTolerance: 0.005,
            checkIntervalRounds: 500,
            stableChecks: 3,
        });
    });

    it("returns no adaptive policy when the target is empty or invalid", () => {
        expect(buildSimulationConvergence(10_000, undefined)).toBeUndefined();
        expect(buildSimulationConvergence(10_000, 0)).toBeUndefined();
        expect(buildSimulationConvergence(10_000, 21)).toBeUndefined();
        expect(buildSimulationConvergence(0, 1)).toBeUndefined();
    });

    it("validates the browser input without rejecting an empty optional target", () => {
        expect(getSimulationPrecisionError("")).toBeNull();
        expect(getSimulationPrecisionError(undefined)).toBeNull();
        expect(getSimulationPrecisionError(0.5)).toBeNull();
        expect(getSimulationPrecisionError("1")).toBeNull();
        expect(getSimulationPrecisionError(0)).toContain("between 0.01 and 20 pp");
        expect(getSimulationPrecisionError(25)).toContain("between 0.01 and 20 pp");
        expect(getSimulationPrecisionError("abc")).toContain("between 0.01 and 20 pp");
    });
});

describe("captured simulation convergence", () => {
    it("drops report-only fields before a captured policy is sent again", () => {
        const captured = {
            minRounds: 5_000,
            rtpTolerance: 0.001,
            checkIntervalRounds: 1_000,
            stableChecks: 3,
            checksPerformed: 20,
            consecutiveStableChecks: 0,
            achievedRtpHalfWidth: 0.04637057000112865,
        };
        expect(toSimulationConvergenceRequest(captured)).toEqual({
            minRounds: 5_000,
            rtpTolerance: 0.001,
            checkIntervalRounds: 1_000,
            stableChecks: 3,
        });
    });

    it("omits an absent stableChecks and refuses malformed captured values", () => {
        expect(toSimulationConvergenceRequest({minRounds: 1, rtpTolerance: 0.01, checkIntervalRounds: 1})).toEqual({
            minRounds: 1,
            rtpTolerance: 0.01,
            checkIntervalRounds: 1,
        });
        expect(toSimulationConvergenceRequest(undefined)).toBeUndefined();
        expect(toSimulationConvergenceRequest({minRounds: -1, rtpTolerance: 0.01, checkIntervalRounds: 1})).toBeUndefined();
        expect(toSimulationConvergenceRequest({minRounds: 1, rtpTolerance: 0, checkIntervalRounds: 1})).toBeUndefined();
        expect(toSimulationConvergenceRequest({minRounds: 1, rtpTolerance: 0.01, checkIntervalRounds: 0})).toBeUndefined();
        expect(toSimulationConvergenceRequest({minRounds: 1, rtpTolerance: 0.01, checkIntervalRounds: 1, stableChecks: 0})).toBeUndefined();
    });
});
