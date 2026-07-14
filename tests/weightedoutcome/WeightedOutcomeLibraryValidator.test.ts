import {
    WeightedOutcomeLibrary,
    WeightedOutcomeLibraryValidator,
    buildWeightedOutcomeLibrary,
} from "pokie";
import {artifactWithTotalWin} from "./WeightedOutcomeTestFixtures.js";

function validLibrary(): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({
        libraryId: "lib-1",
        outcomes: [
            {id: "no-win", weight: 70, artifact: artifactWithTotalWin("r1", 0)},
            {id: "small-win", weight: 25, artifact: artifactWithTotalWin("r2", 2)},
            {id: "jackpot", weight: 5, artifact: artifactWithTotalWin("r3", 100)},
        ],
    });
}

function codesOf(library: WeightedOutcomeLibrary<string>): string[] {
    return new WeightedOutcomeLibraryValidator().validate(library).map((issue) => issue.code);
}

describe("WeightedOutcomeLibraryValidator", () => {
    it("reports no issues for a validly-built library", () => {
        expect(new WeightedOutcomeLibraryValidator().validate(validLibrary())).toEqual([]);
    });

    it("flags an empty libraryId", () => {
        expect(codesOf({...validLibrary(), libraryId: "  "})).toContain("weighted-outcome-library-id-invalid");
    });

    it.each([0, -1, 1.5, 2])("flags an invalid/unsupported schemaVersion %p", (schemaVersion) => {
        const codes = codesOf({...validLibrary(), schemaVersion});
        expect(
            codes.includes("weighted-outcome-library-schema-version-invalid") ||
                codes.includes("weighted-outcome-library-schema-version-unsupported"),
        ).toBe(true);
    });

    it("flags an empty outcomes array", () => {
        expect(codesOf({...validLibrary(), outcomes: []})).toContain("weighted-outcome-library-outcomes-empty");
    });

    it("flags a non-array outcomes field without throwing", () => {
        const library = {...validLibrary(), outcomes: "not-an-array"} as unknown as WeightedOutcomeLibrary<string>;
        expect(() => new WeightedOutcomeLibraryValidator().validate(library)).not.toThrow();
        expect(codesOf(library)).toContain("weighted-outcome-library-outcomes-invalid");
    });

    it("flags an outcome with an empty id", () => {
        const library = validLibrary();
        const outcomes = [{...library.outcomes[0], id: ""}, ...library.outcomes.slice(1)];
        expect(codesOf({...library, outcomes})).toContain("weighted-outcome-id-invalid");
    });

    it("flags a duplicate outcome id", () => {
        const library = validLibrary();
        const outcomes = [{...library.outcomes[0], id: library.outcomes[1].id}, ...library.outcomes.slice(1)];
        expect(codesOf({...library, outcomes})).toContain("weighted-outcome-library-duplicate-id");
    });

    it.each([-1, NaN, Infinity])("flags an invalid outcome weight %p", (weight) => {
        const library = validLibrary();
        const outcomes = [{...library.outcomes[0], weight}, ...library.outcomes.slice(1)];
        expect(codesOf({...library, outcomes})).toContain("weighted-outcome-weight-invalid");
    });

    it("flags a total weight that sums to zero", () => {
        const library = validLibrary();
        const outcomes = library.outcomes.map((outcome) => ({...outcome, weight: 0}));
        expect(codesOf({...library, outcomes})).toContain("weighted-outcome-library-total-weight-invalid");
    });

    it.each([-1, NaN, Infinity])("flags an invalid artifact.payoutMultiplier %p", (payoutMultiplier) => {
        const library = validLibrary();
        const outcomes = [
            {...library.outcomes[0], artifact: {...library.outcomes[0].artifact, payoutMultiplier}},
            ...library.outcomes.slice(1),
        ];
        expect(codesOf({...library, outcomes})).toContain("weighted-outcome-payout-multiplier-invalid");
    });

    it("delegates artifact validity to RoundArtifactValidator (e.g. a mismatched screen)", () => {
        const library = validLibrary();
        const badArtifact = {...library.outcomes[0].artifact, screen: [["Z", "Z", "Z"]]};
        const outcomes = [{...library.outcomes[0], artifact: badArtifact}, ...library.outcomes.slice(1)];

        expect(codesOf({...library, outcomes})).toContain("round-artifact-screen-mismatch");
    });

    it("prefixes delegated artifact issue messages with the outcome's position", () => {
        const library = validLibrary();
        const badArtifact = {...library.outcomes[0].artifact, screen: [["Z", "Z", "Z"]]};
        const outcomes = [{...library.outcomes[0], artifact: badArtifact}, ...library.outcomes.slice(1)];

        const issues = new WeightedOutcomeLibraryValidator().validate({...library, outcomes});
        const screenIssue = issues.find((issue) => issue.code === "round-artifact-screen-mismatch");

        expect(screenIssue?.message).toMatch(/^outcome at position 0:/);
    });

    it("flags non-JSON-safe content (a circular debug reference) as weighted-outcome-library-not-json-safe", () => {
        const library = validLibrary();
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        const outcomes = [
            {...library.outcomes[0], artifact: {...library.outcomes[0].artifact, debug: cyclic}},
            ...library.outcomes.slice(1),
        ];
        const invalid = {...library, outcomes} as unknown as WeightedOutcomeLibrary<string>;

        expect(codesOf(invalid)).toContain("weighted-outcome-library-not-json-safe");
    });

    it("never throws, even for a completely malformed library", () => {
        const malformed = {completely: "wrong"} as unknown as WeightedOutcomeLibrary<string>;
        expect(() => new WeightedOutcomeLibraryValidator().validate(malformed)).not.toThrow();
        expect(new WeightedOutcomeLibraryValidator().validate(malformed).length).toBeGreaterThan(0);
    });

    it("never throws for null/primitive garbage passed in place of a library", () => {
        expect(() => new WeightedOutcomeLibraryValidator().validate(null as unknown as WeightedOutcomeLibrary<string>)).not.toThrow();
        expect(() => new WeightedOutcomeLibraryValidator().validate(42 as unknown as WeightedOutcomeLibrary<string>)).not.toThrow();
    });

    it("never throws for a cyclic library passed directly", () => {
        const cyclic: Record<string, unknown> = {libraryId: "lib-1"};
        cyclic.self = cyclic;
        expect(() =>
            new WeightedOutcomeLibraryValidator().validate(cyclic as unknown as WeightedOutcomeLibrary<string>),
        ).not.toThrow();
    });

    it("accepts an injected artifact validator instead of the default RoundArtifactValidator", () => {
        const alwaysFails = {validate: () => [{code: "custom-issue", severity: "error" as const, message: "nope"}]};
        const library = validLibrary();

        const issues = new WeightedOutcomeLibraryValidator(alwaysFails).validate(library);

        expect(issues.filter((issue) => issue.code === "custom-issue")).toHaveLength(library.outcomes.length);
    });
});
