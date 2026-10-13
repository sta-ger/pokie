import {createHash} from "node:crypto";
import ExcelJS from "exceljs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import {runInNewContext} from "node:vm";
import * as api from "@fromstan/pokie";
import {weightedBlueprint, weightedGame} from "./fixtures/WeightedWholeSequenceGame.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
describe("weighted-sequence real XLSX interchange", () => {
    let directory: string;
    let file: string;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "sequence-par-"));
        file = path.join(directory, "game.xlsx");
    });
    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });
    function model(): api.GameBlueprint {
        const blueprint = clone(weightedBlueprint);
        Reflect.deleteProperty(blueprint, "wilds");
        blueprint.scatters = ["S"];
        blueprint.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {2: 0}}};
        blueprint.betModes = [
            {id: "base", runtimeType: "base", isDefault: true},
            {id: "buy", runtimeType: "buyFeature", forcedFreeGames: 3, costMultiplier: 5},
        ];
        blueprint.reelSequences = [
            {
                type: "weighted",
                variants: [
                    {id: "001", weight: 0.25, symbols: ["A", "B"]},
                    {id: "Case", weight: 0.75, symbols: ["B", "A"]},
                    {id: "case", weight: 0, symbols: ["S", "S"]},
                ],
            },
            {type: "exact", symbols: ["A", "B"]},
        ];
        return blueprint;
    }
    it("preserves structural and runtime identities, seeded selections/screens/payouts/continuations/statistics and TS generation", async () => {
        const original = model();
        expect(
            (await new api.ParSheetExporter("1").exportToFile(original, file)).filter(
                (issue) => issue.severity === "error",
            ),
        ).toEqual([]);
        expect(fs.readFileSync(file).subarray(0, 2).toString()).toBe("PK");
        const imported = await new api.ParSheetImporter().importFromFile(file);
        expect(imported.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(imported.blueprint).toEqual(original);
        expect(imported.conversionEvidence).toMatchObject({losslessEligible: true, provenanceHashMatches: true});
        expect(api.computeBlueprintHash(imported.blueprint)).toBe(api.computeBlueprintHash(original));
        expect(api.computeGameBlueprintHash(imported.blueprint)).toBe(api.computeGameBlueprintHash(original));
        console.info(
            `V2C-09 artifact identities: XLSX sha256:${createHash("sha256")
                .update(fs.readFileSync(file))
                .digest("hex")}; structural ${api.computeBlueprintHash(
                imported.blueprint,
            )}; runtime ${api.computeGameBlueprintHash(imported.blueprint)}`,
        );
        const packageRoot = path.join(directory, "generated-game");
        new api.GamePackageGenerator("1").generate(imported.blueprint, directory, packageRoot);
        const generatedSource = fs.readFileSync(path.join(packageRoot, "src/index.ts"), "utf8");
        expect(generatedSource).toContain("WeightedSymbolsSequence");
        const module: {exports: unknown} = {exports: {}};
        runInNewContext(
            ts.transpileModule(generatedSource, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText,
            {require: () => api, module, exports: module.exports},
        );
        const games = [weightedGame(original), weightedGame(imported.blueprint), module.exports as api.PokieGame];
        const sessions = games.map((game) => game.createSession({seed: 42}) as api.VideoSlotWithBetModesSession);
        sessions.forEach((session) => session.setCreditsAmount(10000));
        const runtimes = sessions.map((session) => new api.SessionRuntime(session));
        try {
            for (let round = 0; round < 12; round++) {
                const command: api.SessionCommand = {
                    kind: "spin",
                    roundId: `r-${round}`,
                    delivery: "stepwise",
                    ...(round % 2 ? {mode: "buy"} : {}),
                };
                let results = runtimes.map((runtime) => runtime.execute(command));
                expect(results[1]).toEqual(results[0]);
                expect(results[2]).toEqual(results[0]);
                let first = results[0];
                while (first.status === "played" && first.logicalRound?.status === "pending") {
                    const continuation: api.SessionCommand = {
                        kind: "spin",
                        continuation: {roundId: command.roundId!, cursor: first.logicalRound.deliveryCursor},
                        delivery: "stepwise",
                    };
                    results = runtimes.map((runtime) => runtime.execute(continuation));
                    expect(results[1]).toEqual(results[0]);
                    expect(results[2]).toEqual(results[0]);
                    first = results[0];
                }
                sessions.slice(1).forEach((session) => {
                    expect(session.getSequenceSelections()).toEqual(sessions[0].getSequenceSelections());
                    expect(session.getSymbolsCombination().toMatrix()).toEqual(
                        sessions[0].getSymbolsCombination().toMatrix(),
                    );
                    expect(session.getWinAmount()).toBe(sessions[0].getWinAmount());
                    expect(session.toSessionState()).toEqual(sessions[0].toSessionState());
                    expect(session.getSequenceStatistics()).toEqual(sessions[0].getSequenceStatistics());
                });
                expect(sessions[0].getSequenceStatistics()[0].selections).toBe(round + 1);
            }
        } finally {
            runtimes.forEach((runtime) => runtime.release());
        }
        const statistics = games.map((game) =>
            new api.AggregateSimulationRunner(game.createSession({seed: 91}), 50).run().getStatistics(),
        );
        expect(statistics[1]).toEqual(statistics[0]);
        expect(statistics[2]).toEqual(statistics[0]);
    });
    it("retains fractional, zero, subnormal and extreme finite binary64 weights as text cells", async () => {
        const blueprint = model();
        const variants = (blueprint.reelSequences![0] as {variants: api.WeightedSequenceVariant[]}).variants;
        variants[0] = {...variants[0], weight: Number.MIN_VALUE};
        variants[1] = {...variants[1], weight: Number.MAX_VALUE};
        await new api.ParSheetExporter("1").exportToFile(blueprint, file);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(file);
        expect(workbook.getWorksheet("ReelSequences")!.getCell("E2").value).toBe(String(Number.MIN_VALUE));
        const imported = await new api.ParSheetImporter().importFromFile(file);
        expect(imported.blueprint.reelSequences).toEqual(blueprint.reelSequences);
        expect(imported.conversionEvidence?.losslessEligible).toBe(true);
        const game = weightedGame(imported.blueprint);
        const report = new api.SimulationReportBuilder().build({
            manifest: game.getManifest(),
            requestedRounds: 0,
            statistics: new api.AggregateSimulationRunner(game.createSession({seed: 1}), 0).run().getStatistics(),
            durationMs: 0,
        });
        expect(report.reelSequences![0].variants[0]).toMatchObject({
            probability: 0,
            count: 0,
            frequency: 0,
            uncovered: true,
        });
        expect(report.reelSequences![0].variants[0].probabilityRatio?.numerator).not.toBe("0");
        for (const rendered of [
            new api.MarkdownSimulationReportRenderer().render(report),
            new api.HtmlSimulationReportRenderer().render(report),
        ]) {
            expect(rendered).toContain("0 selections");
            expect(rendered).toContain("zero weight");
            expect(rendered).toContain("uncovered");
            expect(rendered).not.toContain("NaN");
        }
    });
    it.each([
        "ID",
        "weight",
        "symbols",
        "order",
        "variant order",
        "context",
        "gap",
        "trailing gap",
        "duplicate",
        "unknown",
        "conflict",
        "formula",
    ])("diagnoses workbook %s edits and withholds lossless evidence", async (edit) => {
        await new api.ParSheetExporter("1").exportToFile(model(), file);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(file);
        const sheet = workbook.getWorksheet("ReelSequences")!;
        if (edit === "ID") {
            sheet.getCell("D2").value = "Changed";
            sheet.getCell("D3").value = "Changed";
        }
        if (edit === "weight") {
            sheet.getCell("E2").value = "0.5";
            sheet.getCell("E3").value = "0.5";
        }
        if (edit === "symbols") sheet.getCell("G2").value = "S";
        if (edit === "order") {
            sheet.getCell("G2").value = "B";
            sheet.getCell("G3").value = "A";
        }
        if (edit === "variant order") {
            for (const row of [2, 3]) sheet.getCell(`B${row}`).value = 2;
            for (const row of [4, 5]) sheet.getCell(`B${row}`).value = 1;
        }
        if (edit === "trailing gap") sheet.spliceRows(3, 1);
        if (edit === "context") sheet.getCell("H2").value = "per-spin";
        if (edit === "gap") sheet.getCell("F3").value = 3;
        if (edit === "duplicate") sheet.getCell("F3").value = 1;
        if (edit === "unknown") sheet.getCell("G2").value = "Missing";
        if (edit === "conflict") workbook.addWorksheet("ReelStrips").addRows([
            ["Reel 1", "Reel 2"],
            ["A", "A"],
        ]);
        if (edit === "formula") sheet.getCell("E2").value = {formula: "1/4", result: 0.25};
        await workbook.xlsx.writeFile(file);
        const imported = await new api.ParSheetImporter().importFromFile(file);
        expect(imported.conversionEvidence?.losslessEligible).toBe(false);
        expect(
            imported.issues.some(
                (issue) =>
                    issue.severity === "error" ||
                    issue.code === "parsheet-provenance-hash-mismatch" ||
                    issue.code.includes("formula"),
            ),
        ).toBe(true);
    });
    it("supports planner/registry export, import with sidecar and workbook republishing; rejects occupied/alias/cancelled publications", async () => {
        const source = path.join(directory, "source.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(model()));
        const project: api.PokieProject = {
            type: "blueprint",
            rootPath: source,
            capabilities: api.PROJECT_TYPE_CAPABILITIES.blueprint,
            provenance: "authored",
        };
        expect(new api.ArtifactConversionPlanner().plan(project, "parWorkbook").status).not.toBe("unavailable");
        const registry = new api.ArtifactBuilderRegistry("1");
        await registry.build("parWorkbook", project, file);
        const workbookProject: api.PokieProject = {
            type: "parWorkbook",
            rootPath: file,
            capabilities: api.PROJECT_TYPE_CAPABILITIES.parWorkbook,
            provenance: "workbook",
        };
        const importedPath = path.join(directory, "imported.blueprint.json");
        const result = await registry.build("blueprint", workbookProject, importedPath);
        expect(JSON.parse(fs.readFileSync(importedPath, "utf8"))).toEqual(model());
        expect(JSON.parse(fs.readFileSync(result.conversionEvidencePath!, "utf8"))).toMatchObject({
            losslessEligible: true,
            provenanceHashMatches: true,
        });
        const packageRoot = path.join(directory, "automatic-package");
        await registry.build("tsPackage", workbookProject, packageRoot);
        expect(fs.readFileSync(path.join(packageRoot, "src/index.ts"), "utf8")).toContain("WeightedSymbolsSequence");
        const republished = path.join(directory, "republished.xlsx");
        await new api.ParWorkbookArtifactBuilder("1").build(workbookProject, republished);
        expect((await new api.ParSheetImporter().importFromFile(republished)).blueprint.reelSequences).toEqual(
            model().reelSequences,
        );
        const before = fs.readFileSync(file);
        await expect(new api.ParSheetExporter("1").exportToFile(model(), file)).rejects.toThrow();
        await expect(new api.ParWorkbookArtifactBuilder("1").build(project, source)).rejects.toThrow();
        expect(fs.readFileSync(file)).toEqual(before);
        expect(JSON.parse(fs.readFileSync(source, "utf8"))).toEqual(model());
        const cancellation = new AbortController();
        const cancelled = path.join(directory, "cancelled.xlsx");
        await expect(
            new api.ParSheetExporter("1").exportToFile(model(), cancelled, source, {
                signal: cancellation.signal,
                onProgress: (progress) => {
                    if (progress.message.includes("Committing")) cancellation.abort();
                },
            }),
        ).rejects.toThrow("cancelled");
        expect(fs.existsSync(cancelled)).toBe(false);
        expect(fs.readdirSync(directory).filter((name) => name.includes(".tmp"))).toEqual([]);
    });
    it("rolls back failed and cancelled Blueprint/evidence pairs and workbook writes without removing occupied artifacts", async () => {
        await new api.ParSheetExporter("1").exportToFile(model(), file);
        const source: api.PokieProject = {
            type: "parWorkbook",
            rootPath: file,
            capabilities: api.PROJECT_TYPE_CAPABILITIES.parWorkbook,
            provenance: "workbook",
        };
        const destination = path.join(directory, "output.json");
        const evidence = `${destination}.conversion-evidence.json`;
        fs.writeFileSync(evidence, "occupied evidence");
        await expect(new api.BlueprintArtifactBuilder().build(source, destination)).rejects.toThrow();
        expect(fs.readFileSync(evidence, "utf8")).toBe("occupied evidence");
        expect(fs.existsSync(destination)).toBe(false);
        fs.unlinkSync(evidence);
        const controller = new AbortController();
        await expect(
            new api.BlueprintArtifactBuilder().build(source, destination, {
                signal: controller.signal,
                onProgress: (progress) => {
                    if (progress.message?.includes("Publishing")) controller.abort();
                },
            }),
        ).rejects.toThrow();
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.existsSync(evidence)).toBe(false);
        const rename = fs.promises.rename.bind(fs.promises);
        const failure = jest
            .spyOn(fs.promises, "rename")
            .mockImplementation((from, to) =>
                String(to) === evidence ? Promise.reject(new Error("sidecar write failed")) : rename(from, to),
            );
        try {
            await expect(new api.BlueprintArtifactBuilder().build(source, destination)).rejects.toThrow(
                "sidecar write failed",
            );
        } finally {
            failure.mockRestore();
        }
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.existsSync(evidence)).toBe(false);
        const publication = jest
            .spyOn(fs.promises, "link")
            .mockRejectedValueOnce(new Error("workbook publication failed"));
        const rejectedWorkbook = path.join(directory, "failed.xlsx");
        try {
            await expect(new api.ParSheetExporter("1").exportToFile(model(), rejectedWorkbook)).rejects.toThrow(
                "workbook publication failed",
            );
        } finally {
            publication.mockRestore();
        }
        expect(fs.existsSync(rejectedWorkbook)).toBe(false);
        expect(fs.readdirSync(directory).filter((name) => name.includes(".tmp"))).toEqual([]);
    });
    it("preserves numeric-looking symbol text, key canonicalization and ordered identities", async () => {
        const blueprint = model();
        blueprint.symbols = ["001", "1", "S"];
        blueprint.paytable = {"001": {2: 0}};
        blueprint.reelSequences = [
            {
                type: "weighted",
                variants: [
                    {id: "01", weight: 0.1, symbols: ["001", "1"]},
                    {id: "1", weight: 0.2, symbols: ["1", "001"]},
                ],
            },
            {type: "exact", symbols: ["001", "1"]},
        ];
        await new api.ParSheetExporter("1").exportToFile(blueprint, file);
        const imported = await new api.ParSheetImporter().importFromFile(file);
        expect(imported.blueprint.reelSequences).toEqual(blueprint.reelSequences);
        expect(imported.conversionEvidence?.losslessEligible).toBe(true);
        const reorder = {
            ...blueprint,
            reelSequences: blueprint.reelSequences.map((reel) =>
                reel.type === "weighted"
                    ? {
                        variants: reel.variants.map(({id, symbols, weight}) => ({weight, symbols, id})),
                        type: "weighted" as const,
                    }
                    : {symbols: reel.symbols, type: "exact" as const},
            ),
        };
        expect(api.computeBlueprintHash(reorder)).toBe(api.computeBlueprintHash(blueprint));
    });
    it("round-trips all-exact sequences without introducing weighted selection", async () => {
        const blueprint = model();
        blueprint.reelSequences = [
            {type: "exact", symbols: ["A", "B"]},
            {type: "exact", symbols: ["B", "A"]},
        ];
        await new api.ParSheetExporter("1").exportToFile(blueprint, file);
        const imported = await new api.ParSheetImporter().importFromFile(file);
        expect(imported.blueprint.reelSequences).toEqual(blueprint.reelSequences);
        expect(imported.conversionEvidence?.losslessEligible).toBe(true);
        const session = weightedGame(imported.blueprint).createSession({seed: 1}) as api.VideoSlotSession;
        session.play();
        expect(session.getSequenceStatistics()).toEqual([]);
    });
});
