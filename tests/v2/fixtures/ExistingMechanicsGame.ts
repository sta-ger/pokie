import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
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
