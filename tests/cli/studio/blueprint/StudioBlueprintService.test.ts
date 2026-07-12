import {GameBlueprint} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {InMemoryRecentProjectsRepository} from "../../../../cli/studio/InMemoryRecentProjectsRepository.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
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

describe("StudioBlueprintService", () => {
    let tmpDir: string;
    let studioRoot: string;
    let homeService: StudioHomeService;
    let repository: InMemoryRecentProjectsRepository;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-blueprint-test-"));
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-blueprint-test-root-"));
        repository = new InMemoryRecentProjectsRepository();
        homeService = new StudioHomeService("1.2.1", repository);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, {recursive: true, force: true});
        fs.rmSync(studioRoot, {recursive: true, force: true});
    });

    function createService(): StudioBlueprintService {
        return new StudioBlueprintService("1.2.1", studioRoot, homeService);
    }

    describe("validate", () => {
        it("returns ok with no warnings for a clean blueprint", () => {
            const service = createService();

            const result = service.validate(buildBlueprint());

            expect(result).toEqual({status: "ok", warnings: []});
        });

        it("returns ok with warnings for a blueprint that is valid but unusual", () => {
            const service = createService();

            const result = service.validate(buildBlueprint({reels: 15}));

            expect(result.status).toBe("ok");
            if (result.status === "ok") {
                expect(result.warnings.length).toBeGreaterThan(0);
                expect(result.warnings[0].code).toBe("blueprint-reels-suspicious");
            }
        });

        it("returns invalid with errors for a structurally broken blueprint", () => {
            const service = createService();

            const result = service.validate(buildBlueprint({reels: 0}));

            expect(result.status).toBe("invalid");
            if (result.status === "invalid") {
                expect(result.errors[0].code).toBe("blueprint-reels-invalid");
            }
        });

        it("never touches the filesystem", () => {
            const service = createService();

            service.validate(buildBlueprint());

            expect(fs.readdirSync(tmpDir)).toEqual([]);
        });
    });

    describe("load", () => {
        function writeBlueprintFile(dir: string, blueprint: unknown): string {
            const filePath = path.join(dir, "blueprint.json");
            fs.writeFileSync(filePath, JSON.stringify(blueprint));
            return filePath;
        }

        it("loads and returns the parsed blueprint", () => {
            const service = createService();
            const blueprintPath = writeBlueprintFile(tmpDir, buildBlueprint());

            const result = service.load(blueprintPath);

            expect(result).toEqual({status: "ok", path: blueprintPath, blueprint: buildBlueprint()});
        });

        it("returns a safe load-error for a missing file", () => {
            const service = createService();

            const result = service.load(path.join(tmpDir, "missing.json"));

            expect(result.status).toBe("load-error");
            if (result.status === "load-error") {
                expect(JSON.stringify(result)).not.toContain("\\n    at ");
            }
        });

        it("returns a safe load-error for unparseable JSON", () => {
            const service = createService();
            const filePath = path.join(tmpDir, "broken.json");
            fs.writeFileSync(filePath, "{not valid json");

            const result = service.load(filePath);

            expect(result.status).toBe("load-error");
        });

        it("rejects a path that resolves inside Studio's own internal directory", () => {
            const service = createService();
            const insidePath = path.join(studioRoot, "index.html");
            fs.writeFileSync(insidePath, "<html></html>");

            const result = service.load(insidePath);

            expect(result.status).toBe("load-error");
            if (result.status === "load-error") {
                expect(result.error).toContain("internal directory");
            }
        });
    });

    describe("save", () => {
        it("writes a new file that doesn't exist yet", () => {
            const service = createService();
            const filePath = path.join(tmpDir, "blueprint.json");

            const result = service.save(filePath, buildBlueprint(), false);

            expect(result).toEqual({status: "ok", path: filePath});
            expect(fs.existsSync(filePath)).toBe(true);
        });

        it("returns conflict and writes nothing when the file already exists and overwrite isn't set", () => {
            const service = createService();
            const filePath = path.join(tmpDir, "blueprint.json");
            fs.writeFileSync(filePath, "existing content");

            const result = service.save(filePath, buildBlueprint(), false);

            expect(result.status).toBe("conflict");
            expect(fs.readFileSync(filePath, "utf-8")).toBe("existing content");
        });

        it("overwrites the file when overwrite is true", () => {
            const service = createService();
            const filePath = path.join(tmpDir, "blueprint.json");
            fs.writeFileSync(filePath, "existing content");

            const result = service.save(filePath, buildBlueprint(), true);

            expect(result).toEqual({status: "ok", path: filePath});
            expect(fs.readFileSync(filePath, "utf-8")).toContain('"crazy-fruits"');
        });

        it("produces a byte-identical file when re-saving unchanged content", () => {
            const service = createService();
            const filePath = path.join(tmpDir, "blueprint.json");

            service.save(filePath, buildBlueprint(), false);
            const firstBytes = fs.readFileSync(filePath);
            service.save(filePath, buildBlueprint(), true);
            const secondBytes = fs.readFileSync(filePath);

            expect(secondBytes.equals(firstBytes)).toBe(true);
        });

        it("rejects a path that resolves inside Studio's own internal directory", () => {
            const service = createService();

            const result = service.save(path.join(studioRoot, "blueprint.json"), buildBlueprint(), true);

            expect(result.status).toBe("error");
            if (result.status === "error") {
                expect(result.error).toContain("internal directory");
            }
            expect(fs.existsSync(path.join(studioRoot, "blueprint.json"))).toBe(false);
        });

        it("returns a safe error (no stack trace) for an fs write failure", () => {
            const service = createService();
            // A directory can't be overwritten by writeFileSync — a reliable way to force fs to throw.
            const asDirectory = path.join(tmpDir, "blueprint.json");
            fs.mkdirSync(asDirectory);

            const result = service.save(asDirectory, buildBlueprint(), true);

            expect(result.status).toBe("error");
            if (result.status === "error") {
                expect(JSON.stringify(result)).not.toContain("\\n    at ");
            }
        });
    });

    describe("previewBuild", () => {
        it("returns an ok preview without writing anything", () => {
            const service = createService();

            const preview = service.previewBuild(buildBlueprint(), undefined, "blueprint.json");

            expect(preview.status).toBe("ok");
            if (preview.status === "ok") {
                expect(preview.manifest).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
                expect(preview.reels).toBe(3);
                expect(typeof preview.blueprintHash).toBe("string");
            }
            expect(fs.readdirSync(tmpDir)).toEqual([]);
        });

        it("returns invalid for a structurally broken blueprint", () => {
            const service = createService();

            const preview = service.previewBuild(buildBlueprint({reels: 0}));

            expect(preview.status).toBe("invalid");
        });
    });

    describe("build", () => {
        it("generates the package via the real GamePackageGenerator and records it as a recent project", async () => {
            const service = createService();
            const outDir = path.join(tmpDir, "out");

            const result = await service.build(buildBlueprint(), outDir);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                return;
            }
            expect(fs.existsSync(path.join(result.projectRoot, "src", "generated", "index.js"))).toBe(true);
            expect(await repository.list()).toHaveLength(1);
        });

        it("returns invalid and writes nothing for a structurally broken blueprint", async () => {
            const service = createService();
            const outDir = path.join(tmpDir, "out");

            const result = await service.build(buildBlueprint({reels: 0}), outDir);

            expect(result.status).toBe("invalid");
            expect(fs.existsSync(outDir)).toBe(false);
        });

        it("returns a safe error and refuses to overwrite a directory with unrelated files (build conflict)", async () => {
            const service = createService();
            const outDir = path.join(tmpDir, "out");
            fs.mkdirSync(outDir, {recursive: true});
            fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({name: "someone-elses-project"}));

            const result = await service.build(buildBlueprint(), outDir);

            expect(result.status).toBe("error");
            if (result.status === "error") {
                expect(result.error).toContain("did not generate: package.json");
                expect(JSON.stringify(result)).not.toContain("\\n    at ");
            }
            expect(await repository.list()).toEqual([]);
        });

        it("safely rebuilds into a directory previously produced by a build (unchanged: true, no conflict)", async () => {
            const service = createService();
            const outDir = path.join(tmpDir, "out");

            const first = await service.build(buildBlueprint(), outDir, "blueprint.json");
            const second = await service.build(buildBlueprint(), outDir, "blueprint.json");

            expect(first.status).toBe("ok");
            expect(second.status).toBe("ok");
            if (second.status === "ok") {
                expect(second.unchanged).toBe(true);
            }
        });

        it("rejects an outDir that resolves inside Studio's own internal directory", async () => {
            const service = createService();

            const result = await service.build(buildBlueprint(), studioRoot);

            expect(result.status).toBe("error");
            if (result.status === "error") {
                expect(result.error).toContain("internal directory");
            }
            expect(await repository.list()).toEqual([]);
        });
    });
});
