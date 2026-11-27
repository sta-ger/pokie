import {authoritativePaytableBlueprint, type AuthoredAwardCase} from "../fixtures/math/AuthoritativePaytableFixture.js";
import ExcelJS from "@xlvane/exceljs";
import fs from "fs";
import os from "os";
import path from "path";
import {execFileSync} from "child_process";
import {stageCompiledTestRuntime} from "../testUtils/stageCompiledTestRuntime.js";
import {GameBlueprint} from "../../src/generated/GameBlueprint.js";
import {ParSheetExporter, inspectParSheetConversion} from "../../src/parsheet/ParSheetExporter.js";
import {parSheetConversionReport} from "../../src/parsheet/ParSheetConversionReport.js";
import {GameBlueprintValidator} from "../../src/generated/GameBlueprintValidator.js";
import {ParSheetImporter} from "../../src/parsheet/ParSheetImporter.js";

describe("ParSheetExporter", () => {
    let dir: string;
    let filePath: string;
    let runtimeDirectory: string;
    let runtimePackageRoot: string;

    beforeAll(() => {
        const cache = path.resolve(__dirname, "../../node_modules/.cache/pokie-tmp");
        fs.mkdirSync(cache, {recursive: true});
        runtimeDirectory = fs.mkdtempSync(path.join(cache, "parsheet-native-runtime-"));
        runtimePackageRoot = stageCompiledTestRuntime(runtimeDirectory, {runtimeFilesOnly: true});
    });

    afterAll(() => {
        fs.rmSync(runtimeDirectory, {recursive: true, force: true});
    });

    const blueprint: GameBlueprint = {
        info: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        reels: 2,
        rows: 2,
        symbols: ["A", "W"],
        wilds: ["W"],
        paytable: {A: {"2": 5}},
        paylines: [
            [0, 0],
            [1, 1],
        ],
        reelStrips: [
            ["A", "W"],
            ["W", "A"],
        ],
        availableBets: [1, 2],
    };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-parsheet-export-test-"));
        filePath = path.join(dir, "out.par.xlsx");
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    async function readSheetNames(): Promise<string[]> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        return workbook.worksheets.map((worksheet) => worksheet.name);
    }

    it.each(["missing-symbol", "missing-count", "zero", "positive"] as AuthoredAwardCase[])(
        "round-trips and plays the authored %s table through PAR",
        (kind) => {
            // The native child consumes the compiled public package, including its real
            // XLSX and isolated loader graph. Its deadline drains worker threads before
            // Jest can advance to the next row; each row owns its snapshot directory.
            const stdout = execFileSync(
                process.execPath,
                [
                    "-e",
                    `
            const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
            const {createRequire} = require("node:module");
            const {model, screen, expectedWin, filePath, dir, runtimePackageRoot} = JSON.parse(fs.readFileSync(0, "utf8"));
            const api = createRequire(path.join(runtimePackageRoot, "consumer.cjs"))("@fromstan/pokie");
            (async () => {
                const started = Date.now(), phases = {};
                const issues = await new api.ParSheetExporter("1.3.0").exportToFile(model, filePath);
                assert.deepEqual(issues.filter(issue => issue.severity === "error"), []);
                const imported = await new api.ParSheetImporter().importFromFile(filePath);
                assert.deepEqual(imported.issues.filter(issue => issue.severity === "error"), []);
                assert.deepEqual(imported.blueprint.paytable, model.paytable);
                phases.workbookMs = Date.now() - started;
                const built = new api.GamePackageGenerator("1.3.0").generate(imported.blueprint, dir, undefined, undefined, {runtimePackageRoot});
                const loaded = await api.loadPokieGameRuntime(built.projectRoot);
                phases.loadedMs = Date.now() - started;
                try {
                    const session = loaded.game.createExactEnumerationSession({generateSymbolsCombination: () => new api.SymbolsCombination().fromMatrix(screen)});
                    session.setBet(0.1);
                    session.play();
                    assert.deepEqual(session.getSymbolsCombination().toMatrix(), screen);
                    assert.equal(session.getWinAmount(), expectedWin);
                    assert.equal(session.getWinEvaluationResult().getWinComponents().length, expectedWin > 0 ? 1 : 0);
                    assert.equal(session.getPaytable().getWinAmountForSymbol("B", 3, 0.1), expectedWin);
                } finally {
                    await loaded.release();
                }
                phases.releasedMs = Date.now() - started;
                assert.deepEqual(fs.readdirSync(dir).filter(name => name.startsWith("pokie-runtime-")), []);
                console.log(JSON.stringify(phases));
            })().catch(error => { console.error(error); process.exitCode = 1; });
        `,
                ],
                {
                    input: JSON.stringify({
                        model: authoritativePaytableBlueprint(kind, 0.1, true),
                        screen: authoritativePaytableBlueprint(kind).reelStrips!.map((strip) => [strip[0]]),
                        expectedWin: kind === "positive" ? 0.2 : 0,
                        filePath,
                        dir,
                        runtimePackageRoot,
                    }),
                    env: {...process.env, TMPDIR: dir},
                    encoding: "utf8",
                    stdio: "pipe",
                    timeout: 45000,
                },
            );
            console.info(`PAR ${kind}: ${stdout.trim()}`);
        },
    );

    it("adds exact math sheets when requested, and explains an over-cap space instead of sampling it", async () => {
        await new ParSheetExporter("1").exportToFile(blueprint, filePath, undefined, {includeMath: true});
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(
            expect.arrayContaining([
                "MathSummary",
                "PayoutDistribution",
                "WinEvents",
                "LineContributions",
                "SymbolContributions",
            ]),
        );
        const summary = workbook.getWorksheet("MathSummary")!;
        const summaryRows = new Map<string, number>();
        for (let row = 1; row <= summary.rowCount; row++) {
            const value = Number(summary.getCell(`B${row}`).value);
            if (Number.isFinite(value)) summaryRows.set(String(summary.getCell(`A${row}`).value), value);
        }
        expect(summary.getCell("A2").value).toBe("Scope");
        expect(summaryRows.get("RTP")).toBeGreaterThanOrEqual(0);
        const noteRow = Array.from({length: summary.rowCount}, (_, index) => index + 1).find(
            (row) => summary.getCell(`A${row}`).value === "Note",
        );
        expect(noteRow).toBeDefined();
        expect(String(summary.getCell(`B${noteRow!}`).value)).not.toContain("Nothing was saved");
        const tableOrderRow = Array.from({length: summary.rowCount}, (_, index) => index + 1).find(
            (row) => summary.getCell(`A${row}`).value === "Table order",
        );
        expect(tableOrderRow).toBeDefined();
        expect(String(summary.getCell(`B${tableOrderRow!}`).value)).toContain("highest first");
        const contributionNoteRow = Array.from({length: summary.rowCount}, (_, index) => index + 1).find(
            (row) => summary.getCell(`A${row}`).value === "Contribution tables",
        );
        expect(contributionNoteRow).toBeDefined();
        expect(String(summary.getCell(`B${contributionNoteRow!}`).value)).toContain("do not add them together");
        const lineSheet = workbook.getWorksheet("LineContributions")!;
        for (let row = 2; row <= lineSheet.rowCount; row++) {
            expect(String(lineSheet.getCell(`A${row}`).value)).not.toBe("0");
            expect(String(lineSheet.getCell(`B${row}`).value)).not.toMatch(/^Line 0\b/);
        }
        expect(workbook.getWorksheet("WinEvents")!.getCell("A1").value).toBe("Kind");
        const imported = await new ParSheetImporter().importFromFile(filePath);
        expect(imported.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(imported.conversionEvidence?.losslessEligible).toBe(true);

        const cappedPath = path.join(dir, "capped.par.xlsx");
        await new ParSheetExporter("1").exportToFile(blueprint, cappedPath, undefined, {
            includeMath: true,
            maxMathOutcomes: 1,
        });
        const capped = new ExcelJS.Workbook();
        await capped.xlsx.readFile(cappedPath);
        const cappedSummary = capped.getWorksheet("MathSummary")!;
        expect(cappedSummary.getCell("A2").value).toBe("Not included");
        expect(String(cappedSummary.getCell("C2").value)).toMatch(/exact preview cap is 1/i);
    });

    it("writes total RTP for additive free games and labels the paid-spin base", async () => {
        const freeGames: GameBlueprint = {
            info: {id: "free-games-par", name: "Free Games PAR", version: "0.1.0"},
            reels: 3,
            rows: 3,
            symbols: ["A", "K", "Q", "J", "S"],
            scatters: ["S"],
            paytable: {A: {3: 8}, K: {3: 6}, Q: {3: 4}, J: {3: 1}},
            reelStrips: [
                ["A", "K", "Q", "J", "J", "S", "A"],
                ["K", "Q", "A", "J", "J", "S", "K"],
                ["Q", "K", "J", "A", "J", "S", "Q"],
            ],
            paylines: [
                [0, 0, 0],
                [1, 1, 1],
                [2, 2, 2],
            ],
            availableBets: [1, 2, 5],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}, maxFreeGames: 50}},
        };
        await new ParSheetExporter("1").exportToFile(freeGames, filePath, undefined, {includeMath: true});
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const summary = workbook.getWorksheet("MathSummary")!;
        expect(summary.getCell("A2").value).toBe("Scope");
        expect(summary.getCell("A3").value).toBe("RTP (paid spins)");
        const rows = new Map<string, number>();
        for (let row = 1; row <= summary.rowCount; row++) {
            const label = String(summary.getCell(`A${row}`).value);
            const value = Number(summary.getCell(`B${row}`).value);
            if (Number.isFinite(value)) rows.set(label, value);
        }
        expect(rows.get("Free-games RTP")).toBeGreaterThan(0);
        expect(rows.get("Total RTP (paid + free games)")).toBeGreaterThan(rows.get("RTP (paid spins)")!);
        expect(rows.get("Hit frequency (paid spins)")).toBeGreaterThan(0);
        expect(rows.get("Volatility (std. deviation, bet units, paid spins)")).toBeGreaterThan(0);
        expect(rows.get("Max win (paid spins)")).toBeGreaterThan(0);
        expect(rows.get("Max whole-round win (upper bound, capped)")).toBeGreaterThan(
            rows.get("Max win (paid spins)")!,
        );
        expect(workbook.getWorksheet("PayoutDistribution")!.getCell("A1").value).toBe(
            "Payout (× bet; paid spins only)",
        );
        expect(workbook.getWorksheet("WinEvents")!.getCell("A1").value).toBe("Kind (paid spins)");
        expect(String(summary.getCell(`B${summary.rowCount}`).value)).toContain(
            "Total RTP includes additive free-game retriggers",
        );
        expect(String(summary.getCell(`B${summary.rowCount}`).value)).toContain(
            "Free-games awards are exact scatter counts",
        );
    });

    it("retains an authored empty symbol payout map, omitted counts and explicit zeros in a real XLSX", async () => {
        const authored = {...blueprint, paytable: {A: {}, W: {2: 0}}, availableBets: [0.05, 7.5, 1e-7]};
        expect(
            (await new ParSheetExporter("1").exportToFile(authored, filePath)).some(
                (issue) => issue.severity === "error",
            ),
        ).toBe(false);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        expect(workbook.getWorksheet("Paytable")!.getCell("A2").value).toBe("A");
        const imported = await new ParSheetImporter().importFromFile(filePath);
        expect(imported.blueprint.paytable).toEqual(authored.paytable);
        expect(imported.blueprint.availableBets).toEqual(authored.availableBets);
        expect(imported.conversionEvidence).toMatchObject({losslessEligible: true, provenanceHashMatches: true});
    });

    it("retains a prior non-lossless import across Blueprint re-export", async () => {
        const source = path.join(dir, "imported.json");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        fs.writeFileSync(`${source}.conversion-evidence.json`, JSON.stringify({losslessEligible: false}));
        const issues = await new ParSheetExporter("1").exportToFile(blueprint, filePath, source);
        expect(issues.some((issue) => issue.code === "parsheet-prior-conversion-loss")).toBe(true);
        expect((await new ParSheetImporter().importFromFile(filePath)).conversionEvidence?.losslessEligible).toBe(
            false,
        );
    });

    it.each(["explicit report", "source workbook"])(
        "rejects retained Mechanics errors from %s before serialization and remains reusable",
        async (history) => {
            const source = path.join(dir, "malformed.xlsx");
            const writeWorkbook = jest.fn((workbook: ExcelJS.Workbook, target: string) =>
                workbook.xlsx.writeFile(target),
            );
            const exporter = new ParSheetExporter(
                "1",
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                writeWorkbook,
            );
            await exporter.exportToFile(blueprint, source);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(source);
            workbook.addWorksheet("Mechanics").addRows([
                ["Mechanic", "Configuration JSON"],
                ["cascade", "{"],
            ]);
            await workbook.xlsx.writeFile(source);
            const before = fs.readFileSync(source);
            const imported = await new ParSheetImporter().importFromFile(source);
            const diagnostic = imported.issues.find((issue) => issue.code === "parsheet-mechanics-invalid")!;
            expect(diagnostic).toMatchObject({severity: "error", path: "Mechanics.2"});
            expect(
                new GameBlueprintValidator().validate(imported.blueprint).filter((issue) => issue.severity === "error"),
            ).toEqual([]);
            const report = parSheetConversionReport(imported.issues, imported.conversionEvidence);
            const retained = JSON.stringify(report);
            const onPublication = jest.fn(),
                onProgress = jest.fn();
            writeWorkbook.mockClear();

            for (const claimedEligible of [false, true]) {
                const options = {
                    ...(history === "explicit report"
                        ? {conversionReport: {...report, losslessEligible: claimedEligible}}
                        : {}),
                    losslessEligible: claimedEligible,
                    onPublication,
                    onProgress,
                };
                const origin = history === "source workbook" ? source : undefined;
                const inspected = await inspectParSheetConversion(imported.blueprint, origin, options);
                expect(inspected.issues).toContainEqual(diagnostic);
                expect(inspected.facts).toEqual(expect.arrayContaining(report.facts));
                expect(inspected.losslessEligible).toBe(false);
                // Include a source alias and a foreign file: even their bytes must stay untouched.
                for (const target of [filePath, path.join(dir, "foreign.xlsx"), source]) {
                    if (target.endsWith("foreign.xlsx")) fs.writeFileSync(target, "foreign destination");
                    const inventory = Object.fromEntries(
                        fs
                            .readdirSync(dir)
                            .map((name) => [name, fs.readFileSync(path.join(dir, name)).toString("base64")]),
                    );
                    const issues = await exporter.exportToFile(imported.blueprint, target, origin, options);
                    expect(issues).toContainEqual(diagnostic);
                    expect(writeWorkbook).not.toHaveBeenCalled();
                    expect(
                        Object.fromEntries(
                            fs
                                .readdirSync(dir)
                                .map((name) => [name, fs.readFileSync(path.join(dir, name)).toString("base64")]),
                        ),
                    ).toEqual(inventory);
                }
            }
            expect(writeWorkbook).not.toHaveBeenCalled();
            expect(onProgress).not.toHaveBeenCalled();
            expect(onPublication).not.toHaveBeenCalled();
            expect(JSON.stringify(report)).toBe(retained);
            expect(fs.readFileSync(source)).toEqual(before);

            // Reuse the already successful/rejected instance with independently repaired source bytes.
            workbook.removeWorksheet("Mechanics");
            await workbook.xlsx.writeFile(source);
            const repaired = await new ParSheetImporter().importFromFile(source);
            for (const target of [filePath, path.join(dir, "subsequent.xlsx")]) {
                const issues = await exporter.exportToFile(repaired.blueprint, target, source, {
                    conversionReport: parSheetConversionReport(repaired.issues, repaired.conversionEvidence),
                });
                expect(issues.some((issue) => issue.severity === "error")).toBe(false);
                expect((await new ParSheetImporter().importFromFile(target)).conversionEvidence?.losslessEligible).toBe(
                    true,
                );
            }
            expect(writeWorkbook).toHaveBeenCalledTimes(2);
        },
    );

    it("rolls back cancellation after the exclusive workbook link and retries cleanly", async () => {
        const controller = new AbortController();
        const link = fs.promises.link.bind(fs.promises);
        const publication = jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
            await link(from, to);
            controller.abort();
        });
        try {
            await expect(
                new ParSheetExporter("1").exportToFile(blueprint, filePath, undefined, {signal: controller.signal}),
            ).rejects.toThrow(/cancelled/);
        } finally {
            publication.mockRestore();
        }
        expect(fs.existsSync(filePath)).toBe(false);
        expect(fs.readdirSync(dir)).toEqual([]);
        await new ParSheetExporter("1").exportToFile(blueprint, filePath);
        expect((await new ParSheetImporter().importFromFile(filePath)).conversionEvidence?.losslessEligible).toBe(true);
    });

    it("rejects unsupported geometry before touching the workbook destination", async () => {
        const issues = await new ParSheetExporter("1").exportToFile({...blueprint, screenGeometry: {}}, filePath);
        expect(issues).toContainEqual(
            expect.objectContaining({code: "parsheet-screen-geometry-unsupported", severity: "error"}),
        );
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it.each(["cancel", "write failure"])(
        "drains real workbook serialization and removes owned staging on %s",
        async (kind) => {
            const controller = new AbortController();
            const source = path.join(dir, "source.json");
            fs.writeFileSync(source, JSON.stringify(blueprint));
            const before = fs.readFileSync(source);
            const writeWorkbook = async (workbook: ExcelJS.Workbook, target: string): Promise<void> => {
                const serialization = workbook.xlsx.writeFile(target);
                if (kind === "cancel") controller.abort();
                await serialization;
                if (kind === "write failure") throw new Error("injected workbook write failure");
            };
            const exporter = new ParSheetExporter(
                "1",
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                writeWorkbook,
            );
            await expect(
                exporter.exportToFile(blueprint, filePath, source, {signal: controller.signal}),
            ).rejects.toThrow(kind === "cancel" ? /cancelled/ : /injected workbook write failure/);
            expect(fs.readdirSync(dir)).toEqual(["source.json"]);
            expect(fs.readFileSync(source)).toEqual(before);
            await new ParSheetExporter("1").exportToFile(blueprint, filePath, source);
            expect((await new ParSheetImporter().importFromFile(filePath)).conversionEvidence?.losslessEligible).toBe(
                true,
            );
        },
    );

    it("writes every sheet, with no error-level issues, for a fully-populated blueprint", async () => {
        const exporter = new ParSheetExporter("1.3.0");

        const issues = await exporter.exportToFile(blueprint, filePath, "config.json");

        // exportToFile runs the same GameBlueprintValidator "pokie build" uses (see requirement that
        // it validates fully on its own) — this fixture blueprint isn't tuned to be warning-free (see
        // the PAR starter Blueprint, which isn't either), just error-free.
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(await readSheetNames()).toEqual([
            "Info",
            "Symbols",
            "Paytable",
            "ReelStrips",
            "Paylines",
            "AvailableBets",
            "Meta",
        ]);
    });

    it("also writes WinModel/Mechanics/BetModes when the blueprint has them", async () => {
        const exporter = new ParSheetExporter("1.3.0");
        const withNewFields: GameBlueprint = {
            ...blueprint,
            symbols: ["A", "W", "S"],
            scatters: ["S"],
            reelStrips: [
                ["A", "W", "S"],
                ["W", "A", "S"],
            ],
            winModel: {type: "clusters", minimumClusterSize: 5},
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 8, "4": 15}, maxFreeGames: 100}},
            betModes: [
                {id: "base", label: "Base Game"},
                {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100},
            ],
        };

        const issues = await exporter.exportToFile(withNewFields, filePath, "config.json");

        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(await readSheetNames()).toEqual([
            "Info",
            "Symbols",
            "Paytable",
            "ReelStrips",
            "Paylines",
            "AvailableBets",
            "WinModel",
            "Mechanics",
            "BetModes",
            "Meta",
        ]);
        const imported = await new ParSheetImporter().importFromFile(filePath);
        expect(imported.blueprint.mechanics?.freeGames?.maxFreeGames).toBe(100);
    });

    it("omits the WinModel/Mechanics/BetModes sheets when the blueprint omits those optional fields", async () => {
        const exporter = new ParSheetExporter("1.3.0");

        await exporter.exportToFile(blueprint, filePath);

        const names = await readSheetNames();
        expect(names).not.toContain("WinModel");
        expect(names).not.toContain("Mechanics");
        expect(names).not.toContain("BetModes");
    });

    it("runs GameBlueprintValidator itself and rejects an invalid blueprint without writing anything", async () => {
        const exporter = new ParSheetExporter("1.3.0");
        const invalid = {...blueprint, symbols: []}; // "symbols" must be a non-empty array

        const issues = await exporter.exportToFile(invalid, filePath);

        expect(issues).toEqual(
            expect.arrayContaining([expect.objectContaining({code: "blueprint-symbols-invalid", severity: "error"})]),
        );
        expect(fs.existsSync(filePath)).toBe(false);
    });

    describe("preflight (no partial writes)", () => {
        it("materializes the engine-default reel source into a readable literal workbook", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withoutReelStrips: GameBlueprint = {...blueprint};
            Reflect.deleteProperty(withoutReelStrips, "reelStrips");

            const issues = await exporter.exportToFile(withoutReelStrips, filePath);

            expect(issues.some((issue) => issue.severity === "error")).toBe(false);
            expect(issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({code: "parsheet-default-reels-materialized", severity: "warning"}),
                ]),
            );
            const imported = await new ParSheetImporter().importFromFile(filePath);
            expect(imported.blueprint.reelStrips).toHaveLength(withoutReelStrips.reels);
            expect(withoutReelStrips.reelStrips).toBeUndefined();
        });

        it("leaves an existing file at filePath completely untouched when validation fails", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withoutReelStrips: GameBlueprint = {...blueprint};
            withoutReelStrips.reels = 0;
            const sentinelContent = "not a real xlsx file — a stand-in for whatever was already there";
            fs.writeFileSync(filePath, sentinelContent);

            const issues = await exporter.exportToFile(withoutReelStrips, filePath);

            expect(issues.some((issue) => issue.severity === "error")).toBe(true);
            expect(fs.readFileSync(filePath, "utf-8")).toBe(sentinelContent);
        });

        it("materializes reelStripGeneration into a readable literal workbook without changing the source", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withGeneration: GameBlueprint = {...blueprint};
            Reflect.deleteProperty(withGeneration, "reelStrips");
            withGeneration.reelStripGeneration = [
                {type: "literal", strip: ["A", "W"]},
                {type: "literal", strip: ["W", "A"]},
            ];

            const issues = await exporter.exportToFile(withGeneration, filePath);

            expect(issues.some((issue) => issue.severity === "error")).toBe(false);
            expect(withGeneration.reelStripGeneration).toHaveLength(2);
            expect((await new ParSheetImporter().importFromFile(filePath)).blueprint.reelStrips).toEqual([
                ["A", "W"],
                ["W", "A"],
            ]);
        });

        it("rejects an unseeded generated reel with a PAR snapshot diagnostic without touching an existing destination", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const unseeded = {
                ...blueprint,
                reelStripGeneration: [
                    {type: "generated", length: 2, symbolCounts: {A: 1, W: 1}},
                    {type: "literal", strip: ["W", "A"]},
                ],
            };
            const sentinel = "existing workbook stays untouched";
            fs.writeFileSync(filePath, sentinel);

            const issues = await exporter.exportToFile(unseeded, filePath);

            expect(issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        code: "parsheet-reel-generation-seed-required",
                        severity: "error",
                        message: expect.stringContaining("reelStripGeneration[0].seed"),
                        suggestion: expect.stringContaining('Add an integer "seed"'),
                    }),
                ]),
            );
            expect(fs.readFileSync(filePath, "utf-8")).toBe(sentinel);
        });

        // GameBlueprintValidator itself already rejects reelStrips + reelStripGeneration together as
        // mutually exclusive (blueprint-reelstrips-and-generation, an error) — so that combination
        // never even reaches ParSheetExporter's own reel-source check. Still: no file is written.
        it("creates no file when the blueprint has both reelStrips and reelStripGeneration (GameBlueprintValidator rejects that combination first)", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withBoth: GameBlueprint = {
                ...blueprint,
                reelStripGeneration: [
                    {type: "literal", strip: ["A", "W"]},
                    {type: "literal", strip: ["W", "A"]},
                ],
            };

            const issues = await exporter.exportToFile(withBoth, filePath);

            expect(issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({code: "blueprint-reelstrips-and-generation", severity: "error"}),
                ]),
            );
            expect(fs.existsSync(filePath)).toBe(false);
        });

        it("materializes symbolWeights into a readable literal workbook without changing the source", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withWeights: GameBlueprint = {...blueprint, symbolWeights: {A: 5, W: 1}};
            Reflect.deleteProperty(withWeights, "reelStrips");

            const issues = await exporter.exportToFile(withWeights, filePath);

            expect(issues.some((issue) => issue.severity === "error")).toBe(false);
            expect(withWeights.symbolWeights).toEqual({A: 5, W: 1});
            expect((await new ParSheetImporter().importFromFile(filePath)).blueprint.reelStrips).toHaveLength(
                withWeights.reels,
            );
        });

        it("exports literal reelStrips when the ignored symbolWeights field is also present", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withBoth: GameBlueprint = {...blueprint, symbolWeights: {A: 5, W: 1}};

            const issues = await exporter.exportToFile(withBoth, filePath);

            expect(issues.some((issue) => issue.severity === "error")).toBe(false);
            expect((await new ParSheetImporter().importFromFile(filePath)).blueprint.reelStrips).toEqual(
                blueprint.reelStrips,
            );
        });
    });

    it("omits the Paylines/AvailableBets sheets when the blueprint omits those optional fields", async () => {
        const exporter = new ParSheetExporter("1.3.0");
        const minimal: GameBlueprint = {...blueprint};
        Reflect.deleteProperty(minimal, "paylines");
        Reflect.deleteProperty(minimal, "availableBets");

        await exporter.exportToFile(minimal, filePath);

        const names = await readSheetNames();
        expect(names).not.toContain("Paylines");
        expect(names).not.toContain("AvailableBets");
    });

    it("writes the blueprint's info fields into the Info sheet", async () => {
        const exporter = new ParSheetExporter("1.3.0");

        await exporter.exportToFile(blueprint, filePath);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const manifestSheet = workbook.getWorksheet("Info")!;
        expect(manifestSheet.getRow(2).getCell(2).value).toBe("sample-slot");
        expect(manifestSheet.getRow(3).getCell(2).value).toBe("Sample Slot");
    });

    it("labels payline rows as 0-based in Info and on the Paylines header", async () => {
        const exporter = new ParSheetExporter("1.3.0");

        await exporter.exportToFile(blueprint, filePath);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const manifestSheet = workbook.getWorksheet("Info")!;
        const noteRow = [...Array(manifestSheet.rowCount).keys()]
            .map((index) => manifestSheet.getRow(index + 1))
            .find((row) => row.getCell(1).value === "Payline row basis");
        expect(noteRow?.getCell(2).value).toBe("0 = top row (0-based)");
        expect(workbook.getWorksheet("Paylines")!.getCell(1, 1).note).toContain("0-based");

        // The note is metadata, not an unknown import key: a round-trip must stay warning-free.
        const imported = await new ParSheetImporter().importFromFile(filePath);
        expect(imported.issues.some((issue) => issue.code === "parsheet-manifest-unknown-key")).toBe(false);
    });

    it("explains ragged reel lengths instead of presenting padding as missing data", async () => {
        const exporter = new ParSheetExporter("1.3.0");
        const ragged: GameBlueprint = {...blueprint, reelStrips: [["A"], ["W", "A"]]};
        await exporter.exportToFile(ragged, filePath);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        expect(workbook.getWorksheet("ReelStrips")!.getCell(1, 1).note).toContain("Reels may differ in length");
        expect(workbook.getWorksheet("ReelStrips")!.getCell(1, 1).note).toContain("padding, not missing data");
    });

    describe("write failure (real atomic writer, past preflight)", () => {
        it("propagates the error and leaves an existing target untouched when the underlying write fails", async () => {
            // A file can never be renamed onto an existing directory (EISDIR/ENOTEMPTY on every
            // platform, regardless of user privileges) — a reliable way to force the real write path
            // to fail *after* a fully valid blueprint has already passed every preflight check.
            fs.mkdirSync(filePath);
            fs.writeFileSync(path.join(filePath, "sentinel.txt"), "still here");
            const exporter = new ParSheetExporter("1.3.0");

            await expect(exporter.exportToFile(blueprint, filePath)).rejects.toThrow();

            expect(fs.statSync(filePath).isDirectory()).toBe(true);
            expect(fs.readFileSync(path.join(filePath, "sentinel.txt"), "utf-8")).toBe("still here");
            expect(fs.readdirSync(dir).filter((name) => name.includes(".tmp-"))).toEqual([]);
        });
    });
});
