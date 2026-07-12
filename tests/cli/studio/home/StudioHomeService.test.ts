import {GameBlueprint, PokieGame, PokieGameManifest} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {InMemoryRecentProjectsRepository} from "../../../../cli/studio/InMemoryRecentProjectsRepository.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";

function buildBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
    return {
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

function writeBlueprintFile(dir: string, blueprint: unknown): string {
    const filePath = path.join(dir, "blueprint.json");
    fs.writeFileSync(filePath, JSON.stringify(blueprint));
    return filePath;
}

function createFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            throw new Error("not used by these tests");
        },
    };
}

describe("StudioHomeService", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-home-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, {recursive: true, force: true});
    });

    describe("listRecentProjects", () => {
        it("returns an empty list with nothing recorded yet", async () => {
            const service = new StudioHomeService("1.0.0");

            expect(await service.listRecentProjects()).toEqual([]);
        });

        it("marks a project missing: false when its directory and package.json both still exist", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const projectRoot = path.join(tmpDir, "present");
            fs.mkdirSync(projectRoot);
            fs.writeFileSync(path.join(projectRoot, "package.json"), "{}");
            await repository.add({projectRoot, name: "Present", openedAt: "2026-01-01T00:00:00.000Z"});
            const service = new StudioHomeService("1.0.0", repository);

            const entries = await service.listRecentProjects();

            expect(entries).toEqual([{projectRoot, name: "Present", openedAt: "2026-01-01T00:00:00.000Z", missing: false}]);
        });

        it("marks a project missing: true when its directory no longer exists, without removing it", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const projectRoot = path.join(tmpDir, "gone");
            await repository.add({projectRoot, name: "Gone", openedAt: "2026-01-01T00:00:00.000Z"});
            const service = new StudioHomeService("1.0.0", repository);

            const entries = await service.listRecentProjects();

            expect(entries).toEqual([{projectRoot, name: "Gone", openedAt: "2026-01-01T00:00:00.000Z", missing: true}]);
            expect(await repository.list()).toHaveLength(1);
        });

        it("marks a project missing: true when the directory exists but package.json was removed", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const projectRoot = path.join(tmpDir, "no-package-json");
            fs.mkdirSync(projectRoot);
            await repository.add({projectRoot, name: "No package.json", openedAt: "2026-01-01T00:00:00.000Z"});
            const service = new StudioHomeService("1.0.0", repository);

            expect((await service.listRecentProjects())[0].missing).toBe(true);
        });
    });

    describe("createProject", () => {
        it("creates a project via the real GamePackageCreator and records it as a recent project", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const service = new StudioHomeService("1.2.1", repository);

            const result = await service.createProject({destinationDir: tmpDir, name: "crazy-fruits"});

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                return;
            }
            expect(result.manifest).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
            expect(fs.existsSync(path.join(result.projectRoot, "package.json"))).toBe(true);

            const recent = await repository.list();
            expect(recent).toEqual([{projectRoot: result.projectRoot, name: "Crazy Fruits", openedAt: expect.any(String)}]);
        });

        it("resolves a relative destinationDir against the current working directory", async () => {
            const service = new StudioHomeService("1.2.1");
            const relative = path.relative(process.cwd(), tmpDir);

            const result = await service.createProject({destinationDir: relative, name: "crazy-fruits"});

            expect(result.status).toBe("ok");
            if (result.status === "ok") {
                expect(path.isAbsolute(result.projectRoot)).toBe(true);
                expect(fs.existsSync(result.projectRoot)).toBe(true);
            }
        });

        it("applies gameId/gameName/version overrides", async () => {
            const service = new StudioHomeService("1.2.1");

            const result = await service.createProject({
                destinationDir: tmpDir,
                name: "crazy-fruits",
                gameId: "cf",
                gameName: "Crazy Fruits Deluxe",
                version: "2.0.0",
            });

            expect(result.status).toBe("ok");
            if (result.status === "ok") {
                expect(result.manifest).toEqual({id: "cf", name: "Crazy Fruits Deluxe", version: "2.0.0"});
            }
        });

        it("returns a safe error (no stack trace) and records nothing when the destination already exists", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const service = new StudioHomeService("1.2.1", repository);
            fs.mkdirSync(path.join(tmpDir, "crazy-fruits"));

            const result = await service.createProject({destinationDir: tmpDir, name: "crazy-fruits"});

            expect(result).toEqual({status: "error", error: expect.stringContaining("already exists")});
            if (result.status === "error") {
                expect(JSON.stringify(result)).not.toContain("\\n    at ");
            }
            expect(await repository.list()).toEqual([]);
        });
    });

    describe("initProject", () => {
        it("scaffolds an existing npm project and records it as a recent project", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const service = new StudioHomeService("1.2.1", repository);
            fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({name: "crazy-fruits", version: "0.1.0"}));

            const result = await service.initProject({directory: tmpDir});

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                return;
            }
            expect(result.manifest.id).toBe("crazy-fruits");
            expect(fs.existsSync(path.join(tmpDir, "tsconfig.json"))).toBe(true);
            expect(await repository.list()).toHaveLength(1);
        });

        it("resolves a relative directory against the current working directory", async () => {
            const service = new StudioHomeService("1.2.1");
            fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({name: "crazy-fruits"}));
            const relative = path.relative(process.cwd(), tmpDir);

            const result = await service.initProject({directory: relative});

            expect(result.status).toBe("ok");
            if (result.status === "ok") {
                expect(path.isAbsolute(result.projectRoot)).toBe(true);
            }
        });

        it("returns a safe error and records nothing when there is no package.json", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const service = new StudioHomeService("1.2.1", repository);

            const result = await service.initProject({directory: tmpDir});

            expect(result).toEqual({status: "error", error: expect.stringContaining("No \"package.json\" found")});
            expect(await repository.list()).toEqual([]);
        });

        it("reports clear skipped-file conflicts when re-initializing an already-initialized project", async () => {
            const service = new StudioHomeService("1.2.1");
            fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({name: "crazy-fruits"}));
            await service.initProject({directory: tmpDir});

            const second = await service.initProject({directory: tmpDir});

            expect(second.status).toBe("ok");
            if (second.status === "ok") {
                expect(second.skippedFiles).toEqual(expect.arrayContaining(["tsconfig.json", "src/index.ts"]));
            }
        });
    });

    describe("previewBuild", () => {
        it("returns an ok preview with manifest/blueprintHash/expectedFiles for a valid blueprint, without writing anything", () => {
            const service = new StudioHomeService("1.2.1");
            const blueprintPath = writeBlueprintFile(tmpDir, buildBlueprint());

            const preview = service.previewBuild({blueprintPath});

            expect(preview.status).toBe("ok");
            if (preview.status !== "ok") {
                return;
            }
            expect(preview.manifest).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
            expect(preview.reels).toBe(3);
            expect(preview.rows).toBe(3);
            expect(preview.symbolsCount).toBe(2);
            expect(preview.warnings).toEqual([]);
            expect(typeof preview.blueprintHash).toBe("string");
            expect(preview.expectedFiles).toEqual(
                expect.arrayContaining(["package.json", "README.md", "src/generated/index.js", "src/generated/build-info.json"]),
            );
            expect(fs.readdirSync(tmpDir)).toEqual(["blueprint.json"]);
        });

        it("surfaces warnings for a blueprint that is valid but unusual (warnings-only, no errors)", () => {
            const service = new StudioHomeService("1.2.1");
            const blueprintPath = writeBlueprintFile(tmpDir, buildBlueprint({reels: 15}));

            const preview = service.previewBuild({blueprintPath});

            expect(preview.status).toBe("ok");
            if (preview.status === "ok") {
                expect(preview.warnings.length).toBeGreaterThan(0);
                expect(preview.warnings[0].code).toBe("blueprint-reels-suspicious");
            }
        });

        it("returns invalid with errors for a structurally broken blueprint", () => {
            const service = new StudioHomeService("1.2.1");
            const blueprintPath = writeBlueprintFile(tmpDir, buildBlueprint({reels: 0}));

            const preview = service.previewBuild({blueprintPath});

            expect(preview.status).toBe("invalid");
            if (preview.status === "invalid") {
                expect(preview.errors[0].code).toBe("blueprint-reels-invalid");
            }
        });

        it("returns a safe load-error for a missing blueprint file", () => {
            const service = new StudioHomeService("1.2.1");

            const preview = service.previewBuild({blueprintPath: path.join(tmpDir, "does-not-exist.json")});

            expect(preview.status).toBe("load-error");
            if (preview.status === "load-error") {
                expect(JSON.stringify(preview)).not.toContain("\\n    at ");
            }
        });

        it("returns a safe load-error for unparseable JSON", () => {
            const service = new StudioHomeService("1.2.1");
            const blueprintPath = path.join(tmpDir, "broken.json");
            fs.writeFileSync(blueprintPath, "{not valid json");

            const preview = service.previewBuild({blueprintPath});

            expect(preview.status).toBe("load-error");
        });
    });

    describe("buildProject", () => {
        it("generates the package via the real GamePackageGenerator and records it as a recent project", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const service = new StudioHomeService("1.2.1", repository);
            const blueprintPath = writeBlueprintFile(tmpDir, buildBlueprint());

            const result = await service.buildProject({blueprintPath, outDir: path.join(tmpDir, "out")});

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                return;
            }
            expect(result.manifest).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
            expect(fs.existsSync(path.join(result.projectRoot, "src", "generated", "index.js"))).toBe(true);
            expect(await repository.list()).toHaveLength(1);
        });

        it("returns invalid and writes nothing for a structurally broken blueprint", async () => {
            const service = new StudioHomeService("1.2.1");
            const blueprintPath = writeBlueprintFile(tmpDir, buildBlueprint({reels: 0}));
            const outDir = path.join(tmpDir, "out");

            const result = await service.buildProject({blueprintPath, outDir});

            expect(result.status).toBe("invalid");
            expect(fs.existsSync(outDir)).toBe(false);
        });

        it("returns a safe load-error for a missing blueprint file", async () => {
            const service = new StudioHomeService("1.2.1");

            const result = await service.buildProject({blueprintPath: path.join(tmpDir, "missing.json")});

            expect(result.status).toBe("load-error");
        });

        it("refuses to build over a directory containing files pokie build did not generate (safe overwrite)", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const service = new StudioHomeService("1.2.1", repository);
            const blueprintPath = writeBlueprintFile(tmpDir, buildBlueprint());
            const outDir = path.join(tmpDir, "out");
            fs.mkdirSync(outDir, {recursive: true});
            fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({name: "someone-elses-project"}));

            const result = await service.buildProject({blueprintPath, outDir});

            expect(result.status).toBe("error");
            if (result.status === "error") {
                expect(result.error).toContain("did not generate: package.json");
                expect(JSON.stringify(result)).not.toContain("\\n    at ");
            }
            expect(await repository.list()).toEqual([]);
        });

        it("safely rebuilds into a directory previously produced by a build (no conflict)", async () => {
            const service = new StudioHomeService("1.2.1");
            const blueprintPath = writeBlueprintFile(tmpDir, buildBlueprint());
            const outDir = path.join(tmpDir, "out");

            const first = await service.buildProject({blueprintPath, outDir});
            const second = await service.buildProject({blueprintPath, outDir});

            expect(first.status).toBe("ok");
            expect(second.status).toBe("ok");
        });
    });

    describe("openProject", () => {
        it("loads the project, transitions to loaded, and records it as a recent project", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
            const service = new StudioHomeService(
                "1.2.1",
                repository,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                () => Promise.resolve(createFakeGame(manifest)),
            );

            const dashboard = await service.openProject(tmpDir);

            expect(dashboard.status).toBe("loaded");
            if (dashboard.status === "loaded") {
                expect(dashboard.game).toEqual(manifest);
            }
            expect(await repository.list()).toHaveLength(1);
        });

        it("returns a safe error and records nothing when loading fails", async () => {
            const repository = new InMemoryRecentProjectsRepository();
            const service = new StudioHomeService(
                "1.2.1",
                repository,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                () => Promise.reject(new Error("not a pokie game package")),
            );

            const dashboard = await service.openProject(tmpDir);

            expect(dashboard).toEqual({status: "error", projectRoot: path.resolve(tmpDir), error: "not a pokie game package"});
            expect(await repository.list()).toEqual([]);
        });
    });
});
