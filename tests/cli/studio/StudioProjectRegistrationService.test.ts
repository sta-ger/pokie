import {
    computeGameBlueprintHash,
    GameSessionHandling,
    OutcomeLibraryBundleWriter,
    PokieGame,
    type GameBlueprint,
    type PokieProject,
    type ProjectResolving,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import type {PlatformDirectoryEnvironment} from "../../../cli/paths/PlatformDirectoryEnvironment.js";
import {PokiePathResolver} from "../../../cli/paths/PokiePathResolver.js";
import {FileStudioProjectRegistry} from "../../../cli/studio/FileStudioProjectRegistry.js";
import type {StudioHomeRecentProjectView} from "../../../cli/studio/home/StudioHomeRecentProjectView.js";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import type {StudioProjectRegistry} from "../../../cli/studio/StudioProjectRegistry.js";
import type {StudioProjectRegistryEntry} from "../../../cli/studio/StudioProjectRegistryEntry.js";
import {createDefaultStudioProjectRegistrationService, StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {toStudioReplayJobView} from "../../../cli/studio/replay/toStudioReplayJobView.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {StudioSimulationService} from "../../../cli/studio/simulation/StudioSimulationService.js";
import {buildOutcomeLibraryBundleModeInput} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

function fakeResolver(byPath: Record<string, PokieProject>): ProjectResolving {
    return {
        resolve: (targetPath: string) => Promise.resolve(byPath[path.resolve(targetPath)]),
    };
}

function tsPackageProject(rootPath: string): PokieProject {
    return {type: "tsPackage", rootPath: path.resolve(rootPath), capabilities: ["runtime.execute"], provenance: '"package.json" declares a "pokie.entry" field'};
}

function outcomeLibraryProject(rootPath: string): PokieProject {
    return {type: "outcomeLibrary", rootPath: path.resolve(rootPath), capabilities: ["outcomeLibrary.read"], provenance: "recognized outcome-library bundle manifest"};
}

function blueprintProject(rootPath: string): PokieProject {
    return {type: "blueprint", rootPath: path.resolve(rootPath), capabilities: ["blueprint.build"], provenance: "required blueprint fields present"};
}

function wasmProject(rootPath: string): PokieProject {
    return {type: "wasm", rootPath: path.resolve(rootPath), capabilities: ["wasm.manifest.read"], provenance: "compatible POKIE WASM sidecar"};
}

describe("StudioProjectRegistrationService", () => {
    describe("registerManaged", () => {
        it("records an entry with origin \"managed\", the resolved type, and capabilities from the resolver -- never the caller's own assertion", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/projects/sample-slot": tsPackageProject("/projects/sample-slot")});
            const service = new StudioProjectRegistrationService(registry, resolver);

            const result = await service.registerManaged("/projects/sample-slot", "Sample Slot");

            expect(result).toEqual({
                status: "ok",
                entry: expect.objectContaining({
                    location: path.resolve("/projects/sample-slot"),
                    name: "Sample Slot",
                    type: "tsPackage",
                    capabilities: ["runtime.execute"],
                    origin: "managed",
                    status: "ok",
                }),
            });
        });

        it("persists the registration into the underlying registry", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/projects/sample-slot": tsPackageProject("/projects/sample-slot")});
            const service = new StudioProjectRegistrationService(registry, resolver);

            await service.registerManaged("/projects/sample-slot", "Sample Slot");

            expect((await registry.list()).map((e) => e.location)).toEqual([path.resolve("/projects/sample-slot")]);
        });

        it("records the PAR sheet workbook it was Applied/saved from as importedFromParSheetPath when given", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/projects/sample-slot": blueprintProject("/projects/sample-slot/blueprint.json")});
            const service = new StudioProjectRegistrationService(registry, resolver);

            const result = await service.registerManaged("/projects/sample-slot", "Sample Slot", "/games/in.par.xlsx");

            expect(result).toEqual({
                status: "ok",
                entry: expect.objectContaining({origin: "managed", importedFromParSheetPath: "/games/in.par.xlsx"}),
            });
            expect((await registry.list())[0].importedFromParSheetPath).toBe("/games/in.par.xlsx");
        });

        it("omits importedFromParSheetPath entirely for an ordinary first Save with no PAR import behind it", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/projects/sample-slot": tsPackageProject("/projects/sample-slot")});
            const service = new StudioProjectRegistrationService(registry, resolver);

            const result = await service.registerManaged("/projects/sample-slot", "Sample Slot");

            expect(result.status).toBe("ok");
            expect(result.status === "ok" && result.entry.importedFromParSheetPath).toBeUndefined();
        });
    });

    describe("registerExternal", () => {
        it("records an entry with origin \"external\" without copying anything -- the location is the caller's own existing path", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/existing/bundle": outcomeLibraryProject("/existing/bundle")});
            const service = new StudioProjectRegistrationService(registry, resolver);

            const result = await service.registerExternal("/existing/bundle");

            expect(result).toEqual({
                status: "ok",
                entry: expect.objectContaining({
                    location: path.resolve("/existing/bundle"),
                    type: "outcomeLibrary",
                    origin: "external",
                    capabilities: ["outcomeLibrary.read"],
                }),
            });
        });

        it("defaults the name to the resolved path's own basename when none is given", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/existing/my-bundle": outcomeLibraryProject("/existing/my-bundle")});
            const service = new StudioProjectRegistrationService(registry, resolver);

            const result = await service.registerExternal("/existing/my-bundle");

            expect(result.status).toBe("ok");
            expect(result.status === "ok" && result.entry.name).toBe("my-bundle");
        });

        it("strips the file extension from the default name for a file-kind project (blueprint/parWorkbook/wasm)", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/existing/game.json": blueprintProject("/existing/game.json")});
            const service = new StudioProjectRegistrationService(registry, resolver);

            const result = await service.registerExternal("/existing/game.json");

            expect(result.status).toBe("ok");
            expect(result.status === "ok" && result.entry.name).toBe("game");
        });

        it("reports \"unrecognized\" rather than throwing when the path isn't any known POKIE project type", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({});
            const service = new StudioProjectRegistrationService(registry, resolver);

            const result = await service.registerExternal("/not/a/project");

            expect(result).toEqual({status: "unrecognized", path: path.resolve("/not/a/project")});
            expect(await registry.list()).toEqual([]);
        });

        it("re-registering the same location replaces the entry in place rather than duplicating it", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/existing/bundle": outcomeLibraryProject("/existing/bundle")});
            const service = new StudioProjectRegistrationService(registry, resolver);

            await service.registerExternal("/existing/bundle", "First name");
            await service.registerExternal("/existing/bundle", "Second name");

            const list = await registry.list();
            expect(list).toHaveLength(1);
            expect(list[0].name).toBe("Second name");
        });
    });

    describe("previewImport", () => {
        it("resolves and describes a recognized target without registering it", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/existing/bundle": outcomeLibraryProject("/existing/bundle")});
            const service = new StudioProjectRegistrationService(registry, resolver);

            const result = await service.previewImport("/existing/bundle");

            expect(result).toEqual({
                status: "recognized",
                location: path.resolve("/existing/bundle"),
                type: "outcomeLibrary",
                capabilities: ["outcomeLibrary.read"],
                suggestedName: "bundle",
            });
            expect(await registry.list()).toEqual([]);
        });

        it("strips the file extension from the suggested name for a file-kind project (blueprint/parWorkbook/wasm)", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/existing/game.json": blueprintProject("/existing/game.json")});
            const service = new StudioProjectRegistrationService(registry, resolver);

            const result = await service.previewImport("/existing/game.json");

            expect(result.status).toBe("recognized");
            expect(result.status === "recognized" && result.suggestedName).toBe("game");
        });

        it("reports \"unrecognized\" rather than throwing when the path isn't any known POKIE project type", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({});
            const service = new StudioProjectRegistrationService(registry, resolver);

            const result = await service.previewImport("/not/a/project");

            expect(result).toEqual({status: "unrecognized", path: path.resolve("/not/a/project")});
        });
    });

    describe("list", () => {
        it("marks an entry \"missing\" once its location no longer exists on disk, without dropping it", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            await registry.upsert({
                location: "/gone",
                name: "Gone",
                type: "tsPackage",
                capabilities: ["runtime.execute"],
                origin: "managed",
                lastOpenedAt: new Date().toISOString(),
            });
            const service = new StudioProjectRegistrationService(registry, fakeResolver({}), () => false);

            const list = await service.list();

            expect(list).toEqual([expect.objectContaining({location: "/gone", status: "missing"})]);
        });

        it("marks an entry \"ok\" when its location still exists", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            await registry.upsert({
                location: "/present",
                name: "Present",
                type: "tsPackage",
                capabilities: ["runtime.execute"],
                origin: "managed",
                lastOpenedAt: new Date().toISOString(),
            });
            const service = new StudioProjectRegistrationService(registry, fakeResolver({}), () => true);

            const list = await service.list();

            expect(list).toEqual([expect.objectContaining({location: "/present", status: "ok"})]);
        });

        it("refreshes a WASM entry from its current compatible sidecar and marks it unavailable when that contract no longer resolves", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            await registry.upsert({
                location: "/component.wasm",
                name: "Component",
                type: "wasm",
                capabilities: ["wasm.manifest.read"],
                origin: "external",
                lastOpenedAt: new Date().toISOString(),
            });
            const resolver = fakeResolver({"/component.wasm": wasmProject("/component.wasm")});
            const service = new StudioProjectRegistrationService(registry, resolver, () => true);

            expect(await service.list()).toEqual([expect.objectContaining({type: "wasm", capabilities: ["wasm.manifest.read"], status: "ok"})]);
            const unavailable = new StudioProjectRegistrationService(registry, fakeResolver({}), () => true);
            expect(await unavailable.list()).toEqual([expect.objectContaining({status: "unavailable", unavailableReason: expect.stringContaining("compatible sidecar")})]);
        });

        it("retains the resolver's specific malformed WASM sidecar reason on an unavailable entry", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            await registry.upsert({
                location: "/component.wasm",
                name: "Component",
                type: "wasm",
                capabilities: ["wasm.manifest.read"],
                origin: "external",
                lastOpenedAt: new Date().toISOString(),
            });
            const resolver: ProjectResolving = {resolve: () => Promise.reject(new Error("The WASM sidecar is malformed; repair its JSON."))};
            const service = new StudioProjectRegistrationService(registry, resolver, () => true);

            expect(await service.list()).toEqual([
                expect.objectContaining({status: "unavailable", unavailableReason: "The WASM sidecar is malformed; repair its JSON."}),
            ]);
        });
    });

    describe("remove", () => {
        it("removes a registered entry", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/projects/sample-slot": tsPackageProject("/projects/sample-slot")});
            const service = new StudioProjectRegistrationService(registry, resolver);
            await service.registerManaged("/projects/sample-slot", "Sample Slot");

            await service.remove("/projects/sample-slot");

            expect(await registry.list()).toEqual([]);
        });

        it("removes the canonical project when the caller supplies a symlink alias", async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-project-registry-canonical-remove-"));
            try {
                const blueprintPath = path.join(directory, "game.json");
                const aliasPath = path.join(directory, "game-alias.json");
                fs.writeFileSync(
                    blueprintPath,
                    JSON.stringify({manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, reels: 3, rows: 3, symbols: ["A"], paytable: {}}),
                );
                fs.symlinkSync(blueprintPath, aliasPath);
                const registry = new InMemoryStudioProjectRegistry();
                const service = new StudioProjectRegistrationService(registry);

                await service.registerExternal(blueprintPath);
                await service.remove(aliasPath);

                expect(await registry.list()).toEqual([]);
                expect(fs.existsSync(blueprintPath)).toBe(true);
            } finally {
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });
    });

    describe("canonical lifecycle identity", () => {
        it("treats relative, absolute, and symlink spellings as one project record", async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-project-registry-canonical-"));
            try {
                const blueprintPath = path.join(directory, "game.json");
                const aliasPath = path.join(directory, "game-alias.json");
                fs.writeFileSync(
                    blueprintPath,
                    JSON.stringify({manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, reels: 3, rows: 3, symbols: ["A"], paytable: {}}),
                );
                fs.symlinkSync(blueprintPath, aliasPath);
                const service = new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry());

                await service.registerExternal(path.relative(process.cwd(), blueprintPath));
                await service.registerExternal(aliasPath);

                expect(await service.list()).toEqual([expect.objectContaining({location: fs.realpathSync(blueprintPath), name: "game"})]);
            } finally {
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });

        it("relocates a missing record without copying or deleting the moved project", async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-project-registry-relocate-"));
            try {
                const oldPath = path.join(directory, "old.json");
                const newPath = path.join(directory, "new.json");
                fs.writeFileSync(
                    oldPath,
                    JSON.stringify({manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, reels: 3, rows: 3, symbols: ["A"], paytable: {}}),
                );
                const registry = new InMemoryStudioProjectRegistry();
                const service = new StudioProjectRegistrationService(registry);
                await service.registerManaged(oldPath, "My managed game");
                fs.renameSync(oldPath, newPath);

                expect(await service.list()).toEqual([expect.objectContaining({location: oldPath, status: "missing"})]);
                const result = await service.relocate(oldPath, newPath);

                expect(result).toEqual({status: "ok", entry: expect.objectContaining({location: newPath, name: "My managed game", origin: "managed"})});
                expect(await service.list()).toEqual([expect.objectContaining({location: newPath, status: "ok"})]);
                expect(fs.existsSync(newPath)).toBe(true);
            } finally {
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });

        it("records opening an existing managed project without changing its origin", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/projects/sample-slot": tsPackageProject("/projects/sample-slot")});
            const service = new StudioProjectRegistrationService(registry, resolver);
            await service.registerManaged("/projects/sample-slot", "Old name", "/imports/sample.xlsx", "/imports/sample.evidence.json");

            await service.recordOpened("/projects/sample-slot", "Renamed game");

            expect(await registry.list()).toEqual([expect.objectContaining({
                origin: "managed",
                name: "Renamed game",
                importedFromParSheetPath: "/imports/sample.xlsx",
                conversionEvidencePath: "/imports/sample.evidence.json",
            })]);
        });

        it("does not commit a registry entry when superseded during delayed opened-project bookkeeping", async () => {
            const entries: StudioProjectRegistryEntry[] = [];
            let replaceStarted = false;
            let releaseReplace: (() => void) | undefined;
            const registry: StudioProjectRegistry = {
                list: () => Promise.resolve([...entries]),
                upsert: (entry) => {
                    entries.splice(0, entries.length, entry, ...entries.filter((existing) => existing.location !== entry.location));
                    return Promise.resolve();
                },
                replace: async (entry, replacedLocations, options = {}) => {
                    replaceStarted = true;
                    await new Promise<void>((resolve) => {
                        releaseReplace = () => {
                            resolve();
                        };
                    });
                    if (options.isCurrent?.() === false) {
                        return false;
                    }
                    const replaced = new Set(replacedLocations);
                    entries.splice(0, entries.length, entry, ...entries.filter((existing) => !replaced.has(existing.location)));
                    return true;
                },
                remove: (location) => {
                    entries.splice(0, entries.length, ...entries.filter((entry) => entry.location !== location));
                    return Promise.resolve();
                },
            };
            const service = new StudioProjectRegistrationService(registry, fakeResolver({"/projects/sample-slot": tsPackageProject("/projects/sample-slot")}));
            let current = true;

            const recording = service.recordOpened("/projects/sample-slot", "Sample Slot", {isCurrent: () => current});
            for (let attempt = 0; attempt < 20; attempt++) {
                if (replaceStarted) {
                    break;
                }
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }
            expect(replaceStarted).toBe(true);
            current = false;
            releaseReplace?.();

            await expect(recording).rejects.toThrow("Runtime preparation was cancelled");
            expect(entries).toEqual([]);
        });

        it("keeps a concurrent external registration when a current Home open commits through the file registry", async () => {
            const registryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-registration-home-overlap-"));
            try {
                const registry = new FileStudioProjectRegistry(path.join(registryDirectory, "projects.json"));
                const resolver = fakeResolver({
                    "/projects/existing": tsPackageProject("/projects/existing"),
                    "/projects/opening": tsPackageProject("/projects/opening"),
                    "/projects/registered": tsPackageProject("/projects/registered"),
                });
                const service = new StudioProjectRegistrationService(registry, resolver);
                await service.registerExternal("/projects/existing", "Existing");

                const [opened] = await Promise.all([
                    service.recordOpened("/projects/opening", "Opening"),
                    service.registerExternal("/projects/registered", "Registered"),
                ]);

                expect(opened.status).toBe("ok");
                expect((await registry.list()).map((candidate) => candidate.location)).toEqual(expect.arrayContaining([
                    path.resolve("/projects/opening"),
                    path.resolve("/projects/registered"),
                    path.resolve("/projects/existing"),
                ]));
            } finally {
                fs.rmSync(registryDirectory, {recursive: true, force: true});
            }
        });
    });

    describe("resolveShowInFolderTarget", () => {
        it("reveals a directory-kind project's own location", () => {
            const service = new StudioProjectRegistrationService();

            expect(service.resolveShowInFolderTarget({location: "/projects/sample-slot", type: "tsPackage"})).toBe("/projects/sample-slot");
        });

        it("reveals the containing directory for a file-kind project (blueprint/parWorkbook/wasm)", () => {
            const service = new StudioProjectRegistrationService();

            expect(service.resolveShowInFolderTarget({location: "/projects/sample-slot/game.json", type: "blueprint"})).toBe("/projects/sample-slot");
        });
    });

    describe("end-to-end against the real ProjectTargetResolver", () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-project-registration-e2e-"));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        });

        it("registers a real blueprint file by resolving it exactly as pokie build/pokie sim would", async () => {
            const blueprintPath = path.join(tmpDir, "game.json");
            const blueprint: GameBlueprint = {
                manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
            };
            fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));
            const service = new StudioProjectRegistrationService();

            const result = await service.registerExternal(blueprintPath);

            expect(result).toEqual({
                status: "ok",
                entry: expect.objectContaining({
                    location: blueprintPath,
                    type: "blueprint",
                    origin: "external",
                    capabilities: ["blueprint.build", "outcomeLibrary.generate", "stakeAdapter.export"],
                }),
            });
        });

        it("reports \"unrecognized\" for a real path that resolves to no known project type", async () => {
            const unrelatedFile = path.join(tmpDir, "notes.txt");
            fs.writeFileSync(unrelatedFile, "just some notes");
            const service = new StudioProjectRegistrationService();

            const result = await service.registerExternal(unrelatedFile);

            expect(result).toEqual({status: "unrecognized", path: unrelatedFile});
        });
    });

    describe("createDefaultStudioProjectRegistrationService", () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-project-registration-default-"));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        });

        it("backs the service with a FileStudioProjectRegistry at the resolved app-data directory -- registrations survive a Studio restart", async () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {XDG_CONFIG_HOME: path.join(tmpDir, "xdg-config")}, homeDir: tmpDir};
            const resolver = new PokiePathResolver({}, env);
            const blueprintPath = path.join(tmpDir, "game.json");
            const blueprint: GameBlueprint = {
                manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
            };
            fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));

            const firstStudioProcess = createDefaultStudioProjectRegistrationService(resolver);
            await firstStudioProcess.registerExternal(blueprintPath);

            // A fresh instance built the same way -- simulating Studio restarting as a brand-new
            // process -- must see the same registration purely by reading the shared app-data file.
            const secondStudioProcess = createDefaultStudioProjectRegistrationService(resolver);
            const list = await secondStudioProcess.list();

            expect(list).toEqual([expect.objectContaining({location: blueprintPath, type: "blueprint"})]);
        });

        it("falls back to a process-lifetime registry, without throwing, when no app-data directory can be resolved", async () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: ""};
            const resolver = new PokiePathResolver({}, env);
            expect(resolver.resolveAppDataDirectory()).toBeUndefined();
            const blueprintPath = path.join(tmpDir, "game.json");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, reels: 3, rows: 3, symbols: ["A"], paytable: {}}),
            );

            const service = createDefaultStudioProjectRegistrationService(resolver);
            const result = await service.registerExternal(blueprintPath);

            expect(result.status).toBe("ok");
            // A second instance built the same (unresolvable) way never shares state with the first --
            // proving the fallback is a fresh in-memory registry each time, not some other hidden
            // persisted location.
            const anotherService = createDefaultStudioProjectRegistrationService(resolver);
            expect(await anotherService.list()).toEqual([]);
        });
    });

    describe("migrateRecentProjects", () => {
        function recent(projectRoot: string, missing = false): StudioHomeRecentProjectView {
            return {projectRoot, name: path.basename(projectRoot), openedAt: new Date().toISOString(), missing};
        }

        it("registers each non-missing recent project through the resolver, skipping missing entries entirely", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolveFn = jest.fn((targetPath: string) =>
                Promise.resolve(path.resolve(targetPath) === path.resolve("/projects/a") ? tsPackageProject("/projects/a") : undefined),
            );
            const service = new StudioProjectRegistrationService(registry, {resolve: resolveFn});

            await service.migrateRecentProjects([recent("/projects/a"), recent("/projects/gone", true)]);

            expect(resolveFn).not.toHaveBeenCalledWith(expect.stringContaining("gone"));
            expect((await registry.list()).map((e) => e.location)).toEqual([path.resolve("/projects/a")]);
        });

        it("tolerates an unrecognized recent-project path without throwing", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const service = new StudioProjectRegistrationService(registry, fakeResolver({}));

            await expect(service.migrateRecentProjects([recent("/projects/not-a-project")])).resolves.toBeUndefined();
            expect(await registry.list()).toEqual([]);
        });

        it("tolerates a resolver throwing for one entry without stopping the rest of the migration", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver: ProjectResolving = {
                resolve: (targetPath: string) => {
                    if (path.resolve(targetPath) === path.resolve("/projects/bad.wasm")) {
                        return Promise.reject(new Error("unsupported"));
                    }
                    return Promise.resolve(path.resolve(targetPath) === path.resolve("/projects/a") ? tsPackageProject("/projects/a") : undefined);
                },
            };
            const service = new StudioProjectRegistrationService(registry, resolver);

            await service.migrateRecentProjects([recent("/projects/bad.wasm"), recent("/projects/a")]);

            expect((await registry.list()).map((e) => e.location)).toEqual([path.resolve("/projects/a")]);
        });

        it("is idempotent -- migrating the same recent projects twice never creates duplicate registry entries", async () => {
            const registry = new InMemoryStudioProjectRegistry();
            const resolver = fakeResolver({"/projects/a": tsPackageProject("/projects/a")});
            const service = new StudioProjectRegistrationService(registry, resolver);
            const recentProjects = [recent("/projects/a")];

            await service.migrateRecentProjects(recentProjects);
            await service.migrateRecentProjects(recentProjects);

            expect((await registry.list()).map((e) => e.location)).toEqual([path.resolve("/projects/a")]);
        });
    });
});

// The registry lifecycle above deliberately stays independent of Blueprint persistence. These focused
// save tests sit beside it because both paths begin with the same Project-open snapshot: a Project's
// configuration hash is the optimistic-concurrency token that prevents a second tab or a disk editor
// from replacing the newer registered Project source.
describe("Studio Blueprint Project save conflicts", () => {
    function createService(studioRoot: string): StudioBlueprintService {
        return new StudioBlueprintService("1.0.0", studioRoot, new StudioHomeService("1.0.0"));
    }

    it("never lets a stale Studio tab overwrite a newer Blueprint save", () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-blueprint-stale-tab-"));
        try {
            const filePath = path.join(directory, "game.json");
            const initial = {manifest: {id: "game"}, rows: 3};
            const firstTabEdit = {manifest: {id: "game"}, rows: 4};
            const staleTabEdit = {manifest: {id: "game"}, rows: 5};
            fs.writeFileSync(filePath, JSON.stringify(initial));
            const service = createService(path.join(directory, "studio"));

            const firstSnapshot = service.load(filePath);
            const staleSnapshot = service.load(filePath);
            expect(firstSnapshot.status).toBe("ok");
            expect(staleSnapshot.status).toBe("ok");
            if (firstSnapshot.status !== "ok" || staleSnapshot.status !== "ok") {
                throw new Error("Expected initial Blueprint snapshots to load.");
            }

            expect(service.save(filePath, firstTabEdit, true, firstSnapshot.blueprintHash).status).toBe("ok");
            const result = service.save(filePath, staleTabEdit, true, staleSnapshot.blueprintHash);

            expect(result).toMatchObject({
                status: "conflict",
                reason: "stale",
                currentBlueprint: firstTabEdit,
                currentHash: computeGameBlueprintHash(firstTabEdit),
                editedBlueprint: staleTabEdit,
                editedHash: computeGameBlueprintHash(staleTabEdit),
                expectedHash: staleSnapshot.blueprintHash,
                canSaveAs: true,
            });
            expect(JSON.parse(fs.readFileSync(filePath, "utf-8"))).toEqual(firstTabEdit);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("never lets a save overwrite a Blueprint edited externally after it was loaded", () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-blueprint-external-edit-"));
        try {
            const filePath = path.join(directory, "game.json");
            const initial = {manifest: {id: "game"}, rows: 3};
            const externalEdit = {manifest: {id: "game"}, rows: 4};
            const editorDraft = {manifest: {id: "game"}, rows: 5};
            fs.writeFileSync(filePath, JSON.stringify(initial));
            const service = createService(path.join(directory, "studio"));
            const loaded = service.load(filePath);
            expect(loaded.status).toBe("ok");
            if (loaded.status !== "ok") {
                throw new Error("Expected initial Blueprint to load.");
            }

            fs.writeFileSync(filePath, JSON.stringify(externalEdit));
            const result = service.save(filePath, editorDraft, true, loaded.blueprintHash);

            expect(result).toMatchObject({
                status: "conflict",
                reason: "stale",
                currentBlueprint: externalEdit,
                currentHash: computeGameBlueprintHash(externalEdit),
                editedBlueprint: editorDraft,
                editedHash: computeGameBlueprintHash(editorDraft),
                expectedHash: loaded.blueprintHash,
                canSaveAs: true,
            });
            expect(JSON.parse(fs.readFileSync(filePath, "utf-8"))).toEqual(externalEdit);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("publishes the new persisted configuration hash for the next Project execution snapshot", () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-blueprint-execution-freshness-"));
        try {
            const filePath = path.join(directory, "game.json");
            const prior = {manifest: {id: "game"}, rows: 3};
            const saved = {manifest: {id: "game"}, rows: 4};
            fs.writeFileSync(filePath, JSON.stringify(prior));
            const service = createService(path.join(directory, "studio"));
            const loaded = service.load(filePath);
            expect(loaded.status).toBe("ok");
            if (loaded.status !== "ok") {
                throw new Error("Expected initial Blueprint to load.");
            }

            expect(service.save(filePath, saved, true, loaded.blueprintHash)).toEqual({
                status: "ok",
                path: filePath,
                blueprintHash: computeGameBlueprintHash(saved),
            });
            expect(service.load(filePath)).toEqual({status: "ok", path: filePath, blueprint: saved, blueprintHash: computeGameBlueprintHash(saved)});
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("retains a replay's original configuration hash after a later Blueprint save", () => {
        const originalConfigurationHash = computeGameBlueprintHash({manifest: {id: "game"}, rows: 3});
        const replay = toStudioReplayJobView({
            id: "replay-1",
            projectRoot: "/projects/game.json",
            status: "completed",
            round: 1,
            startedAt: 0,
            completedRounds: 1,
            durationMs: 1,
            game: {id: "game", name: "Game", version: "1.0.0"},
            configHash: originalConfigurationHash,
            abortController: new AbortController(),
        });

        expect(replay.configHash).toBe(originalConfigurationHash);
        expect(replay.configHash).not.toBe(computeGameBlueprintHash({manifest: {id: "game"}, rows: 4}));
    });
});

describe("Studio Blueprint Project execution freshness", () => {
    it("opens a managed Blueprint, then executes and materializes its saved configuration instead of the earlier dashboard snapshot", async () => {
        const version = "1.3.0";
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-blueprint-project-execution-"));
        const studioRoot = path.join(directory, "studio");
        const blueprintPath = path.join(directory, "blueprint.json");
        const configurationA = {manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}, configuration: "A"};
        const configurationB = {...configurationA, configuration: "B"};
        const configurationAHash = computeGameBlueprintHash(configurationA);
        const configurationBHash = computeGameBlueprintHash(configurationB);
        const configurations = new Map([
            [configurationAHash, configurationA],
            [configurationBHash, configurationB],
        ]);
        let server: StudioServer | undefined;

        const createGame = (configurationHash: string): PokieGame => {
            const configuration = configurations.get(configurationHash);
            if (configuration === undefined) {
                throw new Error(`Unknown materialized configuration "${configurationHash}".`);
            }
            return {
                getManifest: () => ({...configuration.manifest, name: `${configuration.manifest.name} ${configuration.configuration}`}),
                getConfigHash: () => configurationHash,
                createSession: () => {
                    let credits = 100;
                    return {
                        getCreditsAmount: () => credits,
                        setCreditsAmount: (value: number) => {
                            credits = value;
                        },
                        getBet: () => 1,
                        setBet: () => undefined,
                        getAvailableBets: () => [1],
                        canPlayNextGame: () => true,
                        play: () => {
                            credits -= 1;
                        },
                        getWinAmount: () => 0,
                    } as GameSessionHandling;
                },
            };
        };

        const materializedHashes: string[] = [];
        const resolveRuntimePackageRoot = (projectRoot: string) => {
            expect(path.resolve(projectRoot)).toBe(blueprintPath);
            const currentBlueprint = JSON.parse(fs.readFileSync(blueprintPath, "utf-8"));
            const configurationHash = computeGameBlueprintHash(currentBlueprint);
            materializedHashes.push(configurationHash);
            return Promise.resolve({runtimePath: `materialized:${configurationHash}`, release: () => Promise.resolve()});
        };
        const loadGame = (runtimePath: string): Promise<PokieGame> => Promise.resolve(createGame(runtimePath.replace("materialized:", "")));

        async function get(url: string): Promise<{status: number; body: Record<string, unknown>}> {
            const response = await fetch(url);
            return {status: response.status, body: (await response.json()) as Record<string, unknown>};
        }

        async function post(url: string, body: unknown): Promise<{status: number; body: Record<string, unknown>}> {
            const response = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
            return {status: response.status, body: (await response.json()) as Record<string, unknown>};
        }

        async function waitForTerminal(url: string): Promise<Record<string, unknown>> {
            for (let attempt = 0; attempt < 200; attempt++) {
                const response = await get(url);
                if (response.body.status !== "queued" && response.body.status !== "running") {
                    return response.body;
                }
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }
            throw new Error(`Timed out waiting for ${url}.`);
        }

        try {
            fs.mkdirSync(studioRoot, {recursive: true});
            fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
            fs.writeFileSync(path.join(studioRoot, "main.js"), "console.log('studio');");
            fs.writeFileSync(path.join(studioRoot, "style.css"), "body {}");
            fs.writeFileSync(blueprintPath, JSON.stringify(configurationA));

            // This is a canonical Outcome Library genuinely written before the save. The fixture's
            // outcomes predate configuration hashes, so stamp its manifest with the source hash A.
            const bundleDir = path.join(directory, "outcomelibrary");
            await new OutcomeLibraryBundleWriter(version).writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
            const bundleManifestPath = path.join(bundleDir, "manifest.json");
            const bundleManifest = JSON.parse(fs.readFileSync(bundleManifestPath, "utf-8")) as Record<string, unknown>;
            fs.writeFileSync(bundleManifestPath, JSON.stringify({...bundleManifest, configHash: configurationAHash}));

            const registration = new StudioProjectRegistrationService(
                new InMemoryStudioProjectRegistry(),
                fakeResolver({[blueprintPath]: blueprintProject(blueprintPath)}),
            );
            await registration.registerManaged(blueprintPath, "Sample Slot");

            let previewedConfiguration: string | undefined;
            const artifactBuildService = new StudioArtifactBuildService(version, undefined, {
                resolve: (projectRoot) => {
                    const currentBlueprint = JSON.parse(fs.readFileSync(projectRoot, "utf-8")) as {configuration: string};
                    previewedConfiguration = currentBlueprint.configuration;
                    return Promise.resolve(blueprintProject(projectRoot));
                },
            });
            const homeService = new StudioHomeService(version, undefined, loadGame, undefined, resolveRuntimePackageRoot);
            server = new StudioServer({
                pokieVersion: version,
                host: "127.0.0.1",
                port: 0,
                studioRoot,
                homeService,
                blueprintService: new StudioBlueprintService(version, studioRoot, homeService),
                loadGame,
                resolveRuntimePackageRoot,
                projectRegistrationService: registration,
                artifactBuildService,
            });
            const address = await server.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const opened = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: blueprintPath});
            expect(opened.status).toBe(200);
            expect((opened.body.manifest as {name: string}).name).toBe("Sample Slot A");

            const replayCreated = await post(`${baseUrl}/api/project/replays`, {round: 2, seed: "before-save"});
            expect(replayCreated.status).toBe(202);
            const replayBeforeSave = await waitForTerminal(`${baseUrl}/api/project/replays/${replayCreated.body.id}`);
            expect(replayBeforeSave.configHash).toBe(configurationAHash);

            const saved = await post(`${baseUrl}/api/home/blueprints/save`, {
                path: blueprintPath,
                blueprint: configurationB,
                overwrite: true,
                expectedHash: configurationAHash,
            });
            expect(saved.status).toBe(201);
            expect(saved.body.blueprintHash).toBe(configurationBHash);

            const play = await post(`${baseUrl}/api/project/play/session`, {});
            expect(play.status).toBe(201);
            expect(((play.body.session as {game: {name: string}}).game.name)).toBe("Sample Slot B");

            const simulationCreated = await post(`${baseUrl}/api/project/simulations`, {rounds: 2});
            expect(simulationCreated.status).toBe(202);
            const simulation = await waitForTerminal(`${baseUrl}/api/project/simulations/${simulationCreated.body.id}`);
            expect(((simulation.report as {game: {name: string}}).game.name)).toBe("Sample Slot B");

            const buildPreview = await post(`${baseUrl}/api/project/artifacts/preview`, {target: "tsPackage"});
            expect(buildPreview.status).toBe(200);
            expect(buildPreview.body.status).toBe("ok");
            expect(previewedConfiguration).toBe("B");

            const registry = await get(`${baseUrl}/api/project/outcome-libraries/registry`);
            expect(registry.status).toBe(200);
            expect(registry.body.buildStatus).toBe("stale");
            expect(registry.body.configHash).toBe(configurationAHash);

            const stakeExport = await post(`${baseUrl}/api/project/stakeengine/export`, {
                modes: [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}, cost: 1}],
                outDir: "stakeengine",
            });
            expect(stakeExport.status).toBe(410);
            expect(stakeExport.body.status).toBe("migration");

            const replayAfterSave = await get(`${baseUrl}/api/project/replays/${replayCreated.body.id}`);
            expect(replayAfterSave.body.configHash).toBe(configurationAHash);
            expect(materializedHashes).toContain(configurationBHash);
        } finally {
            await server?.stop();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });
});

describe("Studio Project runtime state isolation", () => {
    it("keeps sessions and failed run state behind the canonical Project opened by A → B → A navigation", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-project-runtime-isolation-"));
        const studioRoot = path.join(directory, "studio");
        const projectA = path.join(directory, "project-a");
        const projectB = path.join(directory, "project-b");
        let server: StudioServer | undefined;

        const gameFor = (projectRoot: string): PokieGame => {
            const name = path.resolve(projectRoot) === projectA ? "Project A" : "Project B";
            return {
                getManifest: () => ({id: name.toLowerCase().replace(" ", "-"), name, version: "0.1.0"}),
                createSession: () => {
                    let credits = 100;
                    return {
                        getCreditsAmount: () => credits,
                        setCreditsAmount: (value: number) => {
                            credits = value;
                        },
                        getBet: () => 1,
                        setBet: () => undefined,
                        getAvailableBets: () => [1],
                        canPlayNextGame: () => true,
                        play: () => {
                            credits -= 1;
                        },
                        getWinAmount: () => 0,
                    } as GameSessionHandling;
                },
            };
        };
        const loadGame = (projectRoot: string): Promise<PokieGame> => Promise.resolve(gameFor(projectRoot));
        const passthroughRuntime = (projectRoot: string) => Promise.resolve({runtimePath: projectRoot, release: () => Promise.resolve()});

        async function get(url: string): Promise<{status: number; body: Record<string, unknown>}> {
            const response = await fetch(url);
            return {status: response.status, body: (await response.json()) as Record<string, unknown>};
        }

        async function post(url: string, body: unknown): Promise<{status: number; body: Record<string, unknown>}> {
            const response = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
            return {status: response.status, body: (await response.json()) as Record<string, unknown>};
        }

        try {
            fs.mkdirSync(studioRoot, {recursive: true});
            fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
            fs.writeFileSync(path.join(studioRoot, "main.js"), "console.log('studio');");
            fs.writeFileSync(path.join(studioRoot, "style.css"), "body {}");

            const registration = new StudioProjectRegistrationService(
                new InMemoryStudioProjectRegistry(),
                fakeResolver({[projectA]: tsPackageProject(projectA), [projectB]: tsPackageProject(projectB)}),
            );
            const homeService = new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntime);
            const simulationService = new StudioSimulationService(undefined, () => Promise.reject(new Error("Project A run failed.")));
            server = new StudioServer({
                pokieVersion: "1.0.0",
                host: "127.0.0.1",
                port: 0,
                studioRoot,
                homeService,
                blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
                loadGame,
                resolveRuntimePackageRoot: passthroughRuntime,
                projectRegistrationService: registration,
                simulationService,
            });
            const address = await server.start();
            const baseUrl = `http://${address.host}:${address.port}`;

            const openedA = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: projectA});
            expect(openedA.status).toBe(200);
            expect((openedA.body.context as {projectRoot: string}).projectRoot).toBe(projectA);

            const aSession = await post(`${baseUrl}/api/project/play/session`, {});
            expect(aSession.status).toBe(201);
            const aSessionId = (aSession.body.session as {sessionId: string}).sessionId;
            expect((await post(`${baseUrl}/api/project/play/sessions/${aSessionId}/spin`, {})).status).toBe(200);

            const aSimulation = await post(`${baseUrl}/api/project/simulations`, {rounds: 1});
            expect(aSimulation.status).toBe(202);
            const aSimulationId = aSimulation.body.id as string;
            let failedRun: Record<string, unknown> | undefined;
            for (let attempt = 0; attempt < 20; attempt++) {
                const status = await get(`${baseUrl}/api/project/simulations/${aSimulationId}`);
                if (status.body.status === "failed") {
                    failedRun = status.body;
                    break;
                }
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }
            expect(failedRun).toMatchObject({status: "failed", error: "Project A run failed."});

            const openedB = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: projectB});
            expect(openedB.status).toBe(200);
            expect((openedB.body.context as {projectRoot: string}).projectRoot).toBe(projectB);
            expect((await get(`${baseUrl}/api/project/rounds`)).body).toEqual([]);
            expect((await get(`${baseUrl}/api/project/simulations/${aSimulationId}`)).status).toBe(404);
            expect((await post(`${baseUrl}/api/project/play/sessions/${aSessionId}/spin`, {})).status).toBe(404);

            const bSession = await post(`${baseUrl}/api/project/play/session`, {});
            expect(bSession.status).toBe(201);
            expect(((bSession.body.session as {game: {name: string}}).game.name)).toBe("Project B");

            const reopenedA = await post(`${baseUrl}/api/home/projects/open`, {projectRoot: projectA});
            expect(reopenedA.status).toBe(200);
            // Run history persists by its owning Project, while Play sessions intentionally do not.
            expect((await get(`${baseUrl}/api/project/simulations/${aSimulationId}`)).body).toMatchObject({status: "failed", error: "Project A run failed."});
            expect((await post(`${baseUrl}/api/project/play/sessions/${aSessionId}/spin`, {})).status).toBe(404);
        } finally {
            await server?.stop();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });
});
