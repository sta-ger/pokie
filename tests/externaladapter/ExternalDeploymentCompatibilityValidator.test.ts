import {
    ExternalDeploymentCapability,
    ExternalDeploymentCompatibilityContext,
    ExternalDeploymentCompatibilityValidator,
    ExternalDeploymentModeInput,
    ExternalDeploymentRequirements,
    ExternalDeploymentTarget,
    ExternalRoundProjector,
    MULTI_MODE_DEPLOYMENT_CAPABILITY,
    ROUND_ARTIFACT_DEBUG_METADATA_CAPABILITY,
    ROUND_ARTIFACT_FEATURE_EVENTS_CAPABILITY,
    RoundArtifact,
    buildWeightedOutcomeLibrary,
} from "pokie";
import {
    externalAdapterArtifact,
    externalAdapterArtifactWithDebug,
    externalAdapterArtifactWithFeatureEvent,
    externalAdapterTestLibrary,
    numericExternalAdapterArtifact,
} from "./ExternalAdapterTestFixtures.js";

class NoOpRoundProjector<T extends string | number = string> implements ExternalRoundProjector<T> {
    public project(_artifact: RoundArtifact<T>): Record<string, never> {
        return {};
    }
}

function targetWith<T extends string | number = string>(
    requirements: ExternalDeploymentRequirements,
    capabilities: readonly ExternalDeploymentCapability[] = [],
): ExternalDeploymentTarget<T> {
    return {
        id: "test-target",
        version: "1.0.0",
        requirements,
        capabilities,
        roundProjector: new NoOpRoundProjector<T>(),
        artifactGenerator: {generate: () => ({artifacts: [], issues: []})},
    };
}

function issueCodes<T extends string | number = string>(context: ExternalDeploymentCompatibilityContext<T>): string[] {
    return new ExternalDeploymentCompatibilityValidator<T>().validate(context).map((issue) => issue.code);
}

describe("ExternalDeploymentCompatibilityValidator", () => {
    it("reports no issues for a compatible single-mode deployment with no requirements", () => {
        const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib"})}];
        expect(issueCodes({target: targetWith({}), modes})).toEqual([]);
    });

    it("reports external-deployment-modes-empty for an empty modes array", () => {
        expect(issueCodes({target: targetWith({}), modes: []})).toEqual(["external-deployment-modes-empty"]);
    });

    it("forwards WeightedOutcomeLibraryValidator issues prefixed with the mode name", () => {
        const library = externalAdapterTestLibrary({libraryId: "lib"});
        const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library: {...library, libraryId: ""}}];

        const issues = new ExternalDeploymentCompatibilityValidator().validate({target: targetWith({}), modes});
        const forwarded = issues.find((issue) => issue.code === "weighted-outcome-library-id-invalid");
        expect(forwarded).toBeDefined();
        expect(forwarded?.message).toMatch(/^mode "base": /);
    });

    describe("mode names", () => {
        it("reports external-deployment-duplicate-mode-name for two modes sharing the exact same name", () => {
            const modes: ExternalDeploymentModeInput[] = [
                {modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib-1"})},
                {modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib-2"})},
            ];
            expect(issueCodes({target: targetWith({}, [MULTI_MODE_DEPLOYMENT_CAPABILITY]), modes})).toEqual(["external-deployment-duplicate-mode-name"]);
        });

        it("reports external-deployment-mode-name-case-collision for modes differing only in case", () => {
            const modes: ExternalDeploymentModeInput[] = [
                {modeName: "Base", library: externalAdapterTestLibrary({libraryId: "lib-1"})},
                {modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib-2"})},
            ];
            expect(issueCodes({target: targetWith({}, [MULTI_MODE_DEPLOYMENT_CAPABILITY]), modes})).toEqual(["external-deployment-mode-name-case-collision"]);
        });
    });

    describe("multi-mode capability", () => {
        it("reports external-deployment-multi-mode-unsupported when more than one mode is given without the capability", () => {
            const modes: ExternalDeploymentModeInput[] = [
                {modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib-1"})},
                {modeName: "bonus", library: externalAdapterTestLibrary({libraryId: "lib-2"})},
            ];
            expect(issueCodes({target: targetWith({}), modes})).toContain("external-deployment-multi-mode-unsupported");
        });

        it("accepts more than one mode when the capability is declared", () => {
            const modes: ExternalDeploymentModeInput[] = [
                {modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib-1"})},
                {modeName: "bonus", library: externalAdapterTestLibrary({libraryId: "lib-2"})},
            ];
            expect(issueCodes({target: targetWith({}, [MULTI_MODE_DEPLOYMENT_CAPABILITY]), modes})).toEqual([]);
        });
    });

    describe("homogeneous provenance", () => {
        it("reports external-deployment-provenance-mismatch when modes have different game ids by default", () => {
            const otherGameLibrary = buildWeightedOutcomeLibrary({
                libraryId: "other-lib",
                outcomes: [
                    {
                        id: "0",
                        weight: 1,
                        artifact: externalAdapterArtifact({roundId: "other-0", totalWin: 0, stake: 1}),
                    },
                ],
            });
            const mismatched = {
                ...otherGameLibrary,
                outcomes: [{...otherGameLibrary.outcomes[0], artifact: {...otherGameLibrary.outcomes[0].artifact, provenance: {...otherGameLibrary.outcomes[0].artifact.provenance, game: {id: "other-game", name: "Other", version: "0.1.0"}}}}],
            };
            const modes: ExternalDeploymentModeInput[] = [
                {modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib-1"})},
                {modeName: "bonus", library: mismatched},
            ];
            expect(issueCodes({target: targetWith({}, [MULTI_MODE_DEPLOYMENT_CAPABILITY]), modes})).toContain("external-deployment-provenance-mismatch");
        });

        it("does not report a provenance mismatch when requiresHomogeneousProvenance is false", () => {
            const otherGameLibrary = externalAdapterTestLibrary({libraryId: "lib-2"});
            const mismatched = {
                ...otherGameLibrary,
                outcomes: [{...otherGameLibrary.outcomes[0], artifact: {...otherGameLibrary.outcomes[0].artifact, provenance: {...otherGameLibrary.outcomes[0].artifact.provenance, game: {id: "other-game", name: "Other", version: "0.1.0"}}}}],
            };
            const modes: ExternalDeploymentModeInput[] = [
                {modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib-1"})},
                {modeName: "bonus", library: mismatched},
            ];
            const issues = issueCodes({target: targetWith({requiresHomogeneousProvenance: false}, [MULTI_MODE_DEPLOYMENT_CAPABILITY]), modes});
            expect(issues).not.toContain("external-deployment-provenance-mismatch");
        });
    });

    describe("minPokieVersion", () => {
        it("reports external-deployment-pokie-version-too-old when content is older than the target's minimum", () => {
            const library = buildWeightedOutcomeLibrary({
                libraryId: "lib",
                outcomes: [{id: "0", weight: 1, artifact: externalAdapterArtifact({roundId: "r0", totalWin: 0, stake: 1, pokieVersion: "1.0.0"})}],
            });
            const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library}];
            expect(issueCodes({target: targetWith({minPokieVersion: "1.3.0"}), modes})).toEqual(["external-deployment-pokie-version-too-old"]);
        });

        it("accepts content whose pokieVersion is exactly the minimum", () => {
            const library = buildWeightedOutcomeLibrary({
                libraryId: "lib",
                outcomes: [{id: "0", weight: 1, artifact: externalAdapterArtifact({roundId: "r0", totalWin: 0, stake: 1, pokieVersion: "1.3.0"})}],
            });
            const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library}];
            expect(issueCodes({target: targetWith({minPokieVersion: "1.3.0"}), modes})).toEqual([]);
        });

        it("accepts content newer than the target's minimum", () => {
            const library = buildWeightedOutcomeLibrary({
                libraryId: "lib",
                outcomes: [{id: "0", weight: 1, artifact: externalAdapterArtifact({roundId: "r0", totalWin: 0, stake: 1, pokieVersion: "2.0.0"})}],
            });
            const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library}];
            expect(issueCodes({target: targetWith({minPokieVersion: "1.3.0"}), modes})).toEqual([]);
        });

        it("reports external-deployment-pokie-version-not-comparable when pokieVersion isn't parseable", () => {
            const library = buildWeightedOutcomeLibrary({
                libraryId: "lib",
                outcomes: [{id: "0", weight: 1, artifact: externalAdapterArtifact({roundId: "r0", totalWin: 0, stake: 1, pokieVersion: "not-a-version"})}],
            });
            const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library}];
            expect(issueCodes({target: targetWith({minPokieVersion: "1.3.0"}), modes})).toEqual(["external-deployment-pokie-version-not-comparable"]);
        });
    });

    describe("symbolAlphabet", () => {
        it("reports external-deployment-symbol-alphabet-invalid when a numeric target receives string symbols", () => {
            const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib"})}];
            expect(issueCodes({target: targetWith({symbolAlphabet: "numeric"}), modes})).toEqual(["external-deployment-symbol-alphabet-invalid"]);
        });

        it("accepts numeric symbols against a numeric-alphabet target", () => {
            const library = buildWeightedOutcomeLibrary({
                libraryId: "lib",
                outcomes: [{id: "0", weight: 1, artifact: numericExternalAdapterArtifact({roundId: "r0", totalWin: 0, stake: 1})}],
            });
            const modes: ExternalDeploymentModeInput<number>[] = [{modeName: "base", library}];
            expect(issueCodes<number>({target: targetWith<number>({symbolAlphabet: "numeric"}), modes})).toEqual([]);
        });
    });

    describe("feature capabilities", () => {
        it("reports external-deployment-feature-events-unsupported when content uses feature events without the capability", () => {
            const library = buildWeightedOutcomeLibrary({
                libraryId: "lib",
                outcomes: [{id: "0", weight: 1, artifact: externalAdapterArtifactWithFeatureEvent({roundId: "r0", totalWin: 0, stake: 1})}],
            });
            const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library}];
            expect(issueCodes({target: targetWith({}), modes})).toEqual(["external-deployment-feature-events-unsupported"]);
        });

        it("accepts feature events once the capability is declared", () => {
            const library = buildWeightedOutcomeLibrary({
                libraryId: "lib",
                outcomes: [{id: "0", weight: 1, artifact: externalAdapterArtifactWithFeatureEvent({roundId: "r0", totalWin: 0, stake: 1})}],
            });
            const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library}];
            expect(issueCodes({target: targetWith({}, [ROUND_ARTIFACT_FEATURE_EVENTS_CAPABILITY]), modes})).toEqual([]);
        });

        it("reports external-deployment-debug-metadata-unsupported when content carries debug metadata without the capability", () => {
            const library = buildWeightedOutcomeLibrary({
                libraryId: "lib",
                outcomes: [{id: "0", weight: 1, artifact: externalAdapterArtifactWithDebug({roundId: "r0", totalWin: 0, stake: 1})}],
            });
            const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library}];
            expect(issueCodes({target: targetWith({}), modes})).toEqual(["external-deployment-debug-metadata-unsupported"]);
        });

        it("accepts debug metadata once the capability is declared", () => {
            const library = buildWeightedOutcomeLibrary({
                libraryId: "lib",
                outcomes: [{id: "0", weight: 1, artifact: externalAdapterArtifactWithDebug({roundId: "r0", totalWin: 0, stake: 1})}],
            });
            const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library}];
            expect(issueCodes({target: targetWith({}, [ROUND_ARTIFACT_DEBUG_METADATA_CAPABILITY]), modes})).toEqual([]);
        });
    });
});
