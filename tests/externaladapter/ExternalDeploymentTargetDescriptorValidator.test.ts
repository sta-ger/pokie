import {ExternalDeploymentTarget, ExternalDeploymentTargetDescriptorValidator, ExternalRoundProjector, RoundArtifact} from "pokie";

class NoOpRoundProjector implements ExternalRoundProjector {
    public project(_artifact: RoundArtifact): Record<string, never> {
        return {};
    }
}

function validTarget(overrides: Partial<ExternalDeploymentTarget> = {}): ExternalDeploymentTarget {
    return {
        id: "acme-rgs",
        version: "1.0.0",
        requirements: {},
        capabilities: [],
        roundProjector: new NoOpRoundProjector(),
        artifactGenerator: {generate: () => ({artifacts: [], issues: []})},
        ...overrides,
    };
}

function issueCodes(target: ExternalDeploymentTarget): string[] {
    return new ExternalDeploymentTargetDescriptorValidator().validate(target).map((issue) => issue.code);
}

describe("ExternalDeploymentTargetDescriptorValidator", () => {
    it("reports no issues for a well-formed target", () => {
        expect(issueCodes(validTarget())).toEqual([]);
    });

    it("reports external-deployment-target-id-invalid for a non-string id", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(issueCodes(validTarget({id: 42 as any}))).toContain("external-deployment-target-id-invalid");
    });

    it("reports external-deployment-target-id-invalid for an empty id", () => {
        expect(issueCodes(validTarget({id: "   "}))).toContain("external-deployment-target-id-invalid");
    });

    it("reports external-deployment-target-version-invalid for an empty version", () => {
        expect(issueCodes(validTarget({version: ""}))).toContain("external-deployment-target-version-invalid");
    });

    it("reports external-deployment-target-requirements-invalid when requirements is not an object", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(issueCodes(validTarget({requirements: null as any}))).toContain("external-deployment-target-requirements-invalid");
    });

    it("reports external-deployment-target-min-pokie-version-invalid for an unparseable minPokieVersion", () => {
        expect(issueCodes(validTarget({requirements: {minPokieVersion: "vNext"}}))).toContain("external-deployment-target-min-pokie-version-invalid");
    });

    it("accepts a valid minPokieVersion", () => {
        expect(issueCodes(validTarget({requirements: {minPokieVersion: "1.3.0"}}))).toEqual([]);
    });

    it("reports external-deployment-target-symbol-alphabet-invalid for an unrecognized symbolAlphabet", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(issueCodes(validTarget({requirements: {symbolAlphabet: "letters" as any}}))).toContain("external-deployment-target-symbol-alphabet-invalid");
    });

    it("reports external-deployment-target-requires-homogeneous-provenance-invalid for a non-boolean value", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(issueCodes(validTarget({requirements: {requiresHomogeneousProvenance: "yes" as any}}))).toContain(
            "external-deployment-target-requires-homogeneous-provenance-invalid",
        );
    });

    it("reports external-deployment-target-capabilities-invalid when capabilities is not an array", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(issueCodes(validTarget({capabilities: "multiMode" as any}))).toContain("external-deployment-target-capabilities-invalid");
    });

    it("reports external-deployment-target-capabilities-invalid for a non-string capability entry", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(issueCodes(validTarget({capabilities: [42 as any]}))).toContain("external-deployment-target-capabilities-invalid");
    });

    it("reports external-deployment-target-duplicate-capability for an exact duplicate", () => {
        expect(issueCodes(validTarget({capabilities: ["multiMode", "multiMode"]}))).toContain("external-deployment-target-duplicate-capability");
    });

    it("reports external-deployment-target-capability-case-collision for capabilities differing only in case", () => {
        expect(issueCodes(validTarget({capabilities: ["multiMode", "MULTIMODE"]}))).toContain("external-deployment-target-capability-case-collision");
    });

    it("reports external-deployment-target-round-projector-invalid when roundProjector lacks a project method", () => {
        expect(issueCodes(validTarget({roundProjector: {} as ExternalRoundProjector}))).toContain("external-deployment-target-round-projector-invalid");
    });

    it("reports external-deployment-target-artifact-generator-invalid when artifactGenerator lacks a generate method", () => {
        expect(issueCodes(validTarget({artifactGenerator: {} as ExternalDeploymentTarget["artifactGenerator"]}))).toContain(
            "external-deployment-target-artifact-generator-invalid",
        );
    });

    it("accepts an absent optional artifactValidator/diagnostic/runtimeAdapter", () => {
        expect(issueCodes(validTarget())).toEqual([]);
    });

    it("reports external-deployment-target-artifact-validator-invalid when artifactValidator is present but malformed", () => {
        expect(issueCodes(validTarget({artifactValidator: {} as ExternalDeploymentTarget["artifactValidator"]}))).toContain(
            "external-deployment-target-artifact-validator-invalid",
        );
    });

    it("reports external-deployment-target-diagnostic-invalid when diagnostic is present but malformed", () => {
        expect(issueCodes(validTarget({diagnostic: {} as ExternalDeploymentTarget["diagnostic"]}))).toContain("external-deployment-target-diagnostic-invalid");
    });

    it("reports external-deployment-target-runtime-adapter-invalid when runtimeAdapter is present but malformed", () => {
        expect(issueCodes(validTarget({runtimeAdapter: {} as ExternalDeploymentTarget["runtimeAdapter"]}))).toContain(
            "external-deployment-target-runtime-adapter-invalid",
        );
    });

    it("accepts well-formed optional collaborators", () => {
        const target = validTarget({
            artifactValidator: {validate: () => []},
            diagnostic: {diagnose: () => Promise.resolve({ok: true, checks: []})},
            runtimeAdapter: {deliver: () => Promise.resolve({delivered: true})},
        });
        expect(issueCodes(target)).toEqual([]);
    });

    it("never throws for a completely malformed target", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => new ExternalDeploymentTargetDescriptorValidator().validate(null as any)).not.toThrow();
    });
});
