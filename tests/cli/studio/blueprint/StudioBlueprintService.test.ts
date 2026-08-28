import {
    AggregateSimulationRunner,
    BUILT_PACKAGE_FILES,
    computeGameBlueprintHash,
    CustomLinesDefinitions,
    GameBlueprint,
    GameSession,
    materializeReelStrips,
    ParSheetExporting,
    ParSheetImporting,
    PokieGame,
    resolveReelStripGeneration,
    SeededRandomNumberGenerator,
    SymbolsCombinationsGenerator,
    SymbolsCombinationsGenerating,
    SymbolsSequence,
    ValidationIssue,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotWinCalculator,
    generateExactWeightedOutcomeLibrary,
} from "pokie";
import ExcelJS from "exceljs";
import fs from "fs";
import os from "os";
import path from "path";
import {InMemoryRecentProjectsRepository} from "../../../../cli/studio/InMemoryRecentProjectsRepository.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";
import {FileStudioProjectRegistry} from "../../../../cli/studio/FileStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../../cli/studio/StudioProjectRegistrationService.js";
import {createRecommendedBlueprint} from "../../../../cli/studio-client/src/domain/blueprintEditorState.js";
import {PokiePathResolver} from "../../../../cli/paths/PokiePathResolver.js";

function buildBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
    return {
        manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

function materializeForRuntime(blueprint: GameBlueprint): GameBlueprint {
    const resolution = resolveReelStripGeneration(blueprint);
    if (!resolution.success) {
        throw new Error("expected a playable default to resolve every reel");
    }
    return materializeReelStrips(blueprint, resolution.reelStripGeneration);
}

function simulateMaterializedBlueprint(blueprint: GameBlueprint): {rtp: number; hitRate: number; volatility: number} {
    const config = new VideoSlotConfig();
    config.setAvailableBets(blueprint.availableBets ?? [1]);
    config.setReelsNumber(blueprint.reels);
    config.setReelsSymbolsNumber(blueprint.rows);
    config.setAvailableSymbols(blueprint.symbols);
    for (const [symbol, payouts] of Object.entries(blueprint.paytable)) {
        for (const [matches, payout] of Object.entries(payouts)) {
            config.getPaytable().setPayoutForSymbol(symbol, Number(matches), payout);
        }
    }
    if (blueprint.paylines) {
        // The recommended default has its own explicit lines; generated Blueprints intentionally use
        // VideoSlotConfig's default horizontal lines, exactly as their runtime package does.
        const lines = new CustomLinesDefinitions();
        blueprint.paylines.forEach((line, index) => lines.setLineDefinition(String(index), line));
        config.setLinesDefinitions(lines);
    }
    config.setSymbolsSequences((blueprint.reelStrips ?? []).map((strip) => new SymbolsSequence().fromArray(strip)));

    const session = new VideoSlotSession(
        config,
        new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator("playable-default-smoke")),
        new VideoSlotWinCalculator(config),
        new GameSession(config),
    );
    session.setBet(config.getAvailableBets()[0]);
    const statistics = new AggregateSimulationRunner(session, 10_000).run().getStatistics();
    return {rtp: statistics.rtp, hitRate: statistics.hitCount / statistics.rounds, volatility: statistics.volatility};
}

function buildExactEnumerationGame(blueprint: GameBlueprint): PokieGame {
    const config = new VideoSlotConfig();
    config.setAvailableBets(blueprint.availableBets ?? [1]);
    config.setReelsNumber(blueprint.reels);
    config.setReelsSymbolsNumber(blueprint.rows);
    config.setAvailableSymbols(blueprint.symbols);
    for (const [symbol, payouts] of Object.entries(blueprint.paytable)) {
        for (const [matches, payout] of Object.entries(payouts)) {
            config.getPaytable().setPayoutForSymbol(symbol, Number(matches), payout);
        }
    }
    if (blueprint.paylines) {
        const lines = new CustomLinesDefinitions();
        blueprint.paylines.forEach((line, index) => lines.setLineDefinition(String(index), line));
        config.setLinesDefinitions(lines);
    }
    config.setSymbolsSequences((blueprint.reelStrips ?? []).map((strip) => new SymbolsSequence().fromArray(strip)));

    return {
        getManifest: () => blueprint.manifest,
        createSession: () => new VideoSlotSession(config),
        createExactEnumerationSession: (combinationsGenerator: SymbolsCombinationsGenerating) => new VideoSlotSession(config, combinationsGenerator),
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

        it("rejects a structurally valid generated reel that cannot be materialized", () => {
            const service = createService();
            const result = service.validate(buildBlueprint({
                reelStripGeneration: [
                    {
                        type: "generated",
                        length: 4,
                        symbolCounts: {A: 2, B: 2},
                        seed: 7,
                        lockedPositions: {0: "A"},
                        constraints: [{type: "minimumCircularDistance", minimumDistance: 3, symbolIds: ["A"]}],
                    },
                    {type: "literal", strip: ["A", "B"]},
                    {type: "literal", strip: ["A", "B"]},
                ],
            }));

            expect(result).toMatchObject({status: "invalid"});
            if (result.status === "invalid") {
                expect(result.errors).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code: "blueprint-reelstripgeneration-unsatisfiable",
                            message: expect.stringContaining('"reelStripGeneration[0]" cannot satisfy its current configuration'),
                        }),
                    ]),
                );
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

    describe("previewGameModel", () => {
        it("re-rolls a symbolWeights blueprint's own dynamic inspection sample given a sharedWeightsSampleSeed, deterministically", () => {
            const service = createService();
            const blueprint = buildBlueprint({symbolWeights: {A: 1, B: 3}});

            const defaultProjection = service.previewGameModel(blueprint);
            const rerolled = service.previewGameModel(blueprint, 99);
            const rerolledAgain = service.previewGameModel(blueprint, 99);

            if (defaultProjection.reels.status !== "available" || rerolled.reels.status !== "available") {
                throw new Error("expected an available reels section");
            }
            expect(rerolled.reels.data.sharedWeightsSample!.seed).toEqual(99);
            expect(rerolled.reels.data).not.toEqual(defaultProjection.reels.data);
            expect(rerolledAgain).toEqual(rerolled);
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
                ["Id", "sample-slot"],
                ["Name", "Sample Slot"],
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
            expect(result.blueprint).toMatchObject({manifest: {id: "sample-slot"}, reels: 2, rows: 2});
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

        it("refuses to overwrite an existing file even when overwrite is true", async () => {
            const service = createService();
            const filePath = path.join(tmpDir, "out.par.xlsx");
            fs.writeFileSync(filePath, "existing content");

            const result = await service.exportParSheet(exportableBlueprint, filePath, true);

            expect(result.status).toBe("conflict");
            expect(fs.readFileSync(filePath, "utf-8")).toBe("existing content");
        });

        it("refuses an occupied directory even when overwrite is true", async () => {
            const service = createService();
            const directoryPath = path.join(tmpDir, "existing.par.xlsx");
            fs.mkdirSync(directoryPath);

            const result = await service.exportParSheet(exportableBlueprint, directoryPath, true);

            expect(result.status).toBe("conflict");
            expect(fs.statSync(directoryPath).isDirectory()).toBe(true);
        });

        it("rejects a source file and its symlink alias as PAR destinations", async () => {
            const service = createService();
            const sourcePath = path.join(tmpDir, "blueprint.json");
            const aliasPath = path.join(tmpDir, "blueprint-alias.par.xlsx");
            fs.writeFileSync(sourcePath, JSON.stringify(exportableBlueprint));
            fs.symlinkSync(sourcePath, aliasPath);

            const sourceResult = await service.exportParSheet(exportableBlueprint, sourcePath, true, sourcePath);
            const aliasResult = await service.exportParSheet(exportableBlueprint, aliasPath, true, sourcePath);

            expect(sourceResult.status).toBe("conflict");
            expect(aliasResult.status).toBe("conflict");
            expect(fs.readFileSync(sourcePath, "utf-8")).toBe(JSON.stringify(exportableBlueprint));
        });

        it("materializes a generated reel source into a PAR workbook", async () => {
            const service = createService();
            const filePath = path.join(tmpDir, "out.par.xlsx");
            const generatedBlueprint = buildBlueprint({
                reelStripGeneration: [
                    {type: "literal", strip: ["A", "B"]},
                    {type: "literal", strip: ["B", "A"]},
                    {type: "literal", strip: ["A", "B"]},
                ],
            });

            const result = await service.exportParSheet(generatedBlueprint, filePath, false);

            expect(result.status).toBe("ok");
            expect(fs.existsSync(filePath)).toBe(true);
        });

        it("returns invalid and writes nothing for a structurally broken blueprint", async () => {
            const service = createService();
            const filePath = path.join(tmpDir, "out.par.xlsx");

            const result = await service.exportParSheet(buildBlueprint({reels: 0}), filePath, false);

            expect(result.status).toBe("invalid");
            expect(fs.existsSync(filePath)).toBe(false);
        });

        it("returns the actionable seed diagnostic for an unseeded generated reel", async () => {
            const service = createService();
            const filePath = path.join(tmpDir, "out.par.xlsx");

            const result = await service.exportParSheet(buildBlueprint({
                reelStripGeneration: [
                    {type: "generated", length: 2, symbolCounts: {A: 1, B: 1}},
                    {type: "literal", strip: ["B", "A"]},
                    {type: "literal", strip: ["A", "B"]},
                ] as unknown as GameBlueprint["reelStripGeneration"],
            }), filePath, false);

            expect(result).toMatchObject({status: "invalid"});
            expect(JSON.stringify(result)).toContain("parsheet-reel-generation-seed-required");
            expect(JSON.stringify(result)).toContain("reelStripGeneration[0].seed");
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

    describe("random", () => {
        it("generates a valid blueprint with a minted seed when none is given", () => {
            const service = createService();

            const result = service.random();

            expect(result.status).toBe("ok");
            expect(typeof result.seed).toBe("number");
            expect(result.preset).toBe("default");
            expect(result.provenance).toEqual({generatorVersion: expect.any(String), strategy: expect.any(String), seed: result.seed});
            expect(service.validate(result.blueprint).status).toBe("ok");
        });

        it("reproduces the exact same blueprint for the same seed and preset", () => {
            const service = createService();

            const first = service.random(42, "default");
            const second = service.random(42, "default");

            expect(first.blueprint).toEqual(second.blueprint);
            expect(first.seed).toBe(42);
            expect(second.seed).toBe(42);
        });

        it("uses a different strategy for the variant preset, with its own provenance", () => {
            const service = createService();

            const result = service.random(7, "variant");

            expect(result.preset).toBe("variant");
            expect(result.provenance.seed).toBe(7);
            expect(service.validate(result.blueprint).status).toBe("ok");
        });

        it("overrides the generated manifest name when given", () => {
            const service = createService();

            const result = service.random(1, "default", "My Custom Name");

            const blueprint = result.blueprint as GameBlueprint;
            expect(blueprint.manifest.name).toBe("My Custom Name");
        });

        it("never touches the filesystem", () => {
            const service = createService();

            service.random();

            expect(fs.readdirSync(tmpDir)).toEqual([]);
        });

        it("keeps Recommended and a seeded Random model valid, materialized, playable, and within bounded math-quality ranges", () => {
            const service = createService();
            const defaults: Array<{name: string; blueprint: GameBlueprint}> = [
                {name: "Recommended", blueprint: createRecommendedBlueprint() as GameBlueprint},
                {name: "seeded Random", blueprint: service.random(20260815, "default").blueprint as GameBlueprint},
            ];

            for (const {name, blueprint} of defaults) {
                const validation = service.validate(blueprint);
                expect(validation.status).toBe("ok");
                if (name === "Recommended") {
                    expect(validation.warnings.map((warning) => warning.code)).not.toContain("blueprint-weighting-pay-mismatch");
                }
                expect(blueprint.symbols.length).toBeGreaterThanOrEqual(4);
                expect(Object.values(blueprint.paytable).some((payouts) => Object.keys(payouts).length > 0)).toBe(true);

                const materialized = materializeForRuntime(blueprint);
                expect(materialized.reelStrips).toHaveLength(materialized.reels);
                for (const reel of materialized.reelStrips ?? []) {
                    expect(reel.length).toBeGreaterThanOrEqual(materialized.rows);
                    expect(reel.every((symbol) => materialized.symbols.includes(symbol))).toBe(true);
                }

                // This exercises the actual line-pay runtime's Play session and bounded 10k-round
                // simulation path, not a second hand-written payout calculation. A hit proves the only
                // feature each default claims today (standard line pays) is reachable.
                const math = simulateMaterializedBlueprint(materialized);
                expect(math.hitRate).toBeGreaterThan(0.01);
                expect(math.hitRate).toBeLessThan(0.8);
                expect(math.rtp).toBeGreaterThan(0.2);
                expect(math.rtp).toBeLessThan(1.5);
                expect(math.volatility).toBeGreaterThan(0.1);
                expect(math.volatility).toBeLessThan(20);
                expect(name).toMatch(/Recommended|seeded Random/);
            }
        });

        it("generates the Recommended model's outcome library through the same exact generator Build/Export calls", async () => {
            const blueprint = materializeForRuntime(createRecommendedBlueprint() as GameBlueprint);
            const result = await generateExactWeightedOutcomeLibrary({
                libraryId: "recommended-starter",
                game: buildExactEnumerationGame(blueprint),
                pokieVersion: "test",
            });

            expect(result.diagnostics).toMatchObject({strategy: "exact", totalOutcomeSpaceSize: 1024, sampledRawCount: 1024});
            expect(result.library.outcomes.length).toBeGreaterThan(0);
        });
    });

    describe("save", () => {
        it("persists imported PNG artwork, reloads its metadata, removes it from presentation metadata, and safely ignores a missing asset", () => {
            const service = createService();
            const source = path.join(tmpDir, "gold.png");
            fs.writeFileSync(source, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
            const imported = service.importSymbolArtwork(source);
            expect(imported.status).toBe("ok");
            if (imported.status !== "ok") return;

            const filePath = path.join(tmpDir, "project", "blueprint.json");
            const blueprint = {...buildBlueprint(), symbolArtwork: {A: imported.reference}} as GameBlueprint;
            expect(service.save(filePath, blueprint, false).status).toBe("ok");
            expect(service.load(filePath)).toMatchObject({status: "ok", blueprint: {symbolArtwork: {A: imported.reference}}});
            expect(service.getSymbolArtwork(filePath)).toEqual({A: imported.reference});
            expect(service.resolveSymbolArtwork(filePath, imported.reference)).toBe(path.join(path.dirname(filePath), imported.reference));

            fs.unlinkSync(path.join(path.dirname(filePath), imported.reference));
            expect(service.resolveSymbolArtwork(filePath, imported.reference)).toBeUndefined();
            expect(service.getSymbolArtwork(filePath)).toEqual({A: imported.reference});

            const withoutArtwork = {...blueprint, symbolArtwork: {}};
            expect(service.save(filePath, withoutArtwork, true).status).toBe("ok");
            expect(service.getSymbolArtwork(filePath)).toEqual({});
        });

        it("writes a new file that doesn't exist yet", () => {
            const service = createService();
            const filePath = path.join(tmpDir, "blueprint.json");

            const result = service.save(filePath, buildBlueprint(), false);

            expect(result).toEqual({status: "ok", path: filePath, blueprintHash: computeGameBlueprintHash(buildBlueprint())});
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

            expect(result).toEqual({status: "ok", path: filePath, blueprintHash: computeGameBlueprintHash(buildBlueprint())});
            expect(fs.readFileSync(filePath, "utf-8")).toContain('"sample-slot"');
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

    describe("saveManaged", () => {
        function createServiceWithPathResolver(
            resolveIndependentProjectDirectory: jest.Mock,
        ): StudioBlueprintService {
            return new StudioBlueprintService(
                "1.2.1",
                studioRoot,
                homeService,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {resolveIndependentProjectDirectory} as unknown as ConstructorParameters<typeof StudioBlueprintService>[11],
            );
        }

        function createServiceWithManagedDirectory(directory: string): StudioBlueprintService {
            return createServiceWithPathResolver(jest.fn().mockReturnValue({status: "valid", directory, source: "documents"}));
        }

        it("writes blueprint.json into the resolved managed directory, named from the blueprint's own manifest.id", () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            const service = createServiceWithManagedDirectory(managedDir);

            const result = service.saveManaged(buildBlueprint());

            const expectedPath = path.join(managedDir, "blueprint.json");
            expect(result).toEqual({status: "ok", path: expectedPath, name: "sample-slot", blueprintHash: computeGameBlueprintHash(buildBlueprint())});
            expect(fs.existsSync(expectedPath)).toBe(true);
            expect(fs.readFileSync(expectedPath, "utf-8")).toContain('"sample-slot"');
        });

        it("bootstraps a missing isolated Home and persists the first managed Blueprint within it", () => {
            const freshHome = path.join(tmpDir, "fresh-profile");
            const service = new StudioBlueprintService(
                "1.2.1",
                studioRoot,
                homeService,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                new PokiePathResolver({cwd: "/elsewhere"}, {platform: "linux", env: {}, homeDir: freshHome}),
            );

            const result = service.saveManaged(buildBlueprint({manifest: {id: "valera-mathematician", name: "Valera Mathematician", version: "0.1.0"}}));

            expect(result).toMatchObject({
                status: "ok",
                path: path.join(freshHome, "POKIE Projects", "valera-mathematician", "blueprint.json"),
                name: "valera-mathematician",
            });
            expect(fs.existsSync(path.join(freshHome, "POKIE Projects", "valera-mathematician", "blueprint.json"))).toBe(true);
        });

        it("persists the complete Recommended model as the managed Blueprint source a later Projects Open materializes", () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "starter-slot");
            const service = createServiceWithManagedDirectory(managedDir);
            const recommended = createRecommendedBlueprint();

            const result = service.saveManaged(recommended);

            expect(result).toMatchObject({status: "ok", path: path.join(managedDir, "blueprint.json"), name: "starter-slot"});
            if (result.status === "ok") {
                const reloaded = service.load(result.path);
                expect(reloaded).toMatchObject({status: "ok", blueprint: recommended});
                expect(service.validate(reloaded.status === "ok" ? reloaded.blueprint : undefined)).toEqual({status: "ok", warnings: []});
            }
        });

        it("falls back to the literal name \"blueprint\" when manifest.id is blank", () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "blueprint");
            const service = createServiceWithManagedDirectory(managedDir);

            const blueprintWithBlankId = buildBlueprint({manifest: {id: "", name: "Untitled", version: "0.1.0"}});
            const result = service.saveManaged(blueprintWithBlankId);

            expect(result).toEqual({
                status: "ok",
                path: path.join(managedDir, "blueprint.json"),
                name: "blueprint",
                blueprintHash: computeGameBlueprintHash(blueprintWithBlankId),
            });
        });

        it("never overwrites an existing managed blueprint.json for the same id -- picks the next available destination instead", () => {
            const collidingDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            fs.mkdirSync(collidingDir, {recursive: true});
            fs.writeFileSync(path.join(collidingDir, "blueprint.json"), "stale content from a different project");
            const nextDir = path.join(tmpDir, "POKIE Projects", "sample-slot-2");
            const resolveIndependentProjectDirectory = jest.fn((name: string) => ({
                status: "valid",
                directory: name === "sample-slot" ? collidingDir : nextDir,
                source: "documents",
            }));
            const service = createServiceWithPathResolver(resolveIndependentProjectDirectory);

            const result = service.saveManaged(buildBlueprint());

            expect(result).toEqual({
                status: "ok",
                path: path.join(nextDir, "blueprint.json"),
                name: "sample-slot-2",
                blueprintHash: computeGameBlueprintHash(buildBlueprint()),
            });
            expect(fs.readFileSync(path.join(collidingDir, "blueprint.json"), "utf-8")).toBe("stale content from a different project");
            expect(fs.readFileSync(path.join(nextDir, "blueprint.json"), "utf-8")).toContain('"sample-slot"');
        });

        it("walks past multiple existing collisions to find the first available numbered destination", () => {
            const firstDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            const secondDir = path.join(tmpDir, "POKIE Projects", "sample-slot-2");
            const thirdDir = path.join(tmpDir, "POKIE Projects", "sample-slot-3");
            fs.mkdirSync(firstDir, {recursive: true});
            fs.writeFileSync(path.join(firstDir, "blueprint.json"), "occupied");
            fs.mkdirSync(secondDir, {recursive: true});
            fs.writeFileSync(path.join(secondDir, "blueprint.json"), "also occupied");
            const resolveIndependentProjectDirectory = jest.fn((name: string) => ({
                status: "valid",
                directory: path.join(tmpDir, "POKIE Projects", name),
                source: "documents",
            }));
            const service = createServiceWithPathResolver(resolveIndependentProjectDirectory);

            const result = service.saveManaged(buildBlueprint());

            expect(result).toEqual({
                status: "ok",
                path: path.join(thirdDir, "blueprint.json"),
                name: "sample-slot-3",
                blueprintHash: computeGameBlueprintHash(buildBlueprint()),
            });
        });

        it("still writes directly when the resolved managed path doesn't exist yet", () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            const service = createServiceWithManagedDirectory(managedDir);

            const result = service.saveManaged(buildBlueprint());

            expect(result.status).toBe("ok");
            expect(fs.readFileSync(path.join(managedDir, "blueprint.json"), "utf-8")).toContain('"sample-slot"');
        });

        it("surfaces an invalid-name outcome from the path resolver without writing anything", () => {
            const service = createServiceWithPathResolver(jest.fn().mockReturnValue({status: "invalid-name", message: "not a valid project name"}));

            const result = service.saveManaged(buildBlueprint());

            expect(result).toEqual({status: "invalid-name", error: "not a valid project name"});
        });

        it("collapses every other non-valid path resolver outcome to \"unavailable\"", () => {
            const service = createServiceWithPathResolver(jest.fn().mockReturnValue({status: "permission", message: "not writable"}));

            const result = service.saveManaged(buildBlueprint());

            expect(result).toEqual({status: "unavailable", error: "not writable"});
        });

        // Covers the PAR Apply -> guided "first Save" lifecycle (see BlueprintEditorPage.tsx's own
        // handleApplyImportedBlueprint/handleGuidedSave): once a PAR sheet is Applied and then saved for
        // the first time, the resulting managed Blueprint Project must be traceable back to the .xlsx
        // workbook it came from -- see StudioProjectRegistryEntry's own doc comment for why that
        // provenance lives in the registry entry StudioServer registers from this result, never inside the
        // blueprint file itself.
        it("echoes sourceWorkbookPath back on ok when a PAR Apply is behind this first Save", () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            const service = createServiceWithManagedDirectory(managedDir);

            const result = service.saveManaged(buildBlueprint(), "/games/in.par.xlsx");

            expect(result).toEqual({
                status: "ok",
                path: path.join(managedDir, "blueprint.json"),
                name: "sample-slot",
                blueprintHash: computeGameBlueprintHash(buildBlueprint()),
                sourceWorkbookPath: "/games/in.par.xlsx",
            });
        });

        it("publishes PAR conversion evidence beside an Applied managed Blueprint and removes the pair on rollback", () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            const service = createServiceWithManagedDirectory(managedDir);
            const evidence = {
                metaSheet: [["Key", "Value"], ["Blueprint Hash", "sha256:test"]],
                facts: [{kind: "formulaMaterialized" as const, code: "parsheet-formula-cell", message: "Formula result materialized."}],
                losslessEligible: false,
                importedBlueprintHash: "sha256:imported",
                provenanceHashMatches: false,
            };

            const result = service.saveManaged(buildBlueprint(), "/games/in.par.xlsx", evidence);

            expect(result).toMatchObject({status: "ok", conversionEvidencePath: path.join(managedDir, "blueprint.json.conversion-evidence.json")});
            if (result.status !== "ok" || result.conversionEvidencePath === undefined) throw new Error("expected evidence publication");
            expect(JSON.parse(fs.readFileSync(result.conversionEvidencePath, "utf8"))).toMatchObject({sourceWorkbook: "/games/in.par.xlsx", facts: evidence.facts});
            service.discardManagedSave(result.path);
            expect(fs.existsSync(result.path)).toBe(false);
            expect(fs.existsSync(result.conversionEvidencePath)).toBe(false);
        });

        it("invalidates a lossless PAR claim when the saved Blueprint differs from the imported hash", () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            const service = createServiceWithManagedDirectory(managedDir);
            const imported = buildBlueprint();
            const edited = buildBlueprint({manifest: {id: "sample-slot", name: "Edited Sample Slot", version: "0.1.0"}});
            const result = service.saveManaged(edited, "/games/in.par.xlsx", {
                metaSheet: [],
                facts: [],
                losslessEligible: true,
                importedBlueprintHash: computeGameBlueprintHash(imported),
                provenanceHashMatches: true,
            });

            expect(result.status).toBe("ok");
            if (result.status !== "ok" || result.conversionEvidencePath === undefined) throw new Error("expected PAR evidence publication");
            expect(JSON.parse(fs.readFileSync(result.conversionEvidencePath, "utf8"))).toMatchObject({losslessEligible: false});
        });

        it("retains parsed PAR provenance and rolls back only artwork allocated by a failed managed registration", () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            const service = createServiceWithManagedDirectory(managedDir);
            const artworkSource = path.join(tmpDir, "symbol.png");
            fs.writeFileSync(artworkSource, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
            const staged = service.importSymbolArtwork(artworkSource);
            if (staged.status !== "ok") throw new Error("expected staged artwork");
            const evidence = {
                provenance: {pokieVersion: "1.3.0", blueprintHash: "sha256:source"},
                metaSheet: [["Key", "Value"], ["Blueprint Hash", "sha256:source"]],
                facts: [],
                losslessEligible: false,
                importedBlueprintHash: "sha256:imported",
                provenanceHashMatches: false,
            };
            const result = service.saveManaged({...buildBlueprint(), symbolArtwork: {A: staged.reference}}, "/games/in.par.xlsx", evidence);

            expect(result.status).toBe("ok");
            if (result.status !== "ok" || result.conversionEvidencePath === undefined) throw new Error("expected managed PAR save");
            expect(JSON.parse(fs.readFileSync(result.conversionEvidencePath, "utf8"))).toMatchObject({provenance: evidence.provenance, metaSheet: evidence.metaSheet});
            expect(fs.existsSync(path.join(managedDir, staged.reference))).toBe(true);

            service.discardManagedSave(result.path);

            expect(fs.existsSync(result.path)).toBe(false);
            expect(fs.existsSync(result.conversionEvidencePath)).toBe(false);
            expect(fs.existsSync(path.join(managedDir, staged.reference))).toBe(false);
            expect(fs.existsSync(managedDir)).toBe(false);
        });

        it("omits sourceWorkbookPath entirely for an ordinary first Save with no PAR import behind it", () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            const service = createServiceWithManagedDirectory(managedDir);

            const result = service.saveManaged(buildBlueprint());

            expect(result.status).toBe("ok");
            expect((result as {sourceWorkbookPath?: string}).sourceWorkbookPath).toBeUndefined();
        });

        it("never writes sourceWorkbookPath into the blueprint file itself -- the managed Blueprint stays the one editable source", () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            const service = createServiceWithManagedDirectory(managedDir);

            service.saveManaged(buildBlueprint(), "/games/in.par.xlsx");

            const written = fs.readFileSync(path.join(managedDir, "blueprint.json"), "utf-8");
            expect(written).not.toContain("in.par.xlsx");
            expect(JSON.parse(written)).toEqual(buildBlueprint());
        });

        it("registers a managed save and retains that registration after a registry restart/reload", async () => {
            const managedDir = path.join(tmpDir, "POKIE Projects", "sample-slot");
            const service = createServiceWithManagedDirectory(managedDir);
            const saved = service.saveManaged(buildBlueprint());
            if (saved.status !== "ok") {
                throw new Error("expected managed Blueprint save to succeed");
            }

            const registryPath = path.join(tmpDir, "studio", "projects.json");
            const registration = new StudioProjectRegistrationService(new FileStudioProjectRegistry(registryPath));
            const registered = await registration.registerManaged(saved.path, saved.name);
            expect(registered.status).toBe("ok");
            expect((await registration.list()).map((entry) => entry.location)).toEqual([saved.path]);

            // A new registration service and file-backed registry represent a Studio restart. The
            // managed Blueprint remains visible without re-registering it.
            const restarted = new StudioProjectRegistrationService(new FileStudioProjectRegistry(registryPath));
            expect(await restarted.list()).toEqual([
                expect.objectContaining({location: saved.path, name: saved.name, type: "blueprint", origin: "managed", status: "ok"}),
            ]);
        });
    });

    describe("previewBuild", () => {
        it("returns an ok preview without writing anything", () => {
            const service = createService();

            const preview = service.previewBuild(buildBlueprint(), undefined, "blueprint.json");

            expect(preview.status).toBe("ok");
            if (preview.status === "ok") {
                expect(preview.manifest).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
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

        it("reports a fresh destination as non-existent, with every built file listed to create and none to update", () => {
            const service = createService();
            const outDir = path.join(tmpDir, "out");

            const preview = service.previewBuild(buildBlueprint(), outDir, "blueprint.json");

            expect(preview.status).toBe("ok");
            if (preview.status !== "ok") {
                return;
            }
            expect(preview.projectRoot).toBe(outDir);
            expect(preview.destinationHasContent).toBe(false);
            expect(preview.createFiles.sort()).toEqual([...BUILT_PACKAGE_FILES].sort());
            expect(preview.updateFiles).toEqual([]);
            expect(preview.deleteFiles).toEqual([]);
        });

        it("reports an already-built destination as having content", async () => {
            const service = createService();
            const outDir = path.join(tmpDir, "out");
            await service.build(buildBlueprint(), outDir, "blueprint.json");

            const preview = service.previewBuild(
                buildBlueprint({manifest: {id: "sample-slot", name: "Sample Slot", version: "0.2.0"}}),
                outDir,
                "blueprint.json",
            );

            expect(preview.status).toBe("ok");
            if (preview.status !== "ok") {
                return;
            }
            expect(preview.destinationHasContent).toBe(true);
            expect(preview.createFiles.sort()).toEqual([...BUILT_PACKAGE_FILES].sort());
            expect(preview.updateFiles).toEqual([]);
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
            expect(fs.existsSync(path.join(result.projectRoot, "dist", "index.js"))).toBe(true);
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
                expect(result.error).toContain("already exists and is not empty");
                expect(JSON.stringify(result)).not.toContain("\\n    at ");
            }
            expect(await repository.list()).toEqual([]);
        });

        it("refuses to build again into a directory a prior build already populated -- there is no rebuild/merge recognition", async () => {
            const service = createService();
            const outDir = path.join(tmpDir, "out");

            const first = await service.build(buildBlueprint(), outDir, "blueprint.json");
            const second = await service.build(buildBlueprint(), outDir, "blueprint.json");

            expect(first.status).toBe("ok");
            expect(second.status).toBe("error");
        });

        it("rejects the source directory, a descendant, and a symlink alias before package publication", async () => {
            const service = createService();
            const sourceDirectory = path.join(tmpDir, "source");
            const descendant = path.join(sourceDirectory, "dist");
            const aliasDirectory = path.join(tmpDir, "source-alias");
            fs.mkdirSync(sourceDirectory);
            fs.symlinkSync(sourceDirectory, aliasDirectory, "dir");

            const self = await service.build(buildBlueprint(), sourceDirectory, sourceDirectory);
            const nested = await service.build(buildBlueprint(), descendant, sourceDirectory);
            const alias = await service.build(buildBlueprint(), path.join(aliasDirectory, "dist"), sourceDirectory);

            expect(self.status).toBe("error");
            expect(nested.status).toBe("error");
            expect(alias.status).toBe("error");
            expect(fs.existsSync(descendant)).toBe(false);
            expect(await repository.list()).toEqual([]);
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
