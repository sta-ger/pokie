import {describeSimulationPrecision, describeSimulationStopReason} from "../../../src/reporting/describeSimulationDiagnostics.js";

describe("simulation report labels", () => {
    it("turns precision enums into readable verdicts", () => {
        expect(describeSimulationPrecision("notRequested")).toBe("no precision target requested");
        expect(describeSimulationPrecision("insufficientPrecision")).toBe("requested precision not reached");
        expect(describeSimulationPrecision("empiricalPrecision")).toBe("empirical precision target reached");
    });

    it("turns stop-reason enums into readable outcomes", () => {
        expect(describeSimulationStopReason("maxRounds")).toBe("requested rounds completed");
        expect(describeSimulationStopReason("sessionStopped")).toBe("session stopped early");
        expect(describeSimulationStopReason("converged")).toBe("converged");
    });
});
