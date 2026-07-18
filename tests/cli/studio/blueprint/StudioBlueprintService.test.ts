import {computeGameBlueprintHash, GameBlueprint, ParSheetExporting, ParSheetImporting, resolveReelStripGeneration, ValidationIssue} from "pokie";
import ExcelJS from "exceljs";
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

    describe("previewReelStripGeneration", () => {
        it("returns ok with an empty reels list when the blueprint has no reelStripGeneration", () => {
            const service = createService();

            const result = service.previewReelStripGeneration(buildBlueprint());

            expect(result).toEqual({status: "ok", errors: [], warnings: [], reels: []});
        });

        it("surfaces a structurally broken blueprint's errors but still resolves reelStripGeneration (unrelated errors never block the preview)", () => {
            const service = createService();
            const blueprint = buildBlueprint({
                // "reels: 0" is invalid on its own, but has nothing to do with reelStripGeneration --
                // and reelStripGeneration itself here is perfectly well-formed.
                reels: 0,
                reelStripGeneration: [{type: "literal", strip: ["A", "B"]}],
            });

            const result = service.previewReelStripGeneration(blueprint);

            expect(result.status).toBe("ok");
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.some((issue) => issue.code === "blueprint-reels-invalid")).toBe(true);
            expect(result.reels).toEqual([{reelIndex: 0, type: "literal", strip: ["A", "B"], analysis: expect.anything()}]);
        });

        it("resolves every well-formed reel and simply omits a reel whose reelStripGeneration entry isn't even an object", () => {
            const service = createService();
            const blueprint = buildBlueprint({
                reels: 3,
                reelStripGeneration: [{type: "literal", strip: ["A", "B"]}, null, {type: "literal", strip: ["B", "A"]}] as unknown as GameBlueprint["reelStripGeneration"],
            });

            const result = service.previewReelStripGeneration(blueprint);

            expect(result.status).toBe("ok");
            expect(result.reels.map((reel) => reel.reelIndex)).toEqual([0, 2]);
        });

        it("resolves every well-formed reel even when another reel's own config is unsatisfiable (mixed valid/invalid reels)", () => {
            const service = createService();
            const blueprint = buildBlueprint({
                reels: 3,
                reelStripGeneration: [
                    {type: "literal", strip: ["A", "B"]},
                    {
                        type: "generated",
                        length: 4,
                        symbolCounts: {A: 2, B: 2},
                        seed: 1,
                        maxAttempts: 3,
                        constraints: [{type: "maximumCircularDistance", maximumDistance: 1, symbolIds: ["A"]}],
                    },
                    {type: "literal", strip: ["B", "A"]},
                ],
            });

            const result = service.previewReelStripGeneration(blueprint);

            expect(result.status).toBe("ok");
            expect(result.reels).toHaveLength(3);
            expect(result.reels[0].type).toBe("literal");
            expect(result.reels[1]).toMatchObject({reelIndex: 1, type: "generated", success: false});
            expect(result.reels[2].type).toBe("literal");
        });

        it("resolves both flanking generated reels independently when the generated reel between them throws while being resolved", () => {
            // Real ReelStripGenerator/resolveReelStripGeneration are defensive enough that a genuinely
            // crash-inducing malformed config is hard to construct against them -- this injects a fake
            // resolver that throws specifically for reel 1's own seed (mirroring what a pathological
            // config could in principle do), while delegating to the real implementation for every
            // other reel, to directly prove the isolation: reel 1's own crash never reaches reels 0/2.
            const throwingResolver: typeof resolveReelStripGeneration = (blueprint, generator) => {
                const spec = blueprint.reelStripGeneration?.[0];
                if (spec !== undefined && spec.type === "generated" && spec.seed === 999) {
                    throw new Error("simulated crash deep inside ReelStripGenerator for reel 1");
                }
                return resolveReelStripGeneration(blueprint, generator);
            };
            const service = new StudioBlueprintService(
                "1.2.1",
                studioRoot,
                homeService,
                undefined,
                undefined,
                undefined,
                throwingResolver,
            );
            const blueprint = buildBlueprint({
                reels: 3,
                reelStripGeneration: [
                    {type: "generated", length: 2, symbolCounts: {A: 1, B: 1}, seed: 1},
                    {type: "generated", length: 2, symbolCounts: {A: 1, B: 1}, seed: 999},
                    {type: "generated", length: 2, symbolCounts: {A: 1, B: 1}, seed: 7},
                ],
            });

            const result = service.previewReelStripGeneration(blueprint);

            expect(result.status).toBe("ok");
            expect(result.reels).toHaveLength(3);
            expect(result.reels[0]).toMatchObject({reelIndex: 0, type: "generated", success: true});
            expect(result.reels[1]).toMatchObject({reelIndex: 1, type: "generated", success: false, attemptsUsed: 0, diagnostics: []});
            expect(result.reels[2]).toMatchObject({reelIndex: 2, type: "generated", success: true});
        });

        it("resolves a mix of literal and generated reels, reporting each reel's exact strip and symbol-count analysis", () => {
            const service = createService();
            const blueprint = buildBlueprint({
                reelStripGeneration: [
                    {type: "literal", strip: ["A", "B"]},
                    {type: "generated", length: 2, symbolCounts: {A: 1, B: 1}, seed: 1},
                    {type: "literal", strip: ["B", "A"]},
                ],
            });

            const result = service.previewReelStripGeneration(blueprint);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                return;
            }
            expect(result.reels).toHaveLength(3);
            expect(result.reels[0]).toEqual({
                reelIndex: 0,
                type: "literal",
                strip: ["A", "B"],
                analysis: expect.objectContaining({length: 2, symbolCounts: {A: 1, B: 1}}),
            });
            expect(result.reels[2]).toEqual({
                reelIndex: 2,
                type: "literal",
                strip: ["B", "A"],
                analysis: expect.objectContaining({length: 2, symbolCounts: {B: 1, A: 1}}),
            });

            const generated = result.reels[1];
            expect(generated.type).toBe("generated");
            if (generated.type !== "generated" || !generated.success) {
                throw new Error("expected reel 1 to succeed");
            }
            expect(generated.strip).toHaveLength(2);
            expect(generated.analysis.symbolCounts).toEqual({A: 1, B: 1});
        });

        it("reports a generated reel's failure (unsatisfiable constraints) with diagnostics, without failing the whole preview", () => {
            const service = createService();
            const blueprint = buildBlueprint({
                reelStripGeneration: [
                    {type: "literal", strip: ["A", "B"]},
                    {
                        type: "generated",
                        length: 4,
                        symbolCounts: {A: 2, B: 2},
                        seed: 1,
                        maxAttempts: 3,
                        // Two "A"s on a 4-long strip always split the circle into two gaps summing to
                        // 4, so both can never simultaneously be <= 1 -- unsatisfiable by construction.
                        constraints: [{type: "maximumCircularDistance", maximumDistance: 1, symbolIds: ["A"]}],
                    },
                    {type: "literal", strip: ["B", "A"]},
                ],
            });

            const result = service.previewReelStripGeneration(blueprint);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                return;
            }
            expect(result.reels).toHaveLength(3);
            expect(result.reels[0].type).toBe("literal");
            expect(result.reels[2].type).toBe("literal");

            const failed = result.reels[1];
            expect(failed.type).toBe("generated");
            if (failed.type !== "generated" || failed.success) {
                throw new Error("expected reel 1 to fail");
            }
            expect(failed.diagnostics.length).toBeGreaterThan(0);
            expect(failed.diagnostics[failed.diagnostics.length - 1].violations[0].constraintId).toBe("maximum-circular-distance");
        });

        it("never touches the filesystem", () => {
            const service = createService();

            service.previewReelStripGeneration(
                buildBlueprint({
                    reelStripGeneration: [
                        {type: "literal", strip: ["A", "B"]},
                        {type: "generated", length: 2, symbolCounts: {A: 1, B: 1}, seed: 1},
                        {type: "literal", strip: ["B", "A"]},
                    ],
                }),
            );

            expect(fs.readdirSync(tmpDir)).toEqual([]);
        });
    });

    describe("importParSheet", () => {
        async function writeParSheet(dir: string, sheets: Record<string, unknown[][]>): Promise<string> {
            const filePath = path.join(dir, "in.par.xlsx");
            const workbook = new ExcelJS.Workbook();
            for (const [name, rows] of Object.entries(sheets)) {
                const worksheet = workbook.addWorksheet(name);
                rows.forEach((row) => worksheet.addRow(row));
            }
            await workbook.xlsx.writeFile(filePath);
            return filePath;
        }

        const validSheets = {
            Manifest: [
                ["Key", "Value"],
                ["Id", "crazy-fruits"],
                ["Name", "Crazy Fruits"],
                ["Version", "0.1.0"],
                ["Reels", 2],
                ["Rows", 2],
            ],
            Symbols: [
                ["Symbol", "Wild", "Scatter"],
                ["A", false, false],
                ["W", true, false],
            ],
            Paytable: [
                ["Symbol", "Matches", "Multiplier"],
                ["A", 2, 5],
            ],
        };

        it("reads and maps a valid PAR sheet, delegating entirely to ParSheetImporting (no error-level issues)", async () => {
            const service = createService();
            const filePath = await writeParSheet(tmpDir, validSheets);

            const result = await service.importParSheet(filePath);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                return;
            }
            expect(result.path).toBe(filePath);
            expect(result.blueprint).toMatchObject({manifest: {id: "crazy-fruits"}, reels: 2, rows: 2});
            expect(result.errors).toEqual([]);
            // No "Meta" sheet in this fixture -- ParSheetImporter's own provenance-missing warning.
            expect(result.warnings.some((issue) => issue.code === "parsheet-provenance-missing")).toBe(true);
        });

        it("surfaces mapping errors (e.g. a missing required sheet) without throwing", async () => {
            const service = createService();
            const withoutPaytable = Object.fromEntries(Object.entries(validSheets).filter(([name]) => name !== "Paytable"));
            const filePath = await writeParSheet(tmpDir, withoutPaytable);

            const result = await service.importParSheet(filePath);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                return;
            }
            expect(result.errors.some((issue) => issue.code === "parsheet-missing-sheet")).toBe(true);
        });

        it("returns a safe load-error for a missing/unreadable file, never a stack trace", async () => {
            const service = createService();

            const result = await service.importParSheet(path.join(tmpDir, "missing.par.xlsx"));

            expect(result.status).toBe("load-error");
            if (result.status === "load-error") {
                expect(JSON.stringify(result)).not.toContain("\\n    at ");
            }
        });

        it("rejects a path that resolves inside Studio's own internal directory", async () => {
            const service = createService();

            const result = await service.importParSheet(path.join(studioRoot, "in.par.xlsx"));

            expect(result.status).toBe("load-error");
            if (result.status === "load-error") {
                expect(result.error).toContain("internal directory");
            }
        });

        it("never writes anything", async () => {
            const service = createService();
            const filePath = await writeParSheet(tmpDir, validSheets);

            await service.importParSheet(filePath);

            expect(fs.readdirSync(tmpDir)).toEqual(["in.par.xlsx"]);
        });

        it("returns a safe load-error (no stack trace) when the underlying importer throws", async () => {
            const throwingImporter: ParSheetImporting = {
                importFromFile: () => {
                    throw new Error("simulated exceljs read failure");
                },
            };
            const service = new StudioBlueprintService("1.2.1", studioRoot, homeService, undefined, undefined, undefined, undefined, throwingImporter);
            const filePath = await writeParSheet(tmpDir, validSheets);

            const result = await service.importParSheet(filePath);

            expect(result.status).toBe("load-error");
            if (result.status === "load-error") {
                expect(JSON.stringify(result)).not.toContain("\\n    at ");
            }
        });
    });

    describe("exportParSheet", () => {
        const exportableBlueprint = buildBlueprint({
            reelStrips: [
                ["A", "B", "A"],
                ["B", "A", "B"],
                ["A", "B", "A"],
            ],
        });

        it("writes a new file that doesn't exist yet, delegating entirely to ParSheetExporting", async () => {
            const service = createService();
            const filePath = path.join(tmpDir, "out.par.xlsx");

            const result = await service.exportParSheet(exportableBlueprint, filePath, false);

            expect(result.status).toBe("ok");
            if (result.status === "ok") {
                expect(result.path).toBe(filePath);
            }
            expect(fs.existsSync(filePath)).toBe(true);
        });

        it("returns conflict and writes nothing when the file already exists and overwrite isn't set", async () => {
            const service = createService();
            const filePath = path.join(tmpDir, "out.par.xlsx");
            fs.writeFileSync(filePath, "existing content");

            const result = await service.exportParSheet(exportableBlueprint, filePath, false);

            expect(result.status).toBe("conflict");
            expect(fs.readFileSync(filePath, "utf-8")).toBe("existing content");
        });

        it("overwrites the file when overwrite is true", async () => {
            const service = createService();
            const filePath = path.join(tmpDir, "out.par.xlsx");
            fs.writeFileSync(filePath, "existing content");

            const result = await service.exportParSheet(exportableBlueprint, filePath, true);

            expect(result.status).toBe("ok");
            expect(fs.readFileSync(filePath, "utf-8")).not.toBe("existing content");
        });

        it("returns invalid and writes nothing for a blueprint whose reel source PAR export can't represent", async () => {
            const service = createService();
            const filePath = path.join(tmpDir, "out.par.xlsx");
            const unsupportedBlueprint = buildBlueprint({
                reelStripGeneration: [
                    {type: "literal", strip: ["A", "B"]},
                    {type: "literal", strip: ["B", "A"]},
                    {type: "literal", strip: ["A", "B"]},
                ],
            });

            const result = await service.exportParSheet(unsupportedBlueprint, filePath, false);

            expect(result.status).toBe("invalid");
            if (result.status === "invalid") {
                expect(result.errors.some((issue) => issue.code === "parsheet-unsupported-reel-source")).toBe(true);
            }
            expect(fs.existsSync(filePath)).toBe(false);
        });

        it("returns invalid and writes nothing for a structurally broken blueprint", async () => {
            const service = createService();
            const filePath = path.join(tmpDir, "out.par.xlsx");

            const result = await service.exportParSheet(buildBlueprint({reels: 0}), filePath, false);

            expect(result.status).toBe("invalid");
            expect(fs.existsSync(filePath)).toBe(false);
        });

        it("rejects a path that resolves inside Studio's own internal directory", async () => {
            const service = createService();

            const result = await service.exportParSheet(exportableBlueprint, path.join(studioRoot, "out.par.xlsx"), true);

            expect(result.status).toBe("error");
            if (result.status === "error") {
                expect(result.error).toContain("internal directory");
            }
            expect(fs.existsSync(path.join(studioRoot, "out.par.xlsx"))).toBe(false);
        });

        it("returns a safe error (no stack trace) when the underlying exporter throws", async () => {
            const throwingExporter: ParSheetExporting = {
                exportToFile: (): Promise<ValidationIssue[]> => {
                    throw new Error("simulated exceljs write failure");
                },
            };
            const service = new StudioBlueprintService(
                "1.2.1",
                studioRoot,
                homeService,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                throwingExporter,
            );
            const filePath = path.join(tmpDir, "out.par.xlsx");

            const result = await service.exportParSheet(exportableBlueprint, filePath, false);

            expect(result.status).toBe("error");
            if (result.status === "error") {
                expect(JSON.stringify(result)).not.toContain("\\n    at ");
            }
            expect(fs.existsSync(filePath)).toBe(false);
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

            expect(result).toEqual({
                status: "ok",
                path: blueprintPath,
                blueprint: buildBlueprint(),
                blueprintHash: computeGameBlueprintHash(buildBlueprint()),
            });
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
