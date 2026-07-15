import {PreGeneratedOutcomeSelection, PreGeneratedOutcomeSelectionValidator, buildWeightedOutcomeLibrary, computeWeightedOutcomeLibraryHash} from "pokie";
import {artifactWith} from "../weightedoutcome/WeightedOutcomeTestFixtures.js";

function buildValidSelection(): PreGeneratedOutcomeSelection<string> {
    const library = buildWeightedOutcomeLibrary({
        libraryId: "selection-validator-test",
        outcomes: [
            {id: "a", weight: 25, artifact: artifactWith({roundId: "a", totalWin: 3, stake: 1})},
            {id: "b", weight: 75, artifact: artifactWith({roundId: "b", totalWin: 0, stake: 1})},
        ],
    });
    return {
        libraryId: library.libraryId,
        libraryHash: computeWeightedOutcomeLibraryHash(library),
        totalWeight: 100,
        outcome: library.outcomes[0],
    };
}

describe("PreGeneratedOutcomeSelectionValidator", () => {
    const validator = new PreGeneratedOutcomeSelectionValidator<string>();

    it("reports no issues for a validly drawn selection", () => {
        expect(validator.validate(buildValidSelection())).toEqual([]);
    });

    it("reports pre-generated-outcome-selection-library-id-invalid for an empty libraryId", () => {
        const selection = {...buildValidSelection(), libraryId: ""};
        expect(validator.validate(selection)).toContainEqual(expect.objectContaining({code: "pre-generated-outcome-selection-library-id-invalid"}));
    });

    it("reports pre-generated-outcome-selection-library-hash-invalid for a malformed libraryHash", () => {
        const selection = {...buildValidSelection(), libraryHash: "not-a-sha256-hash"};
        expect(validator.validate(selection)).toContainEqual(expect.objectContaining({code: "pre-generated-outcome-selection-library-hash-invalid"}));
    });

    it("reports pre-generated-outcome-selection-outcome-id-invalid for an empty outcome.id", () => {
        const valid = buildValidSelection();
        const selection = {...valid, outcome: {...valid.outcome, id: ""}};
        expect(validator.validate(selection)).toContainEqual(expect.objectContaining({code: "pre-generated-outcome-selection-outcome-id-invalid"}));
    });

    it("reports pre-generated-outcome-selection-weight-invalid for a fractional outcome.weight", () => {
        const valid = buildValidSelection();
        const selection = {...valid, outcome: {...valid.outcome, weight: 0.5}};
        expect(validator.validate(selection)).toContainEqual(expect.objectContaining({code: "pre-generated-outcome-selection-weight-invalid"}));
    });

    it("reports pre-generated-outcome-selection-total-weight-invalid for a fractional totalWeight", () => {
        const selection = {...buildValidSelection(), totalWeight: 100.5};
        expect(validator.validate(selection)).toContainEqual(expect.objectContaining({code: "pre-generated-outcome-selection-total-weight-invalid"}));
    });

    it("reports pre-generated-outcome-selection-weight-exceeds-total when outcome.weight exceeds totalWeight", () => {
        const valid = buildValidSelection();
        const selection = {...valid, outcome: {...valid.outcome, weight: 200}};
        expect(validator.validate(selection)).toContainEqual(expect.objectContaining({code: "pre-generated-outcome-selection-weight-exceeds-total"}));
    });

    it("reports pre-generated-outcome-selection-artifact-invalid for a non-object artifact", () => {
        const valid = buildValidSelection();
        const selection = {...valid, outcome: {...valid.outcome, artifact: null as never}};
        expect(validator.validate(selection)).toContainEqual(expect.objectContaining({code: "pre-generated-outcome-selection-artifact-invalid"}));
    });

    it("surfaces RoundArtifactValidator's own issues for a structurally invalid artifact, never a second definition of valid", () => {
        const valid = buildValidSelection();
        const selection = {...valid, outcome: {...valid.outcome, artifact: {...valid.outcome.artifact, stake: -1}}};
        const issues = validator.validate(selection);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.every((issue) => issue.code !== "pre-generated-outcome-selection-artifact-invalid")).toBe(true);
    });

    it("never throws for a wildly malformed selection, reporting pre-generated-outcome-selection-malformed instead", () => {
        const issues = validator.validate(null as unknown as PreGeneratedOutcomeSelection<string>);
        expect(issues).toContainEqual(expect.objectContaining({code: "pre-generated-outcome-selection-malformed"}));
    });
});
