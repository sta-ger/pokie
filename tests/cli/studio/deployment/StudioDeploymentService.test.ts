import {
    buildRoundArtifact,
    buildWeightedOutcomeLibrary,
    ExternalArtifactGenerationResult,
    ExternalDeploymentProjectedModeInput,
    ExternalDeploymentTarget,
    ExternalRoundProjector,
    RoundArtifact,
    RoundArtifactProvenance,
    WeightedOutcomeLibrary,
    WinEvaluationResult,
} from "pokie";
import {StudioDeploymentService} from "../../../../cli/studio/deployment/StudioDeploymentService.js";
import type {ValidatedDeploymentRunRequest} from "../../../../cli/studio/deployment/validateDeploymentRunRequest.js";

class NoOpRoundProjector implements ExternalRoundProjector {
    public project(_artifact: RoundArtifact): Record<string, never> {
        return {};
    }
}

function stubGenerator() {
    return {
        generate: (_modes: readonly ExternalDeploymentProjectedModeInput[]): ExternalArtifactGenerationResult => ({
            artifacts: [{relativePath: "index.json", content: "{}"}],
            issues: [],
        }),
    };
}

function stubTarget(overrides: Partial<ExternalDeploymentTarget> = {}): ExternalDeploymentTarget {
    return {
        id: "local-json-example",
        version: "1.0.0",
        requirements: {},
        capabilities: [],
        roundProjector: new NoOpRoundProjector(),
        artifactGenerator: stubGenerator(),
        ...overrides,
    };
}

function testLibrary(): WeightedOutcomeLibrary {
    const provenance: RoundArtifactProvenance = {game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}, pokieVersion: "1.0.0"};
    const artifact = buildRoundArtifact({
        roundId: "lib-0",
        provenance,
        betMode: "base",
        stake: 1,
        steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult()}],
    });
    return buildWeightedOutcomeLibrary({libraryId: "lib", outcomes: [{id: "0", weight: 1, artifact}]});
}

function runRequest(overrides: Partial<ValidatedDeploymentRunRequest> = {}): ValidatedDeploymentRunRequest {
    return {targetId: "local-json-example", modes: [{modeName: "base", libraryPath: "base.json"}], publish: false, ...overrides};
}

describe("StudioDeploymentService", () => {
    it("lists the injected target's own id/version/requirements/capabilities", () => {
        const target = stubTarget({requirements: {minPokieVersion: "1.0.0"}, capabilities: ["multiMode"]});
        const service = new StudioDeploymentService(undefined, () => target);

        const targets = service.listTargets("/project");

        expect(targets).toEqual([{id: "local-json-example", version: "1.0.0", requirements: {minPokieVersion: "1.0.0"}, capabilities: ["multiMode"]}]);
    });

    it("returns target-not-found for an unregistered targetId", async () => {
        const service = new StudioDeploymentService(undefined, () => stubTarget());

        const result = await service.run("/project", runRequest({targetId: "does-not-exist"}));

        expect(result).toEqual({status: "target-not-found"});
    });

    it("returns load-error, prefixed with the mode name, when a library fails to load", async () => {
        const readFile = () => {
            throw new Error("simulated read failure");
        };
        const service = new StudioDeploymentService(undefined, () => stubTarget(), readFile);

        const result = await service.run("/project", runRequest());

        expect(result.status).toBe("load-error");
        expect(result.status === "load-error" && result.error).toContain('mode "base"');
        expect(result.status === "load-error" && result.error).toContain("simulated read failure");
    });

    it("stops at the first mode that fails to load and never calls the generator", async () => {
        const generate = jest.fn(stubGenerator().generate);
        const readFile = () => {
            throw new Error("simulated read failure");
        };
        const service = new StudioDeploymentService(undefined, () => stubTarget({artifactGenerator: {generate}}), readFile);

        await service.run("/project", runRequest({modes: [{modeName: "base", libraryPath: "base.json"}]}));

        expect(generate).not.toHaveBeenCalled();
    });

    it("previews (publish: false) without ever calling the target's own runtimeAdapter", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const library = testLibrary();
        const service = new StudioDeploymentService(undefined, () => stubTarget({runtimeAdapter: {deliver}}), () => JSON.stringify(library));

        const result = await service.run("/project", runRequest({publish: false}));

        expect(result.status).toBe("ok");
        expect(result.status === "ok" && result.view.publish).toBe(false);
        expect(result.status === "ok" && result.view.delivery).toBeUndefined();
        expect(deliver).not.toHaveBeenCalled();
    });

    it("deploys (publish: true) and calls the target's own runtimeAdapter", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true, details: {published: true}}));
        const library = testLibrary();
        const service = new StudioDeploymentService(undefined, () => stubTarget({runtimeAdapter: {deliver}}), () => JSON.stringify(library));

        const result = await service.run("/project", runRequest({publish: true}));

        expect(result.status).toBe("ok");
        expect(result.status === "ok" && result.view.publish).toBe(true);
        expect(result.status === "ok" && result.view.delivery?.delivered).toBe(true);
        expect(deliver).toHaveBeenCalledTimes(1);
    });

    it("surfaces compatibility issues without ever reaching the generator, for a genuinely incompatible library", async () => {
        const generate = jest.fn(stubGenerator().generate);
        const malformedLibrary = {schemaVersion: 1, libraryId: "", outcomes: []};
        const service = new StudioDeploymentService(undefined, () => stubTarget({artifactGenerator: {generate}}), () => JSON.stringify(malformedLibrary));

        const result = await service.run("/project", runRequest());

        expect(result.status).toBe("ok");
        expect(result.status === "ok" && result.view.compatibilityIssues.length).toBeGreaterThan(0);
        expect(result.status === "ok" && result.view.generation).toBeUndefined();
        expect(generate).not.toHaveBeenCalled();
    });

    it("decodes Buffer artifact content into a plain string in the returned view", async () => {
        const bufferGenerator = {
            generate: (_modes: readonly ExternalDeploymentProjectedModeInput[]): ExternalArtifactGenerationResult => ({
                artifacts: [{relativePath: "index.json", content: Buffer.from('{"fromBuffer":true}')}],
                issues: [],
            }),
        };
        const library = testLibrary();
        const service = new StudioDeploymentService(undefined, () => stubTarget({artifactGenerator: bufferGenerator}), () => JSON.stringify(library));

        const result = await service.run("/project", runRequest());

        expect(result.status).toBe("ok");
        const content = result.status === "ok" ? result.view.generation?.artifacts[0]?.content : undefined;
        expect(content).toBe('{"fromBuffer":true}');
        expect(typeof content).toBe("string");
    });
});
