import {DeploymentRunRequestInput, validateDeploymentRunRequest} from "../../../../cli/studio/deployment/validateDeploymentRunRequest.js";

function validInput(overrides: DeploymentRunRequestInput = {}): DeploymentRunRequestInput {
    return {targetId: "local-json-example", modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}], ...overrides};
}

describe("validateDeploymentRunRequest", () => {
    it("accepts a well-formed request and defaults publish to false", () => {
        const validated = validateDeploymentRunRequest(validInput());

        expect(validated).toEqual({
            targetId: "local-json-example",
            modes: [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}}],
            publish: false,
        });
    });

    it("accepts an explicit publish value", () => {
        const validated = validateDeploymentRunRequest(validInput({publish: true}));

        expect(validated.publish).toBe(true);
    });

    it("accepts multiple modes", () => {
        const validated = validateDeploymentRunRequest(
            validInput({
                modes: [
                    {modeName: "base", librarySelector: {kind: "json", path: "base.json"}},
                    {modeName: "bonus", librarySelector: {kind: "json", path: "bonus.json"}},
                ],
            }),
        );

        expect(validated.modes).toHaveLength(2);
    });

    it("accepts a bundle librarySelector", () => {
        const validated = validateDeploymentRunRequest(
            validInput({modes: [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}}]}),
        );

        expect(validated.modes).toEqual([{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}}]);
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

    it("accepts omitted modes for server-side prerequisite selection", () => {
        expect(validateDeploymentRunRequest(validInput({modes: undefined})).modes).toEqual([]);
    });

    it("throws when modes is an empty array", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: []}))).toThrow('"modes" must be a non-empty array when given.');
    });

    it("throws when modes is not an array", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: "not-an-array"}))).toThrow('"modes" must be a non-empty array when given.');
    });

    it("throws when a mode entry has a missing modeName", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: [{librarySelector: {kind: "json", path: "base.json"}}]}))).toThrow(
            "modes[0].modeName must be a non-empty string.",
        );
    });

    it("throws when a mode entry has an empty modeName", () => {
        expect(() =>
            validateDeploymentRunRequest(validInput({modes: [{modeName: "  ", librarySelector: {kind: "json", path: "base.json"}}]})),
        ).toThrow("modes[0].modeName must be a non-empty string.");
    });

    it("throws when a mode entry has a missing librarySelector", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: [{modeName: "base"}]}))).toThrow(
            '"modes[0].librarySelector.kind" must be one of "json", "bundle", "stakeengine".',
        );
    });

    it("throws when a mode entry's librarySelector is missing its path", () => {
        expect(() => validateDeploymentRunRequest(validInput({modes: [{modeName: "base", librarySelector: {kind: "json"}}]}))).toThrow(
            '"modes[0].librarySelector.path" must be a non-empty string.',
        );
    });

    it("throws when two modes share the same modeName", () => {
        expect(() =>
            validateDeploymentRunRequest(
                validInput({
                    modes: [
                        {modeName: "base", librarySelector: {kind: "json", path: "base.json"}},
                        {modeName: "base", librarySelector: {kind: "json", path: "other.json"}},
                    ],
                }),
            ),
        ).toThrow('"base" was given more than once in "modes" — each mode may only be deployed once per run.');
    });

    it("reports the correct index for a malformed mode past the first", () => {
        expect(() =>
            validateDeploymentRunRequest(
                validInput({
                    modes: [
                        {modeName: "base", librarySelector: {kind: "json", path: "base.json"}},
                        {modeName: "", librarySelector: {kind: "json", path: "bonus.json"}},
                    ],
                }),
            ),
        ).toThrow("modes[1].modeName must be a non-empty string.");
    });

    it("throws for a non-boolean publish", () => {
        expect(() => validateDeploymentRunRequest(validInput({publish: "yes"}))).toThrow('"publish" must be a boolean when given.');
    });
});
