import {StakeProjectionExportService} from "../../src/project/StakeProjectionExportService.js";
import type {ArtifactBuilderRegistry} from "../../src/project/ArtifactBuilderRegistry.js";
import type {ArtifactConversionPlan} from "../../src/project/ArtifactConversionPlanner.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import type {PokieProject} from "../../src/project/PokieProject.js";

describe("StakeProjectionExportService", () => {
    const source: PokieProject = {
        type: "blueprint",
        rootPath: "/projects/current.blueprint.json",
        provenance: "test fixture",
        capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
    };
    const prepared = {
        status: "planned",
        source: {kind: "blueprint", capabilities: PROJECT_TYPE_CAPABILITIES.blueprint},
        target: {kind: "stakeAdapter", capabilities: PROJECT_TYPE_CAPABILITIES.stakeAdapter, canonicalLocation: "/exports/stake"},
        steps: [],
        preflight: {destinationKind: "directory", estimatedWork: "publish", losses: [], oneWay: true},
    } as ArtifactConversionPlan;

    it("delegates preparation, validation, and execution to one immutable Stake plan", async () => {
        const registry = {
            preparePlan: jest.fn().mockResolvedValue(prepared),
            validate: jest.fn().mockResolvedValue(undefined),
            executePlan: jest.fn().mockResolvedValue({outputPath: "/exports/stake"}),
        } as unknown as ArtifactBuilderRegistry;
        const service = new StakeProjectionExportService(registry);
        const options = {outcomeLibraryGeneration: {sampled: {sampleSize: BigInt(7), seed: "stable"}}} as const;

        expect(await service.prepare(source, "/exports/stake", options)).toBe(prepared);
        await service.validate(source, prepared);
        await expect(service.execute(source, "/exports/stake", prepared, options)).resolves.toEqual({outputPath: "/exports/stake"});

        expect(registry.preparePlan).toHaveBeenCalledWith(source, "stakeAdapter", {
            destinationPath: "/exports/stake",
            outcomeLibraryGeneration: options.outcomeLibraryGeneration,
        });
        expect(registry.validate).toHaveBeenCalledWith("stakeAdapter", source, prepared);
        expect(registry.executePlan).toHaveBeenCalledWith(prepared, source, "/exports/stake", options);
    });
});
