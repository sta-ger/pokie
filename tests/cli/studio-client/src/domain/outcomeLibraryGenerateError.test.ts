import {describeOutcomeLibraryGenerationErrorExplanation} from "../../../../../cli/studio-client/src/domain/outcomeLibraryGenerateError";

describe("describeOutcomeLibraryGenerationErrorExplanation", () => {
    it("gives a specific recovery action for an exact-generation limit without backend diagnostics", () => {
        const explanation = describeOutcomeLibraryGenerationErrorExplanation("weighted-outcome-library-generation-space-exceeded");

        expect(explanation).toContain('Raise "Max outcome space size" above');
        expect(explanation).toContain("set a sample size");
        expect(explanation).not.toMatch(/ENOTDIR|Error:|at .*\(|server log|stack trace/i);
    });

    it("uses an actionable generic recovery without exposing unknown backend text", () => {
        const explanation = describeOutcomeLibraryGenerationErrorExplanation("backend-opaque-failure: ENOTDIR /srv/private");

        expect(explanation).toBe("Generating this outcome library failed. Check the settings above and try again. If it continues, reopen the project and retry.");
        expect(explanation).not.toMatch(/ENOTDIR|\/srv\/private|server log|stack trace/i);
    });
});
