import {StudioArtifactConversionPlanningService} from "../../../../cli/studio/artifacts/StudioArtifactConversionPlanningService.js";
import type {ArtifactBuilderRegistry, ProjectResolving} from "pokie";

describe("StudioArtifactConversionPlanningService", () => {
    it("returns a structured unavailable plan when Studio cannot recognize the selected source", async () => {
        const resolver: ProjectResolving = {resolve: jest.fn(() => Promise.resolve(undefined))};
        const registry = {preparePlan: jest.fn()} as unknown as ArtifactBuilderRegistry;
        const service = new StudioArtifactConversionPlanningService("1.3.0", resolver, registry);

        const plan = await service.prepare("/projects/not-a-pokie-project", "outcomeLibrary", "/projects/outcomes");

        expect(plan).toMatchObject({
            status: "unavailable",
            source: {
                canonicalLocation: "/projects/not-a-pokie-project",
                recognitionProvenance: "unresolved Studio project runtime",
                capabilities: [],
            },
            target: {kind: "outcomeLibrary", canonicalLocation: "/projects/outcomes"},
            diagnostic: {code: "unrecognized-source", failedEdge: {from: "tsPackage", to: "outcomeLibrary"}},
        });
        expect(registry.preparePlan).not.toHaveBeenCalled();
    });

    it("keeps a resolver failure in the same terminal planner contract", async () => {
        const resolver: ProjectResolving = {resolve: jest.fn(() => Promise.reject(new Error("corrupt manifest")))};
        const registry = {preparePlan: jest.fn()} as unknown as ArtifactBuilderRegistry;
        const service = new StudioArtifactConversionPlanningService("1.3.0", resolver, registry);

        const plan = await service.prepare("/projects/corrupt", "stakeAdapter");

        expect(plan).toMatchObject({status: "unavailable", diagnostic: {code: "unrecognized-source", failedEdge: {from: "tsPackage", to: "stakeAdapter"}}});
        expect(registry.preparePlan).not.toHaveBeenCalled();
    });
});
