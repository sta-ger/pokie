import {describeStakeEngineOutcomeSource} from "../../../src/stakeengine/standalone/describeStakeEngineOutcomeSource.js";

describe("describeStakeEngineOutcomeSource", () => {
    it("reports a non-streaming, stakeEngine canonical outcome source with explicit limitations", () => {
        const descriptor = describeStakeEngineOutcomeSource();

        expect(descriptor.kind).toBe("stakeEngine");
        expect(descriptor.streaming).toBe(false);
        expect(descriptor.limitations.length).toBeGreaterThan(0);
        expect(descriptor.limitations.every((limitation) => typeof limitation === "string" && limitation.length > 0)).toBe(true);
    });
});
