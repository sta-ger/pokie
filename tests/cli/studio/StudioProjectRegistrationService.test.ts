import type {GameBlueprint, PokieProject, ProjectResolving} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";

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
});
