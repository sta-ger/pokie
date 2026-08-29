import {
    validateOutcomeLibraryGenerateEstimateRequest,
} from "../../../cli/studio/outcomeLibrary/validateOutcomeLibraryGenerateEstimateRequest.js";
import {
    validateOutcomeLibraryGenerateRequest,
} from "../../../cli/studio/outcomeLibrary/validateOutcomeLibraryGenerateRequest.js";

// These are the request boundaries used by StudioServer's two generation routes.
// Keep them together so the estimate route cannot accept a strategy which the
// execution route later reinterprets.
describe("Outcome Library generation route requests", () => {
    it("normalizes the same sampled contract for preflight and execution", () => {
        const input = {
            mode: "bonus", stake: 2, configHash: "config-1", libraryId: "route-library", outDir: "custom-library",
            generation: "sampled", sample: {sampleSize: "17", seed: "route-seed"}, maxOutcomeSpaceSize: "20",
        };

        expect(validateOutcomeLibraryGenerateEstimateRequest(input)).toMatchObject({
            mode: "bonus", stake: 2, configHash: "config-1", libraryId: "route-library", outDir: "custom-library",
            generation: "sampled", sample: {sampleSize: BigInt(17), seed: "route-seed"}, maxOutcomeSpaceSize: BigInt(20),
        });
        expect(validateOutcomeLibraryGenerateRequest({...input, preflightToken: "bound-token"})).toMatchObject({
            mode: "bonus", stake: 2, configHash: "config-1", libraryId: "route-library", outDir: "custom-library", preflightToken: "bound-token",
            generation: "sampled", sample: {sampleSize: BigInt(17), seed: "route-seed"}, maxOutcomeSpaceSize: BigInt(20),
        });
    });

    it("rejects a sampled strategy without its deterministic coverage input on both routes", () => {
        expect(() => validateOutcomeLibraryGenerateEstimateRequest({generation: "sampled"})).toThrow(/requires a "sample"/);
        expect(() => validateOutcomeLibraryGenerateRequest({generation: "sampled"})).toThrow(/requires a "sample"/);
    });
});
