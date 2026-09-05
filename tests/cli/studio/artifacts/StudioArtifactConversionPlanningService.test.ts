import {StudioArtifactConversionPlanningService} from "../../../../cli/studio/artifacts/StudioArtifactConversionPlanningService.js";
import type {ArtifactBuilderRegistry, ProjectResolving} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";

describe("StudioArtifactConversionPlanningService", () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-managed-blueprint-"));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    it("resolves a managed Blueprint directory through its canonical source file", async () => {
        const blueprintPath = path.join(projectRoot, "blueprint.json");
        fs.writeFileSync(blueprintPath, JSON.stringify({
            manifest: {id: "managed-studio-slot", name: "Managed Studio Slot", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 5}},
            reelStrips: [["A", "B"], ["A", "B"]],
            availableBets: [1],
        }));
        const resolver = {
            resolve: jest.fn((location: string) => Promise.resolve(location === blueprintPath
                ? {type: "blueprint" as const, rootPath: blueprintPath, capabilities: ["blueprint.build", "outcomeLibrary.generate", "stakeAdapter.export"] as const, provenance: "recognized managed blueprint"}
                : undefined)),
        } as ProjectResolving;
        const registry = {
            preparePlan: jest.fn(() => ({status: "planned"})),
        } as unknown as ArtifactBuilderRegistry;
        const service = new StudioArtifactConversionPlanningService("1.3.0", resolver, registry);

        await expect(service.prepare(projectRoot, "outcomeLibrary", path.join(projectRoot, "outcomelibrary"))).resolves.toMatchObject({status: "planned"});
        expect(resolver.resolve).toHaveBeenCalledTimes(1);
        expect(resolver.resolve).toHaveBeenCalledWith(blueprintPath);
        expect(registry.preparePlan).toHaveBeenCalledWith(
            expect.objectContaining({type: "blueprint", rootPath: blueprintPath}),
            "outcomeLibrary",
            {destinationPath: path.join(projectRoot, "outcomelibrary")},
        );
    });

    it("keeps a managed Blueprint source available when its enclosing directory has an unrelated malformed artifact candidate", async () => {
        const blueprintPath = path.join(projectRoot, "blueprint.json");
        const resolver = {
            resolve: jest.fn((location: string) => {
                if (location === projectRoot) return Promise.reject(new Error("malformed package manifest"));
                return Promise.resolve(location === blueprintPath
                    ? {type: "blueprint" as const, rootPath: blueprintPath, capabilities: ["blueprint.build", "outcomeLibrary.generate", "stakeAdapter.export"] as const, provenance: "recognized managed blueprint"}
                    : undefined);
            }),
        } as ProjectResolving;
        const registry = {
            preparePlan: jest.fn(() => ({status: "planned"})),
        } as unknown as ArtifactBuilderRegistry;
        const service = new StudioArtifactConversionPlanningService("1.3.0", resolver, registry);

        await expect(service.prepare(projectRoot, "outcomeLibrary", path.join(projectRoot, "outcomelibrary"))).resolves.toMatchObject({status: "planned"});
        expect(resolver.resolve).toHaveBeenCalledTimes(1);
        expect(resolver.resolve).toHaveBeenCalledWith(blueprintPath);
        expect(registry.preparePlan).toHaveBeenCalledWith(
            expect.objectContaining({type: "blueprint", rootPath: blueprintPath}),
            "outcomeLibrary",
            {destinationPath: path.join(projectRoot, "outcomelibrary")},
        );
    });

    it("keeps the managed Blueprint source when its directory also resolves as a package", async () => {
        const blueprintPath = path.join(projectRoot, "blueprint.json");
        const resolver = {
            resolve: jest.fn((location: string) => Promise.resolve(location === blueprintPath
                ? {type: "blueprint" as const, rootPath: blueprintPath, capabilities: ["blueprint.build", "outcomeLibrary.generate", "stakeAdapter.export"] as const, provenance: "recognized managed blueprint"}
                : {type: "tsPackage" as const, rootPath: projectRoot, capabilities: ["runtime.execute", "outcomeLibrary.generate", "stakeAdapter.export"] as const, provenance: "generated package sibling"})),
        } as ProjectResolving;
        const registry = {preparePlan: jest.fn(() => ({status: "planned"}))} as unknown as ArtifactBuilderRegistry;
        const service = new StudioArtifactConversionPlanningService("1.3.0", resolver, registry);

        await expect(service.prepare(projectRoot, "outcomeLibrary", path.join(projectRoot, "outcomelibrary"))).resolves.toMatchObject({status: "planned"});

        expect(resolver.resolve).toHaveBeenCalledTimes(1);
        expect(resolver.resolve).toHaveBeenCalledWith(blueprintPath);
        expect(registry.preparePlan).toHaveBeenCalledWith(
            expect.objectContaining({type: "blueprint", rootPath: blueprintPath}),
            "outcomeLibrary",
            {destinationPath: path.join(projectRoot, "outcomelibrary")},
        );
    });

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
