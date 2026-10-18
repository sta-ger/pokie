import {ParCommand} from "../../cli/commands/ParCommand.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {StudioArtifactBuildService} from "../../cli/studio/artifacts/StudioArtifactBuildService.js";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import ExcelJS from "exceljs";
import * as api from "@fromstan/pokie";
import {existingMechanicsBlueprint, generatedMechanicsGame, mechanicsSession} from "./fixtures/ExistingMechanicsGame.js";
import {boundedBlueprint} from "./fixtures/BoundedMechanicsGame.js";
import {weightedBonusBlueprint} from "./fixtures/WeightedBonusGame.js";
import {buildSingleOutcomeStakeEngineLibrary, buildStakeEngineTestLibrary} from "../stakeengine/StakeEngineTestFixtures.js";
import {expectRareMetrics} from "../stakeengine/standalone/StakeProbabilityTestFixtures.js";
import {writeNativeStakeTuningManifest} from "../../src/optimization/internal/NativeStakeTuningManifest.js";
import {ImportCommand} from "../../cli/commands/ImportCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {StakeEngineCommand} from "../../cli/commands/StakeEngineCommand.js";

let directory: string;
beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "interop-v26-"));
});
afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, {recursive: true, force: true});
});
const errors = (issues: readonly api.ValidationIssue[]) => issues.filter(issue => issue.severity === "error");
const project = (rootPath: string): api.PokieProject => ({rootPath, type: "stakeAdapter", capabilities: api.PROJECT_TYPE_CAPABILITIES.stakeAdapter, provenance: "test"});
const inventory = (root: string) => Object.fromEntries(fs.readdirSync(root).sort().map(name => [name, fs.readFileSync(path.join(root, name)).toString("base64")]));

const models: [string, () => api.GameBlueprint][] = [
    ...api.AUTHORED_MECHANIC_CATALOG.map(row => [row.id, () => existingMechanicsBlueprint(row)] as [string, () => api.GameBlueprint]),
    ...api.AUTHORED_BOUNDED_MECHANIC_CATALOG.map(id => [id, () => boundedBlueprint(id)] as [string, () => api.GameBlueprint]),
    ...api.AUTHORED_MODIFIER_CATALOG.map(id => [`modifier-${id}`, () => JSON.parse(fs.readFileSync(path.join(__dirname, `../../examples/blueprints/wild-${id}.blueprint.json`), "utf8")) as api.GameBlueprint] as [string, () => api.GameBlueprint]),
    ["weighted-bonus", weightedBonusBlueprint],
    ...(["lines", "ways", "clusters"] as const).map(type => [`evaluator-${type}`, () => ({...existingMechanicsBlueprint(api.AUTHORED_MECHANIC_CATALOG[0]), winModel: type === "clusters" ? {type, minimumClusterSize: 3} : {type}, paylines: [[0, 0, 0]]})] as [string, () => api.GameBlueprint]),
];

describe("real XLSX represented math", () => {
    it.each(models)("%s retains identity, projection, seeded terminal behavior and restored continuations", async (_name, model) => {
        const original = model();
        // PAR canonicalizes empty optional arrays to absence (its documented represented domain).
        for (const field of ["wilds", "scatters"] as const) if (original[field]?.length === 0) Reflect.deleteProperty(original, field);
        // Exercise exact and weighted reels alongside each supported mechanic/composition.
        original.reelSequences = original.reelStrips!.map((symbols, index) => index === 1 ? {type: "exact", symbols} : {type: "weighted", variants: [
            {id: "001", weight: 0.25, symbols: [...symbols, original.symbols[0], original.symbols[0]]}, {id: "Case", weight: 0.75, symbols: [...symbols, original.symbols[1], original.symbols[0]]}, {id: "case", weight: 0, symbols: [...symbols, original.symbols[1], original.symbols[1]]},
        ]});
        Reflect.deleteProperty(original, "reelStrips");
        original.paytable[original.symbols[original.symbols.length - 1]] ??= {};
        const file = path.join(directory, "math.xlsx");
        expect(errors(await new api.ParSheetExporter("1").exportToFile(original, file))).toEqual([]);
        const reopened = new ExcelJS.Workbook();
        await reopened.xlsx.readFile(file);
        expect(reopened.getWorksheet("ReelSequences")).toBeDefined();
        const imported = await new api.ParSheetImporter().importFromFile(file);
        expect(errors(imported.issues)).toEqual([]);
        expect(api.computeBlueprintHash(imported.blueprint)).toBe(api.computeBlueprintHash(original));
        expect(api.computeGameBlueprintHash(imported.blueprint)).toBe(api.computeGameBlueprintHash(original));
        expect(api.buildGameModelProjection(imported.blueprint)).toEqual(api.buildGameModelProjection(original));
        expect(imported.conversionEvidence?.losslessEligible).toBe(true);
        const games = [generatedMechanicsGame(original), generatedMechanicsGame(imported.blueprint)];
        const sessions = games.map(game => mechanicsSession(game, 31));
        const runtimes = sessions.map(session => new api.SessionRuntime(session));
        try {
            for (let round = 0; round < 6; round++) {
                sessions.forEach(session => session.setBet(original.availableBets![round % original.availableBets!.length]));
                const buy = original.betModes?.find(mode => mode.runtimeType === "buyFeature");
                const command: api.SessionCommand = {kind: "spin", roundId: `round-${round}`, delivery: "stepwise", ...(buy && round % 2 ? {mode: buy.id} : {})};
                let results = runtimes.map(runtime => runtime.execute(command));
                expect(results[1]).toEqual(results[0]);
                let result = results[0];
                let steps = 0;
                while (result.status === "played" && result.logicalRound?.status === "pending") {
                    expect(++steps).toBeLessThan(100);
                    const restored = mechanicsSession(games[1], 999);
                    restored.setBet(sessions[1].getBet());
                    restored.setCreditsAmount(sessions[1].getCreditsAmount());
                    restored.fromSessionState(JSON.parse(JSON.stringify(sessions[1].toSessionState())));
                    runtimes[1].release();
                    sessions[1] = restored;
                    runtimes[1] = new api.SessionRuntime(restored, result.logicalRound);
                    const continuation: api.SessionCommand = {kind: "spin", delivery: "stepwise", continuation: {roundId: command.roundId!, cursor: result.logicalRound.deliveryCursor}};
                    results = runtimes.map(runtime => runtime.execute(continuation));
                    expect(results[1]).toEqual(results[0]);
                    result = results[0];
                }
                expect(result.status).toBe("played");
                expect(sessions[1].toSessionState()).toEqual(sessions[0].toSessionState());
            }
        } finally {
            runtimes.forEach(runtime => runtime.release());
        }
        const edited = new ExcelJS.Workbook();
        await edited.xlsx.readFile(file);
        edited.getWorksheet("AvailableBets")!.getCell("A2").value = 0.1;
        await edited.xlsx.writeFile(file);
        const changed = await new api.ParSheetImporter().importFromFile(file);
        expect(changed.conversionEvidence?.losslessEligible).toBe(false);
        expect(api.computeBlueprintHash(changed.blueprint)).not.toBe(api.computeBlueprintHash(original));
    });

    it("preserves a competing workbook claimed during actual serialization through the artifact builder", async () => {
        const source = path.join(directory, "source.json"),
            output = path.join(directory, "claim.xlsx");
        fs.writeFileSync(source, JSON.stringify(boundedBlueprint()));
        const before = fs.readFileSync(source);
        const resolved = (await new api.ProjectTargetResolver().resolve(source))!;
        await expect(new api.ParWorkbookArtifactBuilder("1").build(resolved, output, {onProgress: progress => {
            if (progress.message === "Serializing PAR workbook") fs.writeFileSync(output, "competing workbook");
        }})).rejects.toThrow();
        expect(fs.readFileSync(output, "utf8")).toBe("competing workbook");
        expect(fs.readFileSync(source)).toEqual(before);
        expect(fs.readdirSync(directory).some(name => name.includes(".tmp-"))).toBe(false);
    });

    it.each((["registry", "CLI", "Studio"] as const).flatMap(caller => [false, true].map(replace => ({caller, replace}))))("$caller rolls back late cancellation and preserves replacement: $replace", async ({caller, replace}) => {
        const model = boundedBlueprint(),
            source = path.join(directory, "source.json"),
            output = path.join(directory, "result.xlsx");
        fs.writeFileSync(source, JSON.stringify(model));
        const before = fs.readFileSync(source),
            controller = new AbortController();
        const real = new api.ParSheetExporter("1");
        let active = true;
        const exporter: api.ParSheetExporting = {exportToFile: async (blueprint, target, origin, options) => {
            const issues = await real.exportToFile(blueprint, target, origin, options);
            if (active) {
                if (replace) {
                    fs.renameSync(target, `${target}.displaced`);
                    fs.writeFileSync(target, "independent replacement");
                }
                controller.abort();
            }
            return issues;
        }};
        const invoke = async (signal?: AbortSignal) => {
            if (caller === "registry") {
                const registry = new api.ArtifactBuilderRegistry("1", new Map([["parWorkbook", new api.ParWorkbookArtifactBuilder("1", undefined, exporter)]]));
                return registry.build("parWorkbook", (await new api.ProjectTargetResolver().resolve(source))!, output, {signal});
            }
            if (caller === "CLI") {
                const operation = new ParCommand("1", undefined, exporter).prepareDescriptorExportOperation(source, output, signal);
                return new api.ArtifactConversionPlanner().executeConversionPlan(operation.plan, operation.execution);
            }
            const service = new StudioBlueprintService("1", path.join(directory, "studio"), new StudioHomeService("1"), undefined, undefined, undefined, undefined, undefined, exporter);
            const result = await service.exportParSheet(model, output, false, source, signal);
            if (active) expect(result.status).toBe("error");
            else expect(result.status).toBe("ok");
            return result;
        };
        if (caller === "Studio") await invoke(controller.signal);
        else await expect(invoke(controller.signal)).rejects.toThrow(/cancelled/);
        if (replace) {
            expect(fs.readFileSync(output, "utf8")).toBe("independent replacement");
            fs.unlinkSync(output);
        } else expect(fs.existsSync(output)).toBe(false);
        expect(fs.readFileSync(source)).toEqual(before);
        active = false;
        await invoke();
        expect((await new api.ParSheetImporter().importFromFile(output)).conversionEvidence?.losslessEligible).toBe(true);
        expect(fs.readFileSync(source)).toEqual(before);
    });

    it.each(["headerless data", "duplicate payout column", "unknown Meta key", "duplicate Meta key", "extra Meta column"])("withholds lossless identity for %s even when the represented hash matches", async kind => {
        const file = path.join(directory, "ignored.xlsx");
        const original = boundedBlueprint();
        await new api.ParSheetExporter("1").exportToFile(original, file);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(file);
        const paytable = workbook.getWorksheet("Paytable")!,
            meta = workbook.getWorksheet("Meta")!;
        if (kind === "headerless data") paytable.getCell("D2").value = "ignored data";
        if (kind === "duplicate payout column") {
            paytable.getCell("D1").value = "Multiplier";
            paytable.getCell("D2").value = paytable.getCell("C2").value;
            paytable.getCell("C2").value = 999;
            for (let row = 3; row <= paytable.rowCount; row++) paytable.getCell(`D${row}`).value = paytable.getCell(`C${row}`).value;
        }
        if (kind === "unknown Meta key") meta.addRow(["Workbook Note", "unrepresented metadata"]);
        if (kind === "duplicate Meta key") {
            meta.addRow(["Blueprint Hash", api.computeBlueprintHash(original)]);
            meta.getCell("B6").value = `sha256:${"0".repeat(64)}`;
        }
        if (kind === "extra Meta column") meta.getCell("C1").value = "Ignored";
        await workbook.xlsx.writeFile(file);
        const before = fs.readFileSync(file);
        const imported = await new api.ParSheetImporter().importFromFile(file);
        expect(errors(imported.issues)).toEqual([]);
        expect(api.computeBlueprintHash(imported.blueprint)).toBe(api.computeBlueprintHash(original));
        expect(imported.conversionEvidence?.provenanceHashMatches).toBe(true);
        expect(imported.conversionEvidence?.losslessEligible).toBe(false);
        expect(imported.conversionEvidence?.facts.some(fact => fact.kind === "ignored")).toBe(true);
        expect(fs.readFileSync(file)).toEqual(before);
    });

    it.each(["lossy", "edited", "unprepared", "pristine"])("Studio draft re-export retains %s workbook history across restart without saving", async kind => {
        const file = path.join(directory, "draft.xlsx"),
            output = path.join(directory, "exported.xlsx"),
            studioRoot = path.join(directory, "studio");
        await new api.ParSheetExporter("1").exportToFile(boundedBlueprint(), file);
        if (kind === "lossy") {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(file);
            const cell = workbook.getWorksheet("AvailableBets")!.getCell("A2");
            cell.value = {formula: "1", result: cell.value as number};
            await workbook.xlsx.writeFile(file);
        }
        const before = fs.readFileSync(file);
        const service = new StudioBlueprintService("1", studioRoot, new StudioHomeService("1"));
        const imported = await service.importParSheet(file);
        expect(imported.status).toBe("ok");
        if (imported.status !== "ok") throw new Error(imported.error);
        expect(imported.errors).toEqual([]);
        if (kind === "edited") (imported.blueprint as api.GameBlueprint).availableBets = [0.05];
        const restarted = new StudioBlueprintService("1", kind === "unprepared" ? path.join(directory, "other-studio") : studioRoot, new StudioHomeService("1"));
        const exported = await restarted.exportParSheet(imported.blueprint, output, false, file);
        expect(exported.status).toBe("ok");
        if (exported.status !== "ok") throw new Error("Export failed");
        expect(exported.warnings.some(issue => issue.code === "parsheet-prior-conversion-loss")).toBe(kind !== "pristine");
        expect((await new api.ParSheetImporter().importFromFile(output)).conversionEvidence?.losslessEligible).toBe(kind === "pristine");
        expect(fs.readFileSync(file)).toEqual(before);
        expect(fs.readdirSync(directory).filter(name => name.endsWith(".json"))).toEqual([]);
    });

    it.each(["extra header", "extra data", "malformed JSON", "unknown mechanic", "formula"])("discloses %s in real Mechanics JSON workbooks", async kind => {
        const file = path.join(directory, "math.xlsx");
        const original = boundedBlueprint("cascade-collection");
        await new api.ParSheetExporter("1").exportToFile(original, file);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(file);
        const sheet = workbook.getWorksheet("Mechanics")!;
        if (kind === "extra header") sheet.getCell("C1").value = "Ignored";
        if (kind === "extra data") sheet.getCell("C2").value = "ignored setting";
        if (kind === "malformed JSON") sheet.getCell("B2").value = "{";
        if (kind === "unknown mechanic") sheet.getCell("A2").value = "custom";
        if (kind === "formula") sheet.getCell("B2").value = {formula: '"unused"', result: JSON.stringify(original.mechanics!.cascade)};
        await workbook.xlsx.writeFile(file);
        const imported = await new api.ParSheetImporter().importFromFile(file);
        expect(imported.conversionEvidence?.losslessEligible).toBe(false);
        expect(imported.issues.length).toBeGreaterThan(0);
    });
});

async function stakeFixture(): Promise<string> {
    const source = path.join(directory, "source");
    const library = buildStakeEngineTestLibrary({libraryId: "rare", betMode: "base", stake: 1});
    const outcomes = library.outcomes.slice(0, 2).map((outcome, id) => ({...outcome, id: String(id), weight: 1}));
    const result = await new api.StakeEngineExporter("1").exportToDirectory([{modeName: "base", cost: 1, library: api.buildWeightedOutcomeLibrary({libraryId: "rare", outcomes})}], source);
    expect(errors(result.issues)).toEqual([]);
    fs.writeFileSync(path.join(source, "lookup_base.csv"), "0,18446744073709551615,0\n1,1,200\n");
    return source;
}

function validateImportBytes(source: string): api.ValidationIssue[] {
    return new api.StakeEngineImportValidator().validate({
        stakeDir: source,
        index: {status: "ok", value: JSON.parse(fs.readFileSync(path.join(source, "index.json"), "utf8"))},
        manifest: {status: "ok", value: JSON.parse(fs.readFileSync(path.join(source, "pokie-manifest.json"), "utf8"))},
        modeFiles: [{modeName: "base", csv: {status: "ok", value: fs.readFileSync(path.join(source, "lookup_base.csv"), "utf8").trim().split("\n")}, books: {status: "ok", value: zlib.zstdDecompressSync(fs.readFileSync(path.join(source, "books_base.jsonl.zst"))).toString("utf8").trim().split("\n").map(line => ({status: "ok", value: JSON.parse(line)}))}}],
    });
}
function singleModeManifest(source: string): void {
    const file = path.join(source, "pokie-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as {modes: {outcomeCount: number}[]};
    manifest.modes[0].outcomeCount = 1;
    fs.writeFileSync(file, JSON.stringify(manifest));
}

describe("Stake exact interchange and independent numeric domains", () => {
    it("retains 2^64 weights through durable import/reopen/export, project and standalone analysis/diff and CLI reports", async () => {
        const source = await stakeFixture(),
            before = inventory(source);
        const imported = await new api.StakeEngineImporter().importFromDirectory(source);
        expect(errors(imported.issues)).toEqual([]);
        expect(imported.modes).toEqual([]);
        expect(imported.exactSource).toBeDefined();
        const durable = path.join(directory, "imported");
        expect(errors((await new api.StakeEngineImportWriter("1").writeToDirectory(imported, durable)).issues)).toEqual([]);
        const reopened = await new api.StakeEngineImporter().importFromDirectory(durable);
        const exported = path.join(directory, "exported");
        await new api.StakeEngineExporter("1").exportExactSourceToDirectory(reopened.exactSource!, exported);
        const built = path.join(directory, "built");
        fs.mkdirSync(built);
        await new api.ArtifactBuilderRegistry("1").build("stakeAdapter", project(durable), built);
        for (const output of [durable, exported, built]) expect(inventory(output)).toEqual(before);
        const analyze = async (root: string) => new api.StakeEngineStandaloneAnalyzer().analyze(await new api.StakeEngineOutcomeSourceReader().readFromDirectory(root));
        const left = await analyze(source),
            right = await analyze(exported);
        expectRareMetrics(left.modes[0]);
        expect(right.modes).toEqual(left.modes);
        expect(String(right.modes[0].totalWeight)).toBe("18446744073709551616");
        expect(new api.StakeEngineStandaloneAnalysisDiffer().diff(left, right).perMode.base.rtp.delta).toBe(0);
        const analyzer = new api.OutcomeSourceProjectAnalyzer();
        expect((await analyzer.analyze(project(exported))).modes).toEqual((await analyzer.analyze(project(source))).modes);
        const unchanged = await api.diffOutcomeSourceProjects(project(source), project(exported));
        expect(unchanged).toMatchObject({supported: true, diff: {changed: false}});
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const report = path.join(directory, "report.json");
        expect(await new StakeEngineCommand("1").run(["analyze", exported, "--format", "json", "--out", report])).toBe(0);
        expect(fs.readFileSync(report, "utf8")).toContain("18446744073709551616");
        expect(log.mock.calls.flat().join("\n")).toContain("0.000000000000000000054210108624");
        fs.writeFileSync(path.join(exported, "lookup_base.csv"), "0,18446744073709551615,0\n1,1,201\n");
        const booksFile = path.join(exported, "books_base.jsonl.zst");
        const books = zlib.zstdDecompressSync(fs.readFileSync(booksFile)).toString("utf8").replace(/200/g, "201");
        fs.writeFileSync(booksFile, zlib.zstdCompressSync(Buffer.from(books)));
        const changed = await analyze(exported);
        expect(new api.StakeEngineStandaloneAnalysisDiffer().diff(left, changed).perMode.base.rtp.delta).toBeGreaterThan(0);
        const projectDiff = await api.diffOutcomeSourceProjects(project(source), project(exported));
        expect(projectDiff).toMatchObject({supported: true, diff: {changed: true}});
        if (projectDiff.supported) expect(projectDiff.diff.perMode.base.rtp.delta).toBeGreaterThan(0);
        expect(inventory(source)).toEqual(before);
    });

    it("routes canonical import, Stake alias, dry-run and build through the exact payload contract", async () => {
        const source = await stakeFixture(),
            before = inventory(source);
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const canonical = path.join(directory, "canonical"),
            alias = path.join(directory, "alias"),
            built = path.join(directory, "cli-built");
        expect(await new ImportCommand("1").run([source, "--out", canonical, "--dry-run"])).toBe(0);
        expect(fs.existsSync(canonical)).toBe(false);
        expect(log.mock.calls.flat().join("\n")).toContain("Exact Stake payload");
        expect(await new ImportCommand("1").run([source, "--out", canonical, "--format", "json"])).toBe(0);
        expect(await new StakeEngineCommand("1").run(["import", source, "--out", alias, "--format", "json"])).toBe(0);
        expect(await new BuildCommand("1").run([canonical, "--target", "stakeAdapter", "--out", built])).toBe(0);
        for (const output of [canonical, alias, built]) {
            expect(inventory(output)).toEqual(before);
            expect((await new api.ProjectTargetResolver().resolve(output))?.type).toBe("stakeAdapter");
        }
        expect(inventory(source)).toEqual(before);
    });

    it("reuses optimizer-native payloads without restoring archived library provenance", async () => {
        const source = await stakeFixture();
        fs.renameSync(path.join(source, "pokie-manifest.json"), path.join(source, "optimization-input-pokie-manifest.json"));
        writeNativeStakeTuningManifest(source);
        const before = inventory(source),
            output = path.join(directory, "native-export");
        const resolved = (await new api.ProjectTargetResolver().resolve(source))!;
        expect(resolved.capabilities).toContain(api.STAKE_ADAPTER_EXPORT_CAPABILITY);
        expect(resolved.capabilities).not.toContain(api.STAKE_ADAPTER_EXCHANGE_CAPABILITY);
        expect(resolved.capabilities).not.toContain(api.OUTCOME_SOURCE_SAMPLE_CAPABILITY);
        expect(new api.ArtifactConversionPlanner().planImportOutput(resolved, "outcomeLibrary", path.join(directory, "unsupported-native-import")).status).toBe("unavailable");
        await new api.ArtifactBuilderRegistry("1").build("stakeAdapter", resolved, output);
        const stdout = jest.spyOn(console, "log").mockImplementation(() => undefined);
        expect(await new ValidateCommand().run([output, "--format", "json"])).toBe(2);
        expect(JSON.parse(stdout.mock.calls[stdout.mock.calls.length - 1][0] as string)).toMatchObject({valid: true, errors: [], advanced: {verdict: "inconclusive"}});
        const studio = new StudioArtifactBuildService("1");
        const studioOutput = path.join(directory, "studio-native");
        expect((await studio.preview(source, "stakeAdapter", studioOutput)).status).toBe("ok");
        const built = await studio.build(source, "stakeAdapter", studioOutput);
        expect(built).toMatchObject({status: "ok", stakeFiles: expect.arrayContaining(["pokie-native-weights.json", "lookup_base.csv"])});
        expect(inventory(studioOutput)).toEqual(before);
        expect(inventory(output)).toEqual(before);
        expectRareMetrics(new api.StakeEngineStandaloneAnalyzer().analyze(await new api.StakeEngineOutcomeSourceReader().readFromDirectory(output)).modes[0]);
    });

    it.each(["0", "9007199254740991", "9007199254740992", "-1", "0.5"])("validates CSV, JSONL and direct exporter ID %s independently", async id => {
        const source = await stakeFixture();
        const valid = id === "0" || id === "9007199254740991";
        singleModeManifest(source);
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "id", betMode: "base", stake: 1, totalWin: 0});
        const mode = {modeName: "base", cost: 1, library: {...library, outcomes: [{...library.outcomes[0], id}]}};
        expect(new api.StakeEngineExportValidator().validate([mode]).some(issue => issue.code === "stakeengine-outcome-id-not-integer")).toBe(!valid);
        for (const boundary of ["CSV", "books"]) {
            fs.writeFileSync(path.join(source, "lookup_base.csv"), `${boundary === "CSV" || valid ? id : "0"},1,0\n`);
            fs.writeFileSync(path.join(source, "books_base.jsonl.zst"), zlib.zstdCompressSync(Buffer.from(`{"id":${boundary === "books" || valid ? id : "0"},"payoutMultiplier":0,"events":[]}\n`)));
            const read = await new api.StakeEngineOutcomeSourceReader().readFromDirectory(source);
            expect(read.issues.some(issue => issue.code === "stakeengine-standalone-outcome-id-not-integer")).toBe(!valid);
            expect(validateImportBytes(source).some(issue => issue.code === "stakeengine-import-outcome-id-not-integer")).toBe(!valid);
            if (valid) {
                expect(errors(read.issues)).toEqual([]);
                expect(errors(validateImportBytes(source))).toEqual([]);
            }
        }
    });

    it.each(["0", "9007199254740991", "9007199254740992"])("validates raw CSV and book payout %s with valid ID/weight", async payout => {
        const source = await stakeFixture(),
            valid = payout !== "9007199254740992";
        singleModeManifest(source);
        for (const boundary of ["CSV", "books"]) {
            fs.writeFileSync(path.join(source, "lookup_base.csv"), `0,1,${boundary === "CSV" || valid ? payout : "0"}\n`);
            fs.writeFileSync(path.join(source, "books_base.jsonl.zst"), zlib.zstdCompressSync(Buffer.from(`{"id":0,"payoutMultiplier":${boundary === "books" || valid ? payout : "0"},"events":[]}\n`)));
            const read = await new api.StakeEngineOutcomeSourceReader().readFromDirectory(source);
            expect(read.issues.some(issue => issue.code === "stakeengine-standalone-outcome-payout-multiplier-not-safe-integer")).toBe(!valid);
            expect(validateImportBytes(source).some(issue => issue.code === "stakeengine-import-outcome-payout-multiplier-not-safe-integer")).toBe(!valid);
            if (valid) {
                expect(errors(read.issues)).toEqual([]);
                expect(errors(validateImportBytes(source))).toEqual([]);
            }
        }
    });

    it.each(["1", "18446744073709551615", "18446744073709551616", "0", "-1", "0.5", ""])("validates weight %s independently of IDs and payouts", async weight => {
        const source = await stakeFixture(),
            valid = weight === "1" || weight === "18446744073709551615";
        fs.writeFileSync(path.join(source, "lookup_base.csv"), `0,${weight},0\n1,1,200\n`);
        for (const result of [await new api.StakeEngineImporter().importFromDirectory(source), await new api.StakeEngineOutcomeSourceReader().readFromDirectory(source)]) {
            expect(result.issues.some(issue => issue.code.includes("weight-not-positive-integer"))).toBe(!valid);
        }
    });

    it("diagnoses an absent CSV weight column separately from a blank value", async () => {
        const source = await stakeFixture();
        fs.writeFileSync(path.join(source, "lookup_base.csv"), "0,0\n1,1,200\n");
        const imported = await new api.StakeEngineImporter().importFromDirectory(source);
        expect(imported.issues).toContainEqual(expect.objectContaining({code: "stakeengine-import-csv-malformed-row", severity: "error"}));
        expect(imported.exactSource).toBeUndefined();
        expect(imported.modes).toEqual([]);
    });

    it("diagnoses a books ID without a CSV weight", async () => {
        const source = await stakeFixture();
        fs.writeFileSync(path.join(source, "lookup_base.csv"), "0,1,0\n");
        expect((await new api.StakeEngineImporter().importFromDirectory(source)).issues.some(issue => issue.code.includes("id-set-mismatch"))).toBe(true);
    });

    it.each([{ratio: 1 / 3, raw: 100}, {ratio: 1 / 300, raw: 1}])("retains cost 3 raw $raw through native import/re-export with binary64 ratios", async ({ratio, raw}) => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "cost-three", betMode: "base", stake: 1, totalWin: ratio});
        const source = path.join(directory, "cost-three"),
            output = path.join(directory, "reexported");
        expect(errors((await new api.StakeEngineExporter("1").exportToDirectory([{modeName: "base", cost: 3, library}], source)).issues)).toEqual([]);
        expect(fs.readFileSync(path.join(source, "lookup_base.csv"), "utf8")).toBe(`0,1,${raw}\n`);
        const before = inventory(source),
            imported = await new api.StakeEngineImporter().importFromDirectory(source);
        expect(errors(imported.issues)).toEqual([]);
        const artifact = imported.modes[0].library.outcomes[0].artifact;
        for (const actual of [artifact.payoutMultiplier, artifact.totalWin]) {
            expect(actual).toBeGreaterThan(0);
            expect(Math.abs(actual / ratio - 1)).toBeLessThanOrEqual(2 * Number.EPSILON);
        }
        expect(errors((await new api.StakeEngineExporter("1").exportToDirectory(imported.modes, output)).issues)).toEqual([]);
        for (const name of ["index.json", "lookup_base.csv", "books_base.jsonl.zst"]) expect(inventory(output)[name]).toBe(before[name]);
        expect(inventory(source)).toEqual(before);
    });

    it("rejects positive native payout underflow before publication instead of exporting a zero", async () => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "underflow", betMode: "base", stake: 1, totalWin: Number.MIN_VALUE});
        const output = path.join(directory, "underflow");
        const result = await new api.StakeEngineExporter("1").exportToDirectory([{modeName: "base", cost: Number.MIN_VALUE, library}], output);
        expect(result.issues).toContainEqual(expect.objectContaining({code: "stakeengine-outcome-payout-multiplier-not-representable", severity: "error"}));
        expect(fs.existsSync(output)).toBe(false);
    });

    it("retains explicit rejection of a raw payout with no exactly reversible native ratio", async () => {
        const source = path.join(directory, "unrepresentable");
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "unrepresentable", betMode: "base", stake: 1, totalWin: 0});
        await new api.StakeEngineExporter("1").exportToDirectory([{modeName: "base", cost: 1, library}], source);
        fs.writeFileSync(path.join(source, "lookup_base.csv"), "0,1,7\n");
        const booksFile = path.join(source, "books_base.jsonl.zst");
        const books = JSON.parse(zlib.zstdDecompressSync(fs.readFileSync(booksFile)).toString("utf8")) as {payoutMultiplier: number; events: {amount?: number; payoutMultiplier?: number}[]};
        books.payoutMultiplier = 7;
        books.events[books.events.length - 1].amount = 7;
        books.events[books.events.length - 1].payoutMultiplier = 7;
        fs.writeFileSync(booksFile, zlib.zstdCompressSync(Buffer.from(JSON.stringify(books) + "\n")));
        const before = inventory(source),
            imported = await new api.StakeEngineImporter().importFromDirectory(source);
        expect(imported.issues).toContainEqual(expect.objectContaining({code: "stakeengine-import-payout-multiplier-not-invertible", severity: "error"}));
        const output = path.join(directory, "unsupported-import");
        await new api.StakeEngineImportWriter("1").writeToDirectory(imported, output);
        expect(fs.existsSync(output)).toBe(false);
        expect(inventory(source)).toEqual(before);
    });

    it("rejects unsafe numeric exporter weights and preserves fractional stake/cost reversal", async () => {
        for (const stake of [0.05, 7.5, 1e-7]) {
            const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "fraction", betMode: "base", stake, totalWin: stake * 2});
            const output = path.join(directory, `fraction-${stake}`);
            const exported = await new api.StakeEngineExporter("1").exportToDirectory([{modeName: "base", cost: 1.5, library}], output);
            expect(errors(exported.issues)).toEqual([]);
            const imported = await new api.StakeEngineImporter().importFromDirectory(output);
            expect(errors(imported.issues)).toEqual([]);
            expect(imported.modes[0].library.outcomes[0].artifact).toMatchObject({stake, payoutMultiplier: 2, totalWin: stake * 2});
            const unsafe = {...library, outcomes: [{...library.outcomes[0], weight: 9007199254740992}]};
            expect(new api.StakeEngineExportValidator().validate([{modeName: "base", cost: 1.5, library: unsafe}]).some(issue => issue.code === "stakeengine-outcome-weight-not-integer")).toBe(true);
        }
    });

    it("keeps descriptor export aliases on the new/empty contract and preserves their source files", async () => {
        const libraryFile = path.join(directory, "library.json"),
            descriptor = path.join(directory, "config.json"),
            output = path.join(directory, "descriptor-export");
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "descriptor", betMode: "base", stake: 0.05, totalWin: 0.1});
        fs.writeFileSync(libraryFile, JSON.stringify(library));
        fs.writeFileSync(descriptor, JSON.stringify({modes: [{modeName: "base", cost: 1, libraryPath: "library.json"}]}));
        const before = [fs.readFileSync(libraryFile), fs.readFileSync(descriptor)];
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        fs.mkdirSync(output);
        expect(await new StakeEngineCommand("1").run(["export", descriptor, "--out", output])).toBe(0);
        const published = inventory(output);
        await expect(new StakeEngineCommand("1").run(["export", descriptor, "--out", output])).rejects.toThrow(/already exists|not empty/);
        expect(inventory(output)).toEqual(published);
        const built = path.join(directory, "descriptor-build");
        expect(await new BuildCommand("1").run([descriptor, "--target", "stakeAdapter", "--out", built])).toBe(0);
        expect([fs.readFileSync(libraryFile), fs.readFileSync(descriptor)]).toEqual(before);
    });

    it("never adopts a recognized Stake claimant arriving before the concrete exporter captures its destination", async () => {
        const source = await stakeFixture(),
            output = path.join(directory, "claimed-stake");
        fs.writeFileSync(path.join(source, "lookup_base.csv"), "0,1,0\n1,1,200\n");
        const before = inventory(source),
            real = new api.StakeEngineExporter("1");
        let claim = true;
        const exporter: api.StakeEngineExporting = {exportToDirectory: (modes, target, options) => {
            if (claim) {
                fs.cpSync(source, target, {recursive: true});
                fs.writeFileSync(path.join(target, "foreign.txt"), "competing recognized export");
            }
            return real.exportToDirectory(modes, target, options);
        }};
        const builder = new api.StakeAdapterArtifactBuilder("1", undefined, exporter);
        await expect(builder.build((await new api.ProjectTargetResolver().resolve(source))!, output)).rejects.toThrow(/claimed/);
        expect(fs.readFileSync(path.join(output, "foreign.txt"), "utf8")).toBe("competing recognized export");
        expect(inventory(output)).toEqual({...before, "foreign.txt": Buffer.from("competing recognized export").toString("base64")});
        expect(inventory(source)).toEqual(before);
        fs.rmSync(output, {recursive: true});
        claim = false;
        await builder.build((await new api.ProjectTargetResolver().resolve(source))!, output);
        expect(errors((await new api.StakeEngineOutcomeSourceReader().readFromDirectory(output)).issues)).toEqual([]);
        expect(inventory(source)).toEqual(before);
    });

    it("rejects non-invertible event amounts and preserves an independently claimed destination", async () => {
        const source = await stakeFixture(),
            imported = await new api.StakeEngineImporter().importFromDirectory(source);
        const output = path.join(directory, "claim");
        let claimed = false;
        await expect(new api.StakeEngineExporter("1").exportExactSourceToDirectory(imported.exactSource!, output, {onProgress: () => {
            if (!claimed) {
                fs.mkdirSync(output);
                fs.writeFileSync(path.join(output, "keep"), "foreign");
                claimed = true;
            }
        }})).rejects.toThrow(/claimed/);
        expect(fs.readFileSync(path.join(output, "keep"), "utf8")).toBe("foreign");
        expect(() => new api.StakeEngineRoundEventsImporter().importEvents([
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "win", amount: 1},
            {index: 2, type: "finalWin", amount: 1, payoutMultiplier: 1},
        ], {stake: 1, cost: Number.MIN_VALUE})).toThrow();
    });

    it("preserves sources and occupied outputs on cancel/write/publication failures and supports retry", async () => {
        const source = await stakeFixture(),
            before = inventory(source);
        const imported = await new api.StakeEngineImporter().importFromDirectory(source);
        const output = path.join(directory, "failed");
        for (const phase of ["before", "during"]) {
            const controller = new AbortController();
            if (phase === "before") controller.abort();
            await expect(new api.StakeEngineExporter("1").exportExactSourceToDirectory(imported.exactSource!, output, {signal: controller.signal, onProgress: () => controller.abort()})).rejects.toThrow(/cancelled/);
            expect(fs.existsSync(output)).toBe(false);
        }
        fs.mkdirSync(output);
        fs.writeFileSync(path.join(output, "keep"), "occupied");
        await expect(new api.StakeEngineImportWriter("1").writeToDirectory(imported, output)).rejects.toThrow();
        expect(fs.readFileSync(path.join(output, "keep"), "utf8")).toBe("occupied");
        fs.rmSync(output, {recursive: true});
        const write = jest.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
            throw new Error("injected write failure");
        });
        await expect(new api.StakeEngineImportWriter("1").writeToDirectory(imported, output)).rejects.toThrow("injected write failure");
        write.mockRestore();
        expect(fs.existsSync(output)).toBe(false);
        await new api.StakeEngineImportWriter("1").writeToDirectory(imported, output);
        expect(inventory(output)).toEqual(before);
        expect(inventory(source)).toEqual(before);
    });
});

describe("V2C-26 review conversion boundaries", () => {
    it.each(["unsupported schema", "malformed schema", "missing schema", "invalid eligibility", "invalid history", "legacy eligibility", "pristine"])("keeps %s disposition across direct, CLI, Studio and durable re-export", async kind => {
        const source = path.join(directory, "source.xlsx");
        await new api.ParSheetExporter("1").exportToFile(boundedBlueprint(), source);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(source);
        const meta = workbook.getWorksheet("Meta")!;
        if (kind === "unsupported schema") meta.getCell("B2").value = 99;
        if (kind === "malformed schema") meta.getCell("B2").value = "invalid";
        if (kind === "missing schema") meta.spliceRows(2, 1);
        if (kind === "invalid eligibility") meta.getCell("B7").value = "invalid";
        if (kind === "invalid history") meta.getCell("B8").value = "invalid";
        if (kind === "legacy eligibility") meta.spliceRows(7, 1);
        await workbook.xlsx.writeFile(source);
        const before = fs.readFileSync(source);
        const imported = await new api.ParSheetImporter().importFromFile(source);
        const eligible = kind === "pristine" || kind === "legacy eligibility";
        expect(errors(imported.issues)).toEqual([]);
        expect(imported.conversionEvidence?.provenanceHashMatches).toBe(true);
        expect(imported.conversionEvidence?.losslessEligible).toBe(eligible);
        const codes: Record<string, string> = {"unsupported schema": "parsheet-provenance-schema-mismatch", "invalid eligibility": "parsheet-provenance-lossless-invalid", "invalid history": "parsheet-provenance-history-invalid"};
        const code = codes[kind] ?? "parsheet-provenance-malformed";
        if (!eligible) expect(imported.issues).toContainEqual(expect.objectContaining({code}));
        const direct = path.join(directory, "direct.xlsx");
        await new api.ParSheetExporter("1").exportToFile(imported.blueprint, direct, source);
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const cli = path.join(directory, "cli.xlsx");
        expect(await new BuildCommand("1").run([source, "--target", "parWorkbook", "--out", cli])).toBe(0);
        if (!eligible) expect(log.mock.calls.flat().join("\n")).toContain(code);
        const studioPath = path.join(directory, "studio.xlsx");
        const studio = new StudioArtifactBuildService("1");
        const preview = await studio.preview(source, "parWorkbook", studioPath);
        expect(preview).toMatchObject({status: "ok", plan: {parConversion: {losslessEligible: eligible}}});
        const result = await studio.build(source, "parWorkbook", studioPath);
        expect(result).toMatchObject({status: "ok", parConversion: {losslessEligible: eligible}});
        const blueprintPath = path.join(directory, "imported.json");
        const publication = await new api.BlueprintArtifactBuilder().build((await new api.ProjectTargetResolver().resolve(source))!, blueprintPath);
        const evidence = JSON.parse(fs.readFileSync(publication.conversionEvidencePath!, "utf8"));
        expect(evidence.losslessEligible).toBe(eligible);
        const durable = path.join(directory, "durable.xlsx");
        await new api.ParWorkbookArtifactBuilder("1").build((await new api.ProjectTargetResolver().resolve(blueprintPath))!, durable);
        const aliasBlueprint = path.join(directory, "alias.json"),
            aliasWorkbook = path.join(directory, "alias.xlsx");
        expect(await new ParCommand("1").run(["import", source, "--out", aliasBlueprint, "--format", "json"])).toBe(0);
        expect(await new ParCommand("1").run(["export", aliasBlueprint, "--out", aliasWorkbook])).toBe(0);
        const draftService = new StudioBlueprintService("1", path.join(directory, "studio-home"), new StudioHomeService("1"));
        const draft = await draftService.importParSheet(source);
        expect(draft.status).toBe("ok");
        if (draft.status !== "ok") throw new Error("Expected imported draft");
        const draftPath = path.join(directory, "draft-export.xlsx");
        expect((await draftService.exportParSheet(draft.blueprint, draftPath, false, source)).status).toBe("ok");
        for (const output of [direct, cli, studioPath, durable, draftPath, aliasWorkbook]) {
            const reopened = await new api.ParSheetImporter().importFromFile(output);
            expect(reopened.conversionEvidence?.losslessEligible).toBe(eligible);
            if (!eligible) expect(reopened.conversionEvidence?.facts).toContainEqual(expect.objectContaining({code}));
        }
        expect(fs.readFileSync(source)).toEqual(before);
    });

    it.each(["formula", "ignored", "default reels", "shared weights", "generated reels"])("discloses and retains %s facts in canonical plans, results and evidence", async kind => {
        const model = boundedBlueprint();
        if (kind === "generated reels") {
            model.reelStripGeneration = model.reelStrips!.map(strip => ({type: "generated" as const, length: strip.length, symbolCounts: Object.fromEntries(model.symbols.map(symbol => [symbol, strip.filter(value => value === symbol).length])), seed: 17}));
        }
        if (kind === "default reels" || kind === "shared weights" || kind === "generated reels") Reflect.deleteProperty(model, "reelStrips");
        if (kind === "shared weights") model.symbolWeights = Object.fromEntries(model.symbols.map(symbol => [symbol, 1]));
        const blueprint = path.join(directory, "source.json");
        fs.writeFileSync(blueprint, JSON.stringify(model));
        const source = path.join(directory, "source.xlsx");
        const registry = new api.ArtifactBuilderRegistry("1");
        const project = (await new api.ProjectTargetResolver().resolve(blueprint))!;
        const initialPlan = await registry.preparePlan(project, "parWorkbook", {destinationPath: source});
        const first = await registry.executePlan(initialPlan, project, source);
        if (kind === "default reels" || kind === "shared weights" || kind === "generated reels") {
            expect(initialPlan.parConversion?.losslessEligible).toBe(false);
            expect(first.parConversion).toEqual(initialPlan.parConversion);
        }
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(source);
        if (kind === "formula") {
            const cell = workbook.getWorksheet("AvailableBets")!.getCell("A2");
            cell.value = {formula: "1", result: cell.value as number};
        }
        if (kind === "ignored") workbook.addWorksheet("Author Notes").addRow(["unrepresented"]);
        await workbook.xlsx.writeFile(source);
        const imported = await new api.ParSheetImporter().importFromFile(source);
        expect(imported.conversionEvidence?.losslessEligible).toBe(false);
        const codes: Record<string, string> = {formula: "parsheet-formula-cell", ignored: "parsheet-unknown-sheet"};
        const expected = codes[kind] ?? first.parConversion!.issues.find(issue => issue.details?.losslessEligible === false)!.code;
        const output = path.join(directory, "republished.xlsx");
        const resolved = (await new api.ProjectTargetResolver().resolve(source))!;
        const plan = await registry.preparePlan(resolved, "parWorkbook", {destinationPath: output});
        const result = await registry.executePlan(plan, resolved, output);
        for (const report of [plan.parConversion, result.parConversion]) {
            expect(report?.losslessEligible).toBe(false);
            expect(report?.issues).toContainEqual(expect.objectContaining({code: expected}));
            expect(report?.facts).toEqual(expect.arrayContaining(imported.conversionEvidence!.facts));
        }
        const second = await new api.ParSheetImporter().importFromFile(output);
        expect(second.conversionEvidence?.facts).toEqual(expect.arrayContaining(imported.conversionEvidence!.facts));
        const durable = await new api.BlueprintArtifactBuilder().build((await new api.ProjectTargetResolver().resolve(output))!, path.join(directory, "durable.json"));
        expect(JSON.parse(fs.readFileSync(durable.conversionEvidencePath!, "utf8")).facts).toEqual(expect.arrayContaining(imported.conversionEvidence!.facts));
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        expect(await new BuildCommand("1").run([source, "--target", "parWorkbook", "--out", path.join(directory, "dry.xlsx"), "--dry-run"])).toBe(0);
        expect(log.mock.calls.flat().join("\n")).toContain(expected);
        const studio = new StudioArtifactBuildService("1");
        const studioPath = path.join(directory, "studio.xlsx");
        expect(await studio.preview(source, "parWorkbook", studioPath)).toMatchObject({status: "ok", plan: {parConversion: {facts: expect.arrayContaining(imported.conversionEvidence!.facts)}}});
        expect(await studio.build(source, "parWorkbook", studioPath)).toMatchObject({status: "ok", parConversion: {facts: expect.arrayContaining(imported.conversionEvidence!.facts)}});
    });

    it.each((["numeric", "wide", "native"] as const).flatMap(domain => ["weights", "books", "index", "provenance", "coordinated payout"].map(change => ({domain, change}))))("rejects retained $domain Stake preview after valid $change change and accepts fresh preparation", async ({domain, change}) => {
        const source = await stakeFixture();
        if (domain === "numeric") fs.writeFileSync(path.join(source, "lookup_base.csv"), "0,1,0\n1,1,200\n");
        if (domain === "native") {
            fs.renameSync(path.join(source, "pokie-manifest.json"), path.join(source, "optimization-input-pokie-manifest.json"));
            writeNativeStakeTuningManifest(source);
        }
        const resolver = new api.ProjectTargetResolver();
        const project = (await resolver.resolve(source))!;
        expect(project.configurationProvenance?.inputBindingHash).toBeDefined();
        const registry = new api.ArtifactBuilderRegistry("1");
        const output = path.join(directory, "stale");
        const plan = await registry.preparePlan(project, "stakeAdapter", {destinationPath: output});
        const studio = new StudioArtifactBuildService("1");
        const operation = (await studio.prepareStakeProjection(source, path.join(directory, "studio")))!;
        if (change === "weights") fs.writeFileSync(path.join(source, "lookup_base.csv"), domain === "numeric" ? "0,1,0\n1,2,200\n" : "0,18446744073709551614,0\n1,2,200\n");
        if (change === "books") {
            // Valid changed book encoding, consumed by both native and numeric readers.
            const file = path.join(source, "books_base.jsonl.zst");
            const rows = zlib.zstdDecompressSync(fs.readFileSync(file)).toString("utf8").trim().split("\n").map(row => JSON.stringify(JSON.parse(row), null, 0));
            fs.writeFileSync(file, zlib.zstdCompressSync(Buffer.from(`${rows.join("\r\n")}\r\n`)));
        }
        if (change === "coordinated payout") {
            const weights = path.join(source, "lookup_base.csv"),
                books = path.join(source, "books_base.jsonl.zst");
            fs.writeFileSync(weights, fs.readFileSync(weights, "utf8").replace(/200/g, "300"));
            fs.writeFileSync(books, zlib.zstdCompressSync(Buffer.from(zlib.zstdDecompressSync(fs.readFileSync(books)).toString("utf8").replace(/200/g, "300"))));
        }
        if (change === "index") {
            const file = path.join(source, "index.json");
            fs.writeFileSync(file, JSON.stringify(JSON.parse(fs.readFileSync(file, "utf8"))));
        }
        if (change === "provenance") {
            const file = path.join(source, domain === "native" ? "optimization-input-pokie-manifest.json" : "pokie-manifest.json");
            const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
            manifest.generatedAt = "2026-10-18T00:00:00.000Z";
            fs.writeFileSync(file, JSON.stringify(manifest));
        }
        if (domain === "native") writeNativeStakeTuningManifest(source);
        const changed = inventory(source);
        await expect(registry.executePlan(plan, project, output)).rejects.toThrow(/changed|stale/);
        expect(await studio.executeStakeProjection(operation)).toMatchObject({status: "error", message: expect.stringMatching(/changed|stale/)});
        expect(fs.existsSync(output)).toBe(false);
        expect(fs.existsSync(operation.destinationPath)).toBe(false);
        const fresh = (await resolver.resolve(source))!;
        await registry.build("stakeAdapter", fresh, output);
        expect(fs.readFileSync(path.join(output, "lookup_base.csv"))).toEqual(fs.readFileSync(path.join(source, "lookup_base.csv")));
        const next = (await studio.prepareStakeProjection(source, operation.destinationPath))!;
        expect(await studio.executeStakeProjection(next)).toMatchObject({status: "ok"});
        expect(inventory(source)).toEqual(changed);
        // The same previously used owners remain usable after executed rejection.
        await registry.build("stakeAdapter", fresh, path.join(directory, "subsequent"));
    });

    it.each((["numeric", "wide", "native"] as const).flatMap(domain => [false, true].flatMap(replace => [false, true].map(cancel => ({domain, replace, cancel})))))("guards $domain ownership at Studio rollback (replacement $replace, cancellation $cancel)", async ({domain, replace, cancel}) => {
        const source = await stakeFixture();
        if (domain === "numeric") fs.writeFileSync(path.join(source, "lookup_base.csv"), "0,1,0\n1,1,200\n");
        if (domain === "native") {
            fs.renameSync(path.join(source, "pokie-manifest.json"), path.join(source, "optimization-input-pokie-manifest.json"));
            writeNativeStakeTuningManifest(source);
        }
        const before = inventory(source);
        const output = path.join(directory, "published");
        fs.mkdirSync(output);
        const controller = new AbortController();
        const registry = new api.ArtifactBuilderRegistry("1");
        const execute = registry.executePlan.bind(registry);
        jest.spyOn(registry, "executePlan").mockImplementation(async (...args) => {
            const result = await execute(...args);
            expect(result.publishedStakeDirectoryOwnership?.outDir).toBe(output);
            // Exercise Studio's outer registration boundary using a real publication.
            return {...result, managedProjectRoots: [output]};
        });
        const studio = new StudioArtifactBuildService("1", registry, undefined, () => {
            if (replace) {
                fs.renameSync(output, `${output}.displaced`);
                fs.mkdirSync(output);
                fs.writeFileSync(path.join(output, "foreign.txt"), "independent publication");
            }
            if (!cancel) throw new Error("registration failed");
            controller.abort();
            return Promise.resolve();
        });
        expect(await studio.build(source, "stakeAdapter", output, {signal: controller.signal})).toMatchObject({status: cancel ? "cancelled" : "error"});
        if (replace) expect(fs.readFileSync(path.join(output, "foreign.txt"), "utf8")).toBe("independent publication");
        else expect(fs.readdirSync(output)).toEqual([]);
        expect(inventory(source)).toEqual(before);
        const retry = path.join(directory, "retry");
        expect(await new StudioArtifactBuildService("1").build(source, "stakeAdapter", retry)).toMatchObject({status: "ok"});
    });
});
