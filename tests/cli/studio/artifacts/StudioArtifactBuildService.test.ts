import fs from "fs";
import os from "os";
import path from "path";
import {StudioArtifactBuildService} from "../../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {ArtifactBuildCancelledError, PROJECT_TYPE_CAPABILITIES, type ArtifactBuilderRegistry, type PokieProject, type ProjectResolving} from "pokie";
import {localPokieDependencyRunner} from "../../../testUtils/offlinePokieDependencyOverride.js";
import {prepareExactCodeFirstPackage} from "../../../testUtils/prepareExactCodeFirstPackage.js";

function buildBlueprint(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

describe("StudioArtifactBuildService", () => {
    let workDir: string;
    let service: StudioArtifactBuildService;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-artifact-build-test-"));
        service = new StudioArtifactBuildService("1.3.0");
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    function writeBlueprintFile(blueprint: unknown = buildBlueprint()): string {
        const filePath = path.join(workDir, "blueprint.json");
        fs.writeFileSync(filePath, JSON.stringify(blueprint));
        return filePath;
    }

    describe("listTargets", () => {
        it("reports the registry-owned Blueprint -> Outcome -> Stake targets as supported", async () => {
            const blueprintPath = writeBlueprintFile();

            const targets = await service.listTargets(blueprintPath);

            expect(new Set(targets.map((entry) => entry.target))).toEqual(new Set(["tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook", "wasm"]));
            const byTarget = new Map(targets.map((entry) => [entry.target, entry]));
            expect(byTarget.get("tsPackage")?.supported).toBe(true);
            expect(byTarget.get("outcomeLibrary")?.supported).toBe(true);
            expect(byTarget.get("stakeAdapter")?.supported).toBe(true);
            expect(byTarget.get("parWorkbook")?.supported).toBe(false);
            expect(byTarget.get("wasm")?.supported).toBe(false);
        });

        it("marks every target unsupported for a path that isn't a recognized POKIE project", async () => {
            const targets = await service.listTargets(path.join(workDir, "does-not-exist"));

            expect(targets.every((entry) => entry.supported === false)).toBe(true);
        });
    });

    describe("preview", () => {
        it("resolves the same default sibling destination build() itself would use, without writing anything", async () => {
            const blueprintPath = writeBlueprintFile();
            const expectedDestination = path.join(workDir, "tsPackage");

            const result = await service.preview(blueprintPath, "tsPackage");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.destination).toBe(expectedDestination);
            expect(result.sourceType).toBe("blueprint");
            expect(fs.existsSync(expectedDestination)).toBe(false);
        });

        it("resolves an explicit outDir when given", async () => {
            const blueprintPath = writeBlueprintFile();
            const explicitOut = path.join(workDir, "my-custom-out");

            const result = await service.preview(blueprintPath, "tsPackage", explicitOut);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.destination).toBe(explicitOut);
        });

        it("previews the registry-owned Blueprint -> Stake hand-off without writing", async () => {
            const blueprintPath = writeBlueprintFile();

            const result = await service.preview(blueprintPath, "stakeAdapter");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.sourceType).toBe("blueprint");
        });

        it("reports a conflict for a pre-existing non-empty destination, agreeing with what build() itself would report, and never writes to it", async () => {
            const blueprintPath = writeBlueprintFile();
            const destination = path.join(workDir, "tsPackage");
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.txt"), "pre-existing");

            const result = await service.preview(blueprintPath, "tsPackage");

            expect(result.status).toBe("conflict");
            if (result.status !== "conflict") {
                throw new Error("expected conflict");
            }
            expect(result.destination).toBe(destination);
            expect(result.message).toMatch(/already exists and is not empty/);
            expect(fs.readdirSync(destination)).toEqual(["unrelated.txt"]);
        });

        it("reports an error for a project path that doesn't resolve", async () => {
            const result = await service.preview(path.join(workDir, "does-not-exist"), "tsPackage");

            expect(result.status).toBe("error");
            if (result.status !== "error") {
                throw new Error("expected error");
            }
            expect(result.message).toContain("was not recognized as a POKIE project");
        });
    });

    describe("build", () => {
        it("builds a tsPackage from a blueprint source to the default sibling destination, matching BuildCommand's own default", async () => {
            const blueprintPath = writeBlueprintFile();

            const result = await service.build(blueprintPath, "tsPackage");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.outputPath).toBe(path.join(workDir, "tsPackage"));
            expect(result.sourceType).toBe("blueprint");
            expect(fs.existsSync(path.join(result.outputPath, "package.json"))).toBe(true);
        });

        it("builds to an explicit outDir when given", async () => {
            const blueprintPath = writeBlueprintFile();
            const explicitOut = path.join(workDir, "my-custom-out");

            const result = await service.build(blueprintPath, "tsPackage", explicitOut);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.outputPath).toBe(explicitOut);
        });

        it("builds Blueprint -> Stake through the shared registry and registers the generated Outcome Project", async () => {
            const blueprintPath = writeBlueprintFile();
            const registeredProjects: string[] = [];
            service = new StudioArtifactBuildService("1.3.0", undefined, undefined, (projectRoot) => {
                registeredProjects.push(projectRoot);
                return Promise.resolve();
            });

            const result = await service.build(blueprintPath, "stakeAdapter");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(fs.existsSync(path.join(result.outputPath, "index.json"))).toBe(true);
            expect(registeredProjects).toHaveLength(1);
            expect(fs.existsSync(path.join(registeredProjects[0], "manifest.json"))).toBe(true);
        });

        it("builds Blueprint -> Outcome through the shared registry and registers the opened Outcome Project", async () => {
            const blueprintPath = writeBlueprintFile();
            const registeredProjects: string[] = [];
            service = new StudioArtifactBuildService("1.3.0", undefined, undefined, (projectRoot) => {
                registeredProjects.push(projectRoot);
                return Promise.resolve();
            });

            const result = await service.build(blueprintPath, "outcomeLibrary");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.outputPath).toBe(path.join(workDir, "outcomeLibrary"));
            expect(registeredProjects).toEqual([result.outputPath]);
            expect(fs.existsSync(path.join(result.outputPath, "manifest.json"))).toBe(true);
        });

        it("reports an explicit compatible-project reuse when a Blueprint Outcome request names another destination", async () => {
            const blueprintPath = writeBlueprintFile();
            const firstOutcomeDir = path.join(workDir, "first-outcome");
            const requestedOutcomeDir = path.join(workDir, "requested-but-reused-outcome");

            await expect(service.build(blueprintPath, "outcomeLibrary", firstOutcomeDir)).resolves.toMatchObject({
                status: "ok",
                outputPath: firstOutcomeDir,
            });
            await expect(service.build(blueprintPath, "outcomeLibrary", requestedOutcomeDir)).resolves.toEqual({
                status: "ok",
                target: "outcomeLibrary",
                outputPath: firstOutcomeDir,
                outputKind: "directory",
                sourceType: "blueprint",
                requestedDestinationPath: requestedOutcomeDir,
                reusedCompatibleProject: true,
            });
            expect(fs.existsSync(requestedOutcomeDir)).toBe(false);
        });

        it("uses the same registry Outcome reuse and Stake flow for a real pokie init code-first package", async () => {
            const packageRoot = path.join(workDir, "code-first-package");
            const outcomeDir = path.join(workDir, "outcomes");
            const reusedOutcomeDir = path.join(workDir, "requested-but-reused-outcomes");
            const stakeDir = path.join(workDir, "stake");
            await prepareExactCodeFirstPackage(packageRoot, localPokieDependencyRunner());

            expect(await service.listTargets(packageRoot)).toEqual(expect.arrayContaining([
                expect.objectContaining({target: "outcomeLibrary", supported: true}),
                expect.objectContaining({target: "stakeAdapter", supported: true}),
                expect.objectContaining({target: "parWorkbook", supported: false}),
            ]));
            await expect(service.build(packageRoot, "outcomeLibrary", outcomeDir)).resolves.toMatchObject({
                status: "ok",
                sourceType: "tsPackage",
                outputPath: outcomeDir,
            });
            await expect(service.build(packageRoot, "outcomeLibrary", reusedOutcomeDir)).resolves.toEqual({
                status: "ok",
                target: "outcomeLibrary",
                outputPath: outcomeDir,
                outputKind: "directory",
                sourceType: "tsPackage",
                requestedDestinationPath: reusedOutcomeDir,
                reusedCompatibleProject: true,
            });
            await expect(service.build(packageRoot, "stakeAdapter", stakeDir)).resolves.toMatchObject({
                status: "ok",
                sourceType: "tsPackage",
                outputPath: stakeDir,
            });
            expect(JSON.parse(fs.readFileSync(path.join(outcomeDir, "manifest.json"), "utf-8")).modes).toEqual([
                expect.objectContaining({modeName: "base", betMode: "base", stake: 1}),
                expect.objectContaining({modeName: "ante", betMode: "ante", stake: 2}),
            ]);
            expect(JSON.parse(fs.readFileSync(path.join(stakeDir, "pokie-manifest.json"), "utf-8")).modes).toEqual([
                expect.objectContaining({name: "base", betMode: "base", stake: 1, cost: 1}),
                expect.objectContaining({name: "ante", betMode: "ante", stake: 2, cost: 2}),
            ]);
            await expect(service.build(packageRoot, "parWorkbook", path.join(workDir, "unsupported.xlsx"))).resolves.toEqual(
                expect.objectContaining({
                    status: "unsupported",
                    target: "parWorkbook",
                    message: expect.stringContaining('"parWorkbook" cannot be built from a "tsPackage" project. Supported sources: parWorkbook.'),
                }),
            );
        });

        it("reports a conflict (never writing) for a pre-existing non-empty destination", async () => {
            const blueprintPath = writeBlueprintFile();
            const destination = path.join(workDir, "tsPackage");
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.txt"), "pre-existing");

            const result = await service.build(blueprintPath, "tsPackage");

            expect(result.status).toBe("conflict");
            expect(fs.readdirSync(destination)).toEqual(["unrelated.txt"]);
        });

        it("reports an error for a project path that doesn't resolve", async () => {
            const result = await service.build(path.join(workDir, "does-not-exist"), "tsPackage");

            expect(result.status).toBe("error");
            if (result.status !== "error") {
                throw new Error("expected error");
            }
            expect(result.message).toContain("was not recognized as a POKIE project");
        });

        it("reports a plain error (not a crash) for an invalid blueprint", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint({symbols: []}));

            const result = await service.build(blueprintPath, "tsPackage");

            expect(result.status).toBe("error");
        });
    });

    describe("bounded build jobs", () => {
        it("publishes preflight and running progress before completion, and cancellation reaches the shared builder signal", async () => {
            let releaseBuild: (() => void) | undefined;
            const publishGate = new Promise<void>((resolve) => {
                releaseBuild = resolve;
            });
            const project: PokieProject = {
                type: "blueprint",
                rootPath: path.join(workDir, "blueprint.json"),
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const resolver: ProjectResolving = {resolve: () => Promise.resolve(project)};
            const registry = {
                supportsConversionFrom: () => true,
                build: async (_target: string, _source: PokieProject, _destination: string, options: {signal?: AbortSignal; onProgress?: (progress: unknown) => void}) => {
                    options.onProgress?.({status: "preflight", preflight: {estimatedItemCount: BigInt(12), estimatedBytes: BigInt(34), complexityWarning: "Large publish"}});
                    options.onProgress?.({status: "running", completed: BigInt(1), total: BigInt(12), message: "Writing outcomes"});
                    await publishGate;
                    if (options.signal?.aborted) throw new ArtifactBuildCancelledError();
                    return {outputPath: path.join(workDir, "out")};
                },
            } as unknown as ArtifactBuilderRegistry;
            service = new StudioArtifactBuildService("1.3.0", registry, resolver);

            const started = service.start(project.rootPath, "outcomeLibrary", path.join(workDir, "out"));
            expect(started.status).toBe("queued");
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 0);
            });

            expect(service.getStatusForProject(project.rootPath, started.id)).toMatchObject({
                status: "running",
                progress: {status: "running", completed: "1", total: "12", message: "Writing outcomes"},
            });
            expect(service.getStatusForProject(project.rootPath, started.id)?.progress?.preflight).toEqual({
                estimatedItemCount: "12",
                estimatedBytes: "34",
                complexityWarning: "Large publish",
            });

            expect(service.cancelForProject(project.rootPath, started.id)).toMatchObject({cancellationRequested: true, status: "running"});
            releaseBuild?.();
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 0);
            });
            expect(service.getStatusForProject(project.rootPath, started.id)).toMatchObject({status: "cancelled", result: {status: "cancelled"}});
        });
    });
});
