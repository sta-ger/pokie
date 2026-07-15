import {
    ExternalArtifactGenerationContext,
    ExternalDeploymentModeInput,
    ExternalDeploymentService,
    ExternalDeploymentTarget,
    ExternalRoundProjector,
    RoundArtifact,
} from "pokie";
import {externalAdapterTestLibrary} from "./ExternalAdapterTestFixtures.js";

class MarkerRoundProjector implements ExternalRoundProjector {
    public project(_artifact: RoundArtifact): Record<string, boolean> {
        return {marker: true};
    }
}

function compatibleModes(): ExternalDeploymentModeInput[] {
    return [{modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib"})}];
}

function baseTarget(overrides: Partial<ExternalDeploymentTarget> = {}): ExternalDeploymentTarget {
    return {
        id: "acme-rgs",
        version: "1.0.0",
        requirements: {},
        capabilities: [],
        roundProjector: new MarkerRoundProjector(),
        artifactGenerator: {generate: () => ({artifacts: [{relativePath: "a.json", content: "{}"}], issues: []})},
        ...overrides,
    };
}

describe("ExternalDeploymentService", () => {
    it("does not call the generator when descriptor validation fails", async () => {
        const compatibilityValidate = jest.fn(() => []);
        const target = baseTarget({artifactGenerator: {} as ExternalDeploymentTarget["artifactGenerator"]});

        const service = new ExternalDeploymentService(undefined, {validate: compatibilityValidate});
        const result = await service.deploy(target, compatibleModes());

        expect(result.descriptorIssues.map((issue) => issue.code)).toContain("external-deployment-target-artifact-generator-invalid");
        expect(result.compatibilityIssues).toEqual([]);
        expect(result.generation).toBeUndefined();
        expect(compatibilityValidate).not.toHaveBeenCalled();
    });

    it("does not call the generator when compatibility validation reports an error", async () => {
        const generate = jest.fn(() => ({artifacts: [], issues: []}));
        const target = baseTarget({requirements: {symbolAlphabet: "numeric"}, artifactGenerator: {generate}});

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.compatibilityIssues.map((issue) => issue.code)).toContain("external-deployment-symbol-alphabet-invalid");
        expect(result.generation).toBeUndefined();
        expect(generate).not.toHaveBeenCalled();
    });

    it("passes target.roundProjector to the generator via the generation context, never a projector of the generator's own", async () => {
        const projector = new MarkerRoundProjector();
        const generate = jest.fn((_modes: readonly ExternalDeploymentModeInput[], _context: ExternalArtifactGenerationContext) => ({
            artifacts: [],
            issues: [],
        }));
        const target = baseTarget({roundProjector: projector, artifactGenerator: {generate}});
        const modes = compatibleModes();

        await new ExternalDeploymentService().deploy(target, modes);

        expect(generate).toHaveBeenCalledWith(modes, {roundProjector: projector});
    });

    it("does not call the artifact generator's optional collaborators when generation itself reports an error", async () => {
        const validate = jest.fn(() => []);
        const diagnose = jest.fn(() => Promise.resolve({ok: true, checks: []}));
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            artifactGenerator: {generate: () => ({artifacts: [], issues: [{code: "generator-exploded", severity: "error", message: "boom"}]})},
            artifactValidator: {validate},
            diagnostic: {diagnose},
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.generation?.issues.map((issue) => issue.code)).toEqual(["generator-exploded"]);
        expect(result.artifactIssues).toEqual([]);
        expect(validate).not.toHaveBeenCalled();
        expect(diagnose).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });

    it("always runs StandardExternalArtifactValidator even when the target's own validator is permissive", async () => {
        const permissive = jest.fn(() => []); // always reports nothing, however bad the artifacts are
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            artifactGenerator: {
                generate: () => ({
                    artifacts: [
                        {relativePath: "same.json", content: "{}"},
                        {relativePath: "same.json", content: "{}"},
                    ],
                    issues: [],
                }),
            },
            artifactValidator: {validate: permissive},
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(permissive).toHaveBeenCalled();
        expect(result.artifactIssues.map((issue) => issue.code)).toContain("external-artifact-duplicate-path");
        expect(deliver).not.toHaveBeenCalled();
    });

    it("combines StandardExternalArtifactValidator issues with the target's own additive issues, never one replacing the other", async () => {
        const target = baseTarget({
            artifactGenerator: {
                generate: () => ({
                    artifacts: [
                        {relativePath: "same.json", content: "{}"},
                        {relativePath: "same.json", content: "{}"},
                    ],
                    issues: [],
                }),
            },
            artifactValidator: {validate: () => [{code: "vendor-specific-check-failed", severity: "error", message: "vendor rule violated"}]},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());
        const codes = result.artifactIssues.map((issue) => issue.code);

        expect(codes).toContain("external-artifact-duplicate-path");
        expect(codes).toContain("vendor-specific-check-failed");
    });

    it("skips delivery when the diagnostic reports not-ok", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            diagnostic: {diagnose: () => Promise.resolve({ok: false, checks: [{name: "endpointReachable", ok: false, message: "unreachable"}]})},
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.diagnostic?.ok).toBe(false);
        expect(result.delivery).toBeUndefined();
        expect(deliver).not.toHaveBeenCalled();
    });

    it("runs the full pipeline through to delivery when every stage succeeds", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true, details: {published: true}}));
        const target = baseTarget({
            diagnostic: {diagnose: () => Promise.resolve({ok: true, checks: []})},
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.descriptorIssues).toEqual([]);
        expect(result.compatibilityIssues).toEqual([]);
        expect(result.artifactIssues).toEqual([]);
        expect(result.diagnostic?.ok).toBe(true);
        expect(result.delivery?.delivered).toBe(true);
        expect(deliver).toHaveBeenCalledTimes(1);
    });

    it("skips diagnostic and delivery entirely when the target declares neither", async () => {
        const target = baseTarget();

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.artifactIssues).toEqual([]);
        expect(result.diagnostic).toBeUndefined();
        expect(result.delivery).toBeUndefined();
    });
});
