import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import ExcelJS from "exceljs";
import * as api from "@fromstan/pokie";

export function existingMechanicsBlueprint(row: typeof api.AUTHORED_MECHANIC_CATALOG[number]): api.GameBlueprint {
    const blueprint: api.GameBlueprint = {
        manifest: {id: row.id, name: row.id, version: "1.0.0"}, reels: 3, rows: 1,
        symbols: ["A", "C", "M", "J", "S"], scatters: ["S"], paytable: {A: {3: 0}},
        availableBets: [0.05, 7.5, 1e-7], reelStrips: [["C", "A", "S", "J", "M"], ["A", "S", "J", "C", "M"], ["A", "S", "J", "C", "M"]], mechanics: {},
    };
    if (row.progression === "freeGames") blueprint.mechanics!.freeGames = {scatterSymbol: "S", awardsByCount: {2: 0, 3: 2}, retriggerPolicy: "additive"};
    if (row.progression === "holdAndWin") blueprint.mechanics!.holdAndWin = {minimumCount: 1, initialRespins: 2, retriggerPolicy: "reset-on-new-lock", symbolEffects: {C: {kind: "value", amount: 2}, M: {kind: "multiplier", factor: 3}}, payout: {type: "sum-with-multiplier", amountsAreBetMultiples: "values" in row && row.values === "bet"}};
    if (row.jackpot) blueprint.mechanics!.jackpot = {pool: row.jackpot === "fixed" ? {id: "mini", type: "fixed", amount: 10} : {id: "mini", type: "accumulating", seedValue: 10}, contribution: {type: "percentage", percentage: 0.1}, trigger: {type: "symbol-count", symbolId: "J", minimumCount: 1}, award: "single-tier"};
    if (row.modes) blueprint.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "ante", runtimeType: "ante", costMultiplier: 1.5}, ...(row.progression === "freeGames" ? [{id: "buy", runtimeType: "buyFeature" as const, costMultiplier: 10, forcedFreeGames: 2}, {id: "buy-more", runtimeType: "buyFeature" as const, costMultiplier: 25, forcedFreeGames: 4}] : [])];
    return blueprint;
}

/** Execute public generated runtime in memory; no private assembly or alternative math engine. */
export function generatedMechanicsGame(blueprint: api.GameBlueprint, typed = false): api.PokieGame {
    const source = typed ? ts.transpileModule(api.renderBuiltGameModuleSource(blueprint, "1.3.0"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}, reportDiagnostics: true}).outputText : api.renderBuiltGameModule(blueprint, "1.3.0");
    const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c12-module-"));
    const entry = path.join(directory, "index.cjs");
    fs.writeFileSync(entry, source);
    try {
        return require(entry) as api.PokieGame;
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
}

export function mechanicsSession(game: api.PokieGame, seed: string | number = 31) {
    const session = game.createSession({seed}) as api.VideoSlotSessionHandling & api.ConvertableToSessionState & api.BuildableFromSessionState & api.SessionStateRestoring & api.StakeAmountDetermining & Partial<api.BetModeSelecting> & {hasPendingLogicalRound(): boolean};
    session.setCreditsAmount(10000);
    session.setBet(0.05);
    return session;
}

/** Deterministic paid screens: features can enter only through an explicit purchase. */
export function replayModesBlueprint(weighted = false): api.GameBlueprint {
    const blueprint = existingMechanicsBlueprint(api.AUTHORED_MECHANIC_CATALOG.find(row => row.id === "modes")!);
    blueprint.reelStrips = [["A"], ["A"], ["A"]];
    if (weighted) {
        Reflect.deleteProperty(blueprint, "reelStrips");
        blueprint.reelSequences = Array.from({length: 3}, () => ({type: "weighted", variants: [
            {id: "first", symbols: ["A"], weight: 1}, {id: "second", symbols: ["C"], weight: 3},
        ]}));
    }
    return blueprint;
}

/** Negative counterparts to the existing per-variant public workflows. Each assertion uses
 * the boundary named in the support register; validation alone cannot stand in for PAR/replay. */
export async function assertWorkflowRejections(blueprint: api.GameBlueprint, directory: string): Promise<void> {
    const malformed = JSON.parse(JSON.stringify(blueprint)) as api.GameBlueprint;
    Reflect.set(malformed.mechanics!, "unknown", {});
    expect(new api.GameBlueprintValidator().validate(malformed).some(issue => issue.severity === "error")).toBe(true);
    expect(() => generatedMechanicsGame(malformed)).toThrow();
    const destination = path.join(directory, "rejected-package");
    expect(() => new api.GamePackageGenerator("1.3.0").generate(malformed, directory, destination)).toThrow();
    expect(fs.existsSync(destination)).toBe(false);
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, "keep"), "original");
    expect(() => new api.GamePackageGenerator("1.3.0").generate(blueprint, directory, destination)).toThrow();
    expect(fs.readFileSync(path.join(destination, "keep"), "utf8")).toBe("original");

    const game = generatedMechanicsGame(blueprint), 
        session = mechanicsSession(game);
    const before = session.toSessionState();
    const corrupt = JSON.parse(JSON.stringify(before)) as Record<string, unknown>;
    let leaf = corrupt;
    while (leaf.base) leaf = leaf.base as Record<string, unknown>;
    leaf.rngState = -1;
    expect(() => session.fromSessionState(corrupt)).toThrow();
    expect(session.toSessionState()).toEqual(before);
    session.setCreditsAmount(0);
    const statistics = new api.AggregateSimulationRunner(session, 3).run().getStatistics();
    expect(statistics).toMatchObject({rounds: 0, totalBet: 0, totalPayout: 0});
    const report = new api.SimulationReportBuilder().build({manifest: game.getManifest(), requestedRounds: 3, statistics, durationMs: 1});
    expect(report).toMatchObject({requestedRounds: 3, rounds: 0, totalBet: 0, totalWin: 0});
    expect(session.toSessionState()).toEqual(before);

    const descriptor = await game.getModelDescriptor!();
    descriptor.model.mechanics = malformed.mechanics;
    const create = jest.spyOn(game, "createSession");
    try {
        const extracted = await new api.PackageBlueprintExtraction().extract({...game, getModelDescriptor: () => descriptor});
        expect(extracted.status).not.toBe("complete");
        expect(extracted.blueprint).toBeUndefined();
        expect(extracted.diagnostics.length).toBeGreaterThan(0);
        expect(create).not.toHaveBeenCalled();
    } finally {
        create.mockRestore(); 
    }

    const filename = path.join(directory, "invalid-mechanic.xlsx");
    await new api.ParSheetExporter("1.3.0").exportToFile(blueprint, filename);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filename);
    const sheet = workbook.getWorksheet("Mechanics")!;
    sheet.addRow(["unknown", "{}"]);
    await workbook.xlsx.writeFile(filename);
    const imported = await new api.ParSheetImporter().importFromFile(filename);
    expect(imported.issues).toContainEqual(expect.objectContaining({code: "parsheet-mechanics-invalid", severity: "error"}));

    const recording = new api.ReplayRecorder().recordAudit(game, mechanicsSession(game), [{kind: "spin", roundId: "catalogue", delivery: "stepwise"}], {status: "calculated", sessionId: "s", durability: "detached"}, {seed: 31});
    const changed = JSON.parse(JSON.stringify(blueprint)) as api.GameBlueprint;
    changed.paytable.A = {3: 17};
    const incompatible = generatedMechanicsGame(changed);
    const replayCreate = jest.spyOn(incompatible, "createSession");
    try {
        expect(() => new api.AuditRoundReplay().replay(incompatible, recording.audit!)).toThrow();
        expect(replayCreate).not.toHaveBeenCalled();
    } finally {
        replayCreate.mockRestore(); 
    }
}
