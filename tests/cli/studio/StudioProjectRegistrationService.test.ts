import type {GameBlueprint, PokieProject, ProjectResolving} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import type {PlatformDirectoryEnvironment} from "../../../cli/paths/PlatformDirectoryEnvironment.js";
import {PokiePathResolver} from "../../../cli/paths/PokiePathResolver.js";
import type {StudioHomeRecentProjectView} from "../../../cli/studio/home/StudioHomeRecentProjectView.js";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {createDefaultStudioProjectRegistrationService, StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";

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
                entry: expect.objectContaining({location: blueprintPath, type: "blueprint", origin: "external", capabilities: ["blueprint.build"]}),
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
