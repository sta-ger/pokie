import fs from "fs";
import os from "os";
import path from "path";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {ArtifactBuildCancelledError, ArtifactBuilderRegistry, ManagedOutcomeProjectService, OutcomeLibraryBundleWriter, PROJECT_TYPE_CAPABILITIES, type ArtifactTargetType, type PokieProject, type ProjectResolving, type WeightedOutcomeInput} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";

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
        it("reports the registry-owned Blueprint artifact targets as supported", async () => {
            const blueprintPath = writeBlueprintFile();

            const targets = await service.listTargets(blueprintPath);

            expect(new Set(targets.map((entry) => entry.target))).toEqual(new Set(["blueprint", "tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook"]));
            const byTarget = new Map(targets.map((entry) => [entry.target, entry]));
            expect(byTarget.get("tsPackage")?.supported).toBe(true);
            expect(byTarget.get("outcomeLibrary")?.supported).toBe(true);
            expect(byTarget.get("stakeAdapter")?.supported).toBe(true);
            expect(byTarget.get("parWorkbook")?.supported).toBe(true);
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
            expect(result.plan).toMatchObject({
                status: "unavailable",
                target: {kind: "tsPackage"},
                diagnostic: {code: "unrecognized-source"},
            });
        });

        it("previews Blueprint -> PAR Workbook with its real file destination", async () => {
            const blueprintPath = writeBlueprintFile();

            const result = await service.preview(blueprintPath, "parWorkbook");

            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result).toMatchObject({status: "ok", target: "parWorkbook", sourceType: "blueprint", destination: path.join(workDir, "parWorkbook.xlsx")});
            expect(fs.existsSync(path.join(workDir, "parWorkbook.xlsx"))).toBe(false);
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

        it("builds PAR Blueprints into an explicit nested destination whose parent is absent", async () => {
            const workbookPath = path.join(workDir, "source.xlsx");
            const destination = path.join(workDir, "missing", "blueprints", "imported.blueprint.json");
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);

            const result = await service.build(workbookPath, "blueprint", destination);

            expect(result).toMatchObject({status: "ok", outputPath: destination});
            expect(fs.existsSync(destination)).toBe(true);
            expect(fs.existsSync(`${destination}.conversion-evidence.json`)).toBe(true);
        });

        it("rolls back PAR terminal, durable evidence, generated prerequisite, and registrations when Studio registration fails", async () => {
            const outputPath = path.join(workDir, "package");
            const importedBlueprintPath = path.join(outputPath, ".pokie", "par-import", "imported.blueprint.json");
            const prerequisitePath = path.join(workDir, "generated-outcome");
            const project: PokieProject = {
                type: "parWorkbook",
                rootPath: path.join(workDir, "source.xlsx"),
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "test PAR workbook",
            } as PokieProject;
            fs.writeFileSync(project.rootPath, "source");
            const resolver: ProjectResolving = {resolve: () => Promise.resolve(project)};
            const registry = {
                preparePlan: (_source: PokieProject, target: string) => Promise.resolve({status: "planned", target: {kind: target}, steps: [], preflight: {destinationKind: "directory", estimatedWork: "publish", losses: [], oneWay: false}}),
                executePlan: () => {
                    fs.mkdirSync(outputPath);
                    fs.mkdirSync(path.dirname(importedBlueprintPath), {recursive: true});
                    fs.writeFileSync(path.join(outputPath, "package.json"), "terminal artifact");
                    fs.writeFileSync(importedBlueprintPath, "imported blueprint");
                    fs.writeFileSync(`${importedBlueprintPath}.conversion-evidence.json`, "evidence");
                    fs.mkdirSync(prerequisitePath);
                    return Promise.resolve({
                        outputPath,
                        importedBlueprintPath,
                        conversionEvidencePath: path.join(path.dirname(importedBlueprintPath), "conversion-evidence.json"),
                        prerequisiteProjectRoots: [prerequisitePath],
                        managedProjectRoots: [prerequisitePath],
                    });
                },
            } as unknown as ArtifactBuilderRegistry;
            const unregistered: string[] = [];
            service = new StudioArtifactBuildService(
                "1.3.0",
                registry,
                resolver,
                () => Promise.reject(new Error("registry unavailable")),
                undefined,
                undefined,
                (root) => {
                    unregistered.push(root);
                    return Promise.resolve();
                },
            );

            await expect(service.build(project.rootPath, "tsPackage", outputPath)).resolves.toMatchObject({status: "error"});

            expect(fs.existsSync(outputPath)).toBe(false);
            expect(fs.existsSync(importedBlueprintPath)).toBe(false);
            expect(fs.existsSync(prerequisitePath)).toBe(false);
            expect(unregistered).toEqual(expect.arrayContaining([outputPath, importedBlueprintPath, prerequisitePath]));
        });

        it("releases a generated Blueprint Outcome record when Studio registration fails after the registry has published it", async () => {
            const blueprintPath = writeBlueprintFile();
            const outcomePath = path.join(workDir, "failed-outcomes");
            const unregistered: string[] = [];
            fs.mkdirSync(outcomePath);
            service = new StudioArtifactBuildService(
                "1.3.0",
                undefined,
                undefined,
                () => Promise.reject(new Error("Studio registry unavailable")),
                undefined,
                undefined,
                (projectRoot) => {
                    unregistered.push(projectRoot);
                    return Promise.resolve();
                },
            );

            await expect(service.build(blueprintPath, "outcomeLibrary", outcomePath)).resolves.toMatchObject({
                status: "error",
                message: "Studio registry unavailable",
            });

            expect(fs.existsSync(outcomePath)).toBe(true);
            expect(fs.readdirSync(outcomePath)).toEqual([]);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
            expect(unregistered).toEqual([outcomePath]);
        });

        it("releases a generated Blueprint Stake prerequisite when cancellation arrives during Studio registration", async () => {
            const blueprintPath = writeBlueprintFile();
            const stakePath = path.join(workDir, "cancelled-stake");
            const controller = new AbortController();
            const unregistered: string[] = [];
            service = new StudioArtifactBuildService(
                "1.3.0",
                undefined,
                undefined,
                () => {
                    controller.abort();
                    return Promise.resolve();
                },
                undefined,
                undefined,
                (projectRoot) => {
                    unregistered.push(projectRoot);
                    return Promise.resolve();
                },
            );

            await expect(service.build(blueprintPath, "stakeAdapter", stakePath, {signal: controller.signal})).resolves.toMatchObject({status: "cancelled"});

            expect(fs.existsSync(stakePath)).toBe(false);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
            expect(unregistered).toEqual(expect.arrayContaining([stakePath]));
        });

        it("cancels a real PAR-to-Stake registration without leaving its terminal, evidence, or managed prerequisite behind", async () => {
            const workbookPath = path.join(workDir, "source.xlsx");
            const stakePath = path.join(workDir, "cancelled-par-stake");
            const controller = new AbortController();
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
            fs.mkdirSync(stakePath);
            service = new StudioArtifactBuildService(
                "1.3.0",
                undefined,
                undefined,
                () => {
                    controller.abort();
                    return Promise.resolve();
                },
            );

            await expect(service.build(workbookPath, "stakeAdapter", stakePath, {signal: controller.signal})).resolves.toMatchObject({status: "cancelled"});

            expect(fs.existsSync(workbookPath)).toBe(true);
            expect(fs.readdirSync(stakePath)).toEqual([]);
            expect(fs.existsSync(path.join(stakePath, ".pokie", "par-import", "conversion-evidence.json"))).toBe(false);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
        });

        it.each(["outcomeLibrary", "stakeAdapter"] as const)("removes the Studio Outcome registration when PAR-to-%s is cancelled during promotion", async (target) => {
            const workbookPath = path.join(workDir, "source.xlsx");
            const destination = path.join(workDir, target === "outcomeLibrary" ? "cancelled-outcome" : "cancelled-stake");
            const controller = new AbortController();
            const projectRegistration = new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry());
            const managedOutcomes = new ManagedOutcomeProjectService(
                undefined,
                async (project) => {
                    const registered = await projectRegistration.registerManaged(project.rootPath, path.basename(project.rootPath));
                    if (registered.status !== "ok") throw new Error("Studio registry unavailable");
                },
                undefined,
                (projectRoot) => projectRegistration.remove(projectRoot),
            );
            let registrations = 0;
            const cancellationAfterPromotion = {
                findCompatible: (...args: Parameters<ManagedOutcomeProjectService["findCompatible"]>) => managedOutcomes.findCompatible(...args),
                allocateRoot: (...args: Parameters<ManagedOutcomeProjectService["allocateRoot"]>) => managedOutcomes.allocateRoot(...args),
                release: (...args: Parameters<ManagedOutcomeProjectService["release"]>) => managedOutcomes.release(...args),
                registerAndOpen: async (...args: Parameters<ManagedOutcomeProjectService["registerAndOpen"]>) => {
                    registrations++;
                    const project = await managedOutcomes.registerAndOpen(...args);
                    if (registrations === 2) controller.abort();
                    return project;
                },
            };
            const registry = new ArtifactBuilderRegistry("1.3.0", undefined, cancellationAfterPromotion);
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
            fs.mkdirSync(destination);
            service = new StudioArtifactBuildService("1.3.0", registry);

            await expect(service.build(workbookPath, target, destination, {signal: controller.signal})).resolves.toMatchObject({status: "cancelled"});

            expect(fs.readdirSync(destination)).toEqual([]);
            expect(await projectRegistration.list()).toEqual([]);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
        });

        it("keeps PAR-to-Stake managed and Studio roots durable after successful registration", async () => {
            const workbookPath = path.join(workDir, "source.xlsx");
            const stakePath = path.join(workDir, "par-stake");
            const registeredProjects: string[] = [];
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
            service = new StudioArtifactBuildService("1.3.0", undefined, undefined, (projectRoot) => {
                registeredProjects.push(projectRoot);
                return Promise.resolve();
            });

            const result = await service.build(workbookPath, "stakeAdapter", stakePath);

            expect(result).toMatchObject({status: "ok", importedBlueprintPath: expect.any(String)});
            expect(registeredProjects).toEqual(expect.arrayContaining([stakePath, result.status === "ok" ? result.importedBlueprintPath : ""]));
            expect(registeredProjects.every((projectRoot) => fs.existsSync(projectRoot))).toBe(true);
            const managedRegistryPath = path.join(stakePath, ".pokie", "par-import", ".pokie", "managed-outcome-projects.json");
            expect(fs.existsSync(managedRegistryPath)).toBe(true);
            const managedRegistry = JSON.parse(fs.readFileSync(managedRegistryPath, "utf8")) as {projects: readonly {rootPath: string}[]};
            expect(managedRegistry.projects).toHaveLength(1);
            expect(fs.existsSync(managedRegistry.projects[0].rootPath)).toBe(true);
        });

        it("releases only a republished reused Outcome when Studio registration fails", async () => {
            const blueprintPath = writeBlueprintFile();
            const originalOutcomePath = path.join(workDir, "original-outcome");
            const republishedOutcomePath = path.join(workDir, "republished-outcome");
            await expect(service.build(blueprintPath, "outcomeLibrary", originalOutcomePath)).resolves.toMatchObject({status: "ok"});
            fs.mkdirSync(republishedOutcomePath);
            const failingService = new StudioArtifactBuildService("1.3.0", undefined, undefined, () => Promise.reject(new Error("Studio registry unavailable")));

            await expect(failingService.build(blueprintPath, "outcomeLibrary", republishedOutcomePath)).resolves.toMatchObject({status: "error"});

            expect(fs.existsSync(originalOutcomePath)).toBe(true);
            expect(fs.readdirSync(republishedOutcomePath)).toEqual([]);
            const managedRegistry = JSON.parse(fs.readFileSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"), "utf8")) as {projects: readonly {rootPath: string}[]};
            expect(managedRegistry.projects.map((project) => project.rootPath)).toEqual([originalOutcomePath]);
        });

        it("releases only a republished reused Outcome when Studio registration is cancelled", async () => {
            const blueprintPath = writeBlueprintFile();
            const originalOutcomePath = path.join(workDir, "original-outcome");
            const republishedOutcomePath = path.join(workDir, "republished-outcome");
            const controller = new AbortController();
            await expect(service.build(blueprintPath, "outcomeLibrary", originalOutcomePath)).resolves.toMatchObject({status: "ok"});
            fs.mkdirSync(republishedOutcomePath);
            const cancellingService = new StudioArtifactBuildService("1.3.0", undefined, undefined, () => {
                controller.abort();
                return Promise.resolve();
            });

            await expect(cancellingService.build(blueprintPath, "outcomeLibrary", republishedOutcomePath, {signal: controller.signal})).resolves.toMatchObject({status: "cancelled"});

            expect(fs.existsSync(originalOutcomePath)).toBe(true);
            expect(fs.readdirSync(republishedOutcomePath)).toEqual([]);
            const managedRegistry = JSON.parse(fs.readFileSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"), "utf8")) as {projects: readonly {rootPath: string}[]};
            expect(managedRegistry.projects.map((project) => project.rootPath)).toEqual([originalOutcomePath]);
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

        it("builds an explicit Blueprint Outcome destination even when a compatible managed project exists", async () => {
            const blueprintPath = writeBlueprintFile();
            const firstOutcomeDir = path.join(workDir, "first-outcome");
            const secondOutcomeDir = path.join(workDir, "second-outcome");

            await expect(service.build(blueprintPath, "outcomeLibrary", firstOutcomeDir)).resolves.toMatchObject({
                status: "ok",
                outputPath: firstOutcomeDir,
            });
            await expect(service.build(blueprintPath, "outcomeLibrary", secondOutcomeDir)).resolves.toMatchObject({
                status: "ok",
                target: "outcomeLibrary",
                outputPath: secondOutcomeDir,
                outputKind: "directory",
                sourceType: "blueprint",
                plan: {status: "planned", steps: [expect.objectContaining({kind: "reuseManagedOutcomeLibrary"}), expect.objectContaining({kind: "publish"})]},
            });
            expect(fs.existsSync(path.join(secondOutcomeDir, "manifest.json"))).toBe(true);
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
            expect(result.plan).toMatchObject({
                status: "unavailable",
                target: {kind: "tsPackage"},
                diagnostic: {code: "unrecognized-source"},
            });
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
                preparePlan: (_source: PokieProject, target: string) => Promise.resolve({status: "planned", target: {kind: target}, steps: [], preflight: {destinationKind: "directory", estimatedWork: "publish", losses: [], oneWay: false}}),
                build: async (_target: string, _source: PokieProject, _destination: string, options: {signal?: AbortSignal; onProgress?: (progress: unknown) => void}) => {
                    options.onProgress?.({status: "preflight", preflight: {estimatedItemCount: BigInt(12), estimatedBytes: BigInt(34), complexityWarning: "Large publish"}});
                    options.onProgress?.({status: "running", completed: BigInt(1), total: BigInt(12), message: "Writing outcomes"});
                    await publishGate;
                    if (options.signal?.aborted) throw new ArtifactBuildCancelledError();
                    return {outputPath: path.join(workDir, "out")};
                },
                executePlan: (plan: {target: {kind: ArtifactTargetType}}, source: PokieProject, destination: string, options: {signal?: AbortSignal; onProgress?: (progress: unknown) => void}) => registry.build(plan.target.kind, source, destination, options),
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
            expect(service.getStatusForProject(project.rootPath, started.id)).toMatchObject({
                status: "cancelled",
                result: {status: "cancelled", plan: {status: "planned", target: {kind: "outcomeLibrary"}}},
            });
        });

        it("cancels a running real Outcome publish through the job workflow without publishing output or registering a managed Project", async () => {
            const outputPath = path.join(workDir, "cancelled-outcome-library");
            const managedProjects: string[] = [];
            const project: PokieProject = {
                type: "blueprint",
                rootPath: path.join(workDir, "blueprint.json"),
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const resolver: ProjectResolving = {resolve: () => Promise.resolve(project)};
            const sampleOutcome = firstOutcomeFrom(buildOutcomeLibraryBundleModeInput("base", "cancelled-library").outcomes);
            let publishStarted: (() => void) | undefined;
            const publishing = new Promise<void>((resolve) => {
                publishStarted = resolve;
            });
            async function *cancellableOutcomes(): AsyncIterable<typeof sampleOutcome> {
                for (let index = 0; index < 512; index += 1) {
                    yield {
                        ...sampleOutcome,
                        id: index.toString().padStart(4, "0"),
                        artifact: {...sampleOutcome.artifact, roundId: `cancelled-round-${index}`},
                    };
                }
            }
            const registry = {
                preparePlan: (_source: PokieProject, target: string) => Promise.resolve({status: "planned", target: {kind: target}, steps: [], preflight: {destinationKind: "directory", estimatedWork: "publish", losses: [], oneWay: false}}),
                build: async (_target: string, _source: PokieProject, destination: string, options: {signal?: AbortSignal; onProgress?: (progress: unknown) => void}) => {
                    options.onProgress?.({status: "preflight", preflight: {estimatedItemCount: BigInt(512), estimatedBytes: BigInt(0), complexityWarning: "Large publish"}});
                    let result;
                    try {
                        result = await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(
                            [{...buildOutcomeLibraryBundleModeInput("base", "cancelled-library"), outcomes: cancellableOutcomes()}],
                            destination,
                            {
                                signal: options.signal,
                                onProgress: (progress) => {
                                    options.onProgress?.({status: "running", completed: progress.completed, total: BigInt(512), message: progress.message});
                                    publishStarted?.();
                                },
                            },
                        );
                    } catch (error) {
                        if (options.signal?.aborted) throw new ArtifactBuildCancelledError();
                        throw error;
                    }
                    if (result.manifest === undefined) throw new Error("Expected the real Outcome writer to publish a valid bundle.");
                    return {outputPath: destination, managedProjectRoots: [destination]};
                },
                executePlan: (plan: {target: {kind: ArtifactTargetType}}, source: PokieProject, destination: string, options: {signal?: AbortSignal; onProgress?: (progress: unknown) => void}) => registry.build(plan.target.kind, source, destination, options),
            } as unknown as ArtifactBuilderRegistry;
            service = new StudioArtifactBuildService("1.3.0", registry, resolver, (projectRoot) => {
                managedProjects.push(projectRoot);
                return Promise.resolve();
            });

            const started = service.start(project.rootPath, "outcomeLibrary", outputPath);
            await publishing;
            expect(service.getStatusForProject(project.rootPath, started.id)).toMatchObject({
                status: "running",
                progress: {status: "running", preflight: {estimatedItemCount: "512", complexityWarning: "Large publish"}},
            });

            expect(service.cancelForProject(project.rootPath, started.id)).toMatchObject({status: "running", cancellationRequested: true});
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });

            expect(service.getStatusForProject(project.rootPath, started.id)).toMatchObject({
                status: "cancelled",
                cancellationRequested: true,
                result: {status: "cancelled", plan: {status: "planned", target: {kind: "outcomeLibrary"}}},
            });
            expect(fs.existsSync(outputPath)).toBe(false);
            expect(fs.readdirSync(workDir).filter((entry) => entry.startsWith("cancelled-outcome-library.staging-"))).toEqual([]);
            expect(managedProjects).toEqual([]);
        });
    });
});

function firstOutcomeFrom(outcomes: Iterable<WeightedOutcomeInput<string>> | AsyncIterable<WeightedOutcomeInput<string>>): WeightedOutcomeInput<string> {
    if (!isIterable(outcomes)) {
        throw new Error("Expected an Outcome bundle fixture to be synchronously iterable.");
    }
    const [outcome] = outcomes;
    if (outcome !== undefined) return outcome;
    throw new Error("Expected an Outcome bundle fixture to contain an outcome.");
}

function isIterable<T>(value: Iterable<T> | AsyncIterable<T>): value is Iterable<T> {
    return Symbol.iterator in value;
}
