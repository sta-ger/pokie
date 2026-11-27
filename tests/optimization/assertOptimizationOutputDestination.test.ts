import {assertOptimizationOutputDestination} from "../../src/optimization/internal/assertOptimizationOutputDestination.js";

describe("assertOptimizationOutputDestination", () => {
    it("requires a recognized suffix for file-shaped candidates", () => {
        expect(() => assertOptimizationOutputDestination("blueprint", "/tmp/optimized", false))
            .toThrow('--out for a blueprint candidate must be a file ending in ".json"');
    });

    it("accepts the suffix the project resolver recognizes", () => {
        expect(() => assertOptimizationOutputDestination("blueprint", "/tmp/optimized.blueprint.json", false)).not.toThrow();
        expect(() => assertOptimizationOutputDestination("parWorkbook", "/tmp/optimized.xlsx", false)).not.toThrow();
        expect(() => assertOptimizationOutputDestination("wasm", "/tmp/optimized.wasm", false)).not.toThrow();
    });

    it("leaves directory-shaped candidates alone", () => {
        expect(() => assertOptimizationOutputDestination("tsPackage", "/tmp/optimized", true)).not.toThrow();
    });
});
