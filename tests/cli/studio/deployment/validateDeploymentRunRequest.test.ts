import {DeploymentRunRequestInput, validateDeploymentRunRequest} from "../../../../cli/studio/deployment/validateDeploymentRunRequest.js";

function validInput(overrides: DeploymentRunRequestInput = {}): DeploymentRunRequestInput {
    return {targetId: "local-json-example", modes: [{modeName: "base", libraryPath: "base.json"}], ...overrides};
}

describe("validateDeploymentRunRequest", () => {
    it("accepts a well-formed request and defaults publish to false", () => {
        const validated = validateDeploymentRunRequest(validInput());

        expect(validated).toEqual({targetId: "local-json-example", modes: [{modeName: "base", libraryPath: "base.json"}], publish: false});
    });

    it("accepts an explicit publish value", () => {
        const validated = validateDeploymentRunRequest(validInput({publish: true}));

        expect(validated.publish).toBe(true);
    });

    it("accepts multiple modes", () => {
        const validated = validateDeploymentRunRequest(
            validInput({modes: [{modeName: "base", libraryPath: "base.json"}, {modeName: "bonus", libraryPath: "bonus.json"}]}),
        );

        expect(validated.modes).toHaveLength(2);
    });

    it("throws for a missing targetId", () => {
        expect(() => validateDeploymentRunRequest(validInput({targetId: undefined}))).toThrow('"targetId" must be a non-empty string.');
    });

    it("throws for an empty targetId", () => {
        expect(() => validateDeploymentRunRequest(validInput({targetId: "   "}))).toThrow('"targetId" must be a non-empty string.');
    });

    it("throws for a non-string targetId", () => {
        expect(() => validateDeploymentRunRequest(validInput({targetId: 42}))).toThrow('"targetId" must be a non-empty string.');
    });

    it("throws when modes is missing", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: undefined}))).toThrow('"modes" must be a non-empty array.');
    });

    it("throws when modes is an empty array", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: []}))).toThrow('"modes" must be a non-empty array.');
    });

    it("throws when modes is not an array", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: "not-an-array"}))).toThrow('"modes" must be a non-empty array.');
    });

    it("throws when a mode entry has a missing modeName", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: [{libraryPath: "base.json"}]}))).toThrow("modes[0].modeName must be a non-empty string.");
    });

    it("throws when a mode entry has an empty modeName", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: [{modeName: "  ", libraryPath: "base.json"}]}))).toThrow(
            "modes[0].modeName must be a non-empty string.",
        );
    });

    it("throws when a mode entry has a missing libraryPath", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: [{modeName: "base"}]}))).toThrow("modes[0].libraryPath must be a non-empty string.");
    });

    it("reports the correct index for a malformed mode past the first", () => {
        expect(() =>
            validateDeploymentRunRequest(validInput({modes: [{modeName: "base", libraryPath: "base.json"}, {modeName: "", libraryPath: "bonus.json"}]})),
        ).toThrow("modes[1].modeName must be a non-empty string.");
    });

    it("throws for a non-boolean publish", () => {
        expect(() => validateDeploymentRunRequest(validInput({publish: "yes"}))).toThrow('"publish" must be a boolean when given.');
    });
});
