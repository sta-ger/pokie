import {restoreWinEvaluation} from "../../../src/session/videoslot/winevaluation/WinEvaluationSnapshot.js";
import {serializeWinEvaluationResult} from "../../../src/net/videoslot/serializeWinEvaluationResult.js";
import type {RoundArtifactWin} from "../../../src/artifact/RoundArtifactWin.js";
import fs from "node:fs";
import {weightedBonusBlueprint} from "../../v2/fixtures/WeightedBonusGame.js";
import {AUTHORED_MECHANIC_CATALOG} from "../../../src/generated/AuthoredMechanicCatalog.js";
import {existingMechanicsBlueprint} from "../../v2/fixtures/ExistingMechanicsGame.js";
import type {GameBlueprint} from "../../../src/generated/GameBlueprint.js";

/** Exact reviewer reproducers plus sibling public projection/analytics fields. */
export const checkpointProjectionMutations: readonly (readonly [string, unknown?])[] = [
    ["acceptedBounded.payout", -123],
    ["acceptedBounded.omitted"],
    ["acceptedModifiers", {space: "evaluated", rules: [], sticky: []}],
    ["lastRound.network.totalWin", -123],
    ["lastRound.network.totalWin", "invalid"],
    ["lastRound.network.bet", 999],
    ["lastRound.network.credits", -123],
    ["lastRound.network.availableBets", [999]],
    ["lastRound.network.winEvaluationResult.totalWin", -123],
    ["lastRound.network.winEvaluationResult.winningPositions", [[-999, 999]]],
    ["lastRound.network.winningPositions", [[-999, 999]]],
    ["lastRound.network.boundedMechanics.weightedBonus.payout", -123],
    ["lastRound.network.boundedMechanics"],
    ["lastRound.network.winningLines", {"0": {definition: [-1], winAmount: -123}}],
    ["lastRound.network.winningScatters", {C: {symbolsPositions: [[-999, 999]], winAmount: -123}}],
    ["lastRound.network.winningClusters", {"0": {symbolsPositions: [[-999, 999]], winAmount: -123}}],
    ["lastRound.network.winningWays", {C: {symbolsPositions: [[-999, 999]], waysCount: -1, winAmount: -123}}],
    ["lastRound.network.winningValues", {C: {symbolsPositions: [[-999, 999]], winAmount: -123}}],
    ["lastRound.network.winEvaluationResult.metadata", {totalWin: -123}],
    ["lastRound.network.winEvaluationResult.valueWins", [{symbolId: "bonus", symbolsPositions: [], winAmount: -123}]],
    ["lastRound.network.betModeId", "foreign"],
    ["lastRound.network.chargedBetModeId", "foreign"],
    ["lastRound.network.freeGamesBank", -123],
    ["lastRound.network.modifiers", {rules: []}],
    ["lastRound.network.jackpot", {pools: []}],
    ["lastRound.network.holdAndWin", {locks: [[-999, 999]]}],
    ["lastRound.network.visibleRowCoverage", [-1]],
    ["lastRound.network.unexpected", {credits: -123}],
    ["analytics"],
    ["analytics.position", -1],
    ["analytics.source", "foreign"],
    ["analytics.active", {}],
    ["analytics.logicalKnown", false],
    ["analytics.active", {weightedBonus: {duration: 0, win: 0.25, known: true, entryPosition: 1, extra: []}}],
    ["analytics.active", {weightedBonus: {duration: 999, win: 0.25, known: true, entryPosition: 1}}],
    ["lastRound.analytics"],
    ["lastRound.analytics.position", -1],
    ["lastRound.analytics.source", "foreign"],
    ["lastRound.analytics.logicalCompletion", true],
    ["lastRound.analytics.components", []],
    ["lastRound.analytics.features", []],
    ["lastRound.analytics.envelope.modelId", "foreign"],
    ["analyticsCheckpoint"],
    ["analyticsTransition.carriedPaidEntry"],
    ["analyticsTransition.foreignPriorEntry"],

];

export function mutateCheckpointProjection<T>(saved: T, [path, value]: readonly [string, unknown?]): T {
    const corrupt = JSON.parse(JSON.stringify(saved));
    if (path.startsWith("acceptedAward.")) {
        const feature = corrupt.feature;
        const artifact = feature.plainMath?.artifact;
        const steps = feature.logicalRound?.subrounds[0].artifacts ?? artifact.steps;
        const original: RoundArtifactWin[] = steps.flatMap((step: {wins: RoundArtifactWin[]}) => step.wins);
        if (path === "acceptedAward.respinGrant") {
            for (const events of [steps[steps.length - 1].featureEvents, artifact?.featureEvents]) {
                if (events) events.find((event: {type: string}) => event.type === "boundedMechanics").data.respins.granted = 1;
            }
            feature.lastRound.network.boundedMechanics.respins.granted = 1;
            feature.lastRound.analytics.features.find((event: {feature: string}) => event.feature === "respins").granted = 1;
        } else {
            if (original.length !== 2 || original[0].winAmount !== 0.1 ||
                original[1].winAmount !== (path === "acceptedAward.bonus" ? 0.25 : 0.1)) throw new Error("Expected exact reviewer component awards");
            const omit = path === "acceptedAward.omit";
            const bonus = path === "acceptedAward.bonus";
            const amounts = omit ? [0.2] : [0.05, 0.15];
            if (bonus) amounts.splice(0, 2, 0.35 - 0.2, 0.2);
            const alter = (wins: RoundArtifactWin[]) => wins.filter((_win, index) => !omit || index === 0).map((win, index) => ({...win, winAmount: amounts[index]}));
            for (const step of steps) step.wins = alter(step.wins);
            if (artifact) artifact.wins = steps.flatMap((step: {wins: RoundArtifactWin[]}) => step.wins);
            const wins: RoundArtifactWin[] = steps.flatMap((step: {wins: RoundArtifactWin[]}) => step.wins);
            const network = feature.lastRound.network;
            const result = restoreWinEvaluation({components: wins.map(win => ({type: win.type, id: win.id, symbolId: win.symbolId!, amount: win.winAmount,
                positions: win.winningPositions as number[][], multipliers: [], metadata: win.metadata})), metadata: network.winEvaluationResult.metadata});
            const projected = serializeWinEvaluationResult(result);
            // Bounded awards expose component-only evaluations. Preserve their empty
            // legacy category arrays so a projection-shape error cannot reject the probe.
            for (const [key, value] of Object.entries(network.winEvaluationResult)) {
                if (key.endsWith("Wins") && Array.isArray(value) && value.length === 0) Reflect.set(projected, key, []);
            }
            network.winEvaluationResult = projected;
            network.winningPositions = result.getWinningPositions();
            for (const [kind, field, group] of [["line", "winningLines", "lineWins"], ["scatter", "winningScatters", "scatterWins"],
                ["ways", "winningWays", "waysWins"], ["cluster", "winningClusters", "clusterWins"], ["value", "winningValues", "valueWins"]]) {
                if (network[field]) network[field] = Object.fromEntries(wins.filter(win => win.type === kind).map((win, index) => [kind === "line" || kind === "cluster" ? win.id : win.symbolId, network.winEvaluationResult[group][index]]));
            }
            const components = feature.lastRound.analytics.components;
            feature.lastRound.analytics.components = wins.map(win => ({...components.find((item: {type: string; id: string}) => item.type === win.type && item.id === win.id), amount: win.winAmount}));
            if (bonus) {
                for (const events of [steps[steps.length - 1].featureEvents, artifact?.featureEvents]) {
                    if (events) events.find((event: {type: string}) => event.type === "boundedMechanics").data.weightedBonus.payout = 0.2;
                }
                network.boundedMechanics.weightedBonus.payout = 0.2;
                feature.accounting.baseWin = 0.35 - 0.2;
                feature.analytics.active.weightedBonus.win = 0.2;
            }
        }
        if (feature.logicalRound) feature.lastRound.logicalRound = feature.logicalRound;
        return corrupt as T;
    }
    if (path.startsWith("acceptedEvents.")) {
        const feature = corrupt.feature;
        const artifact = feature.plainMath?.artifact;
        const steps = feature.logicalRound?.subrounds[0].artifacts ?? artifact.steps;
        const event = path === "acceptedEvents.foreign" ? {type: "foreignFeature", data: {count: 2}} : {type: "freeGamesTriggered", data: {count: 2}};
        // Keep all mutable receipt copies aligned, including the plain aggregate.
        for (const owner of [steps[0], artifact].filter(Boolean)) {
            owner.featureEvents = [...(owner.featureEvents ?? []), event];
        }
        if (feature.logicalRound) feature.lastRound.logicalRound = feature.logicalRound;
        return corrupt as T;
    }
    if (path.startsWith("acceptedWin.")) {
        const kind = path.slice("acceptedWin.".length);
        const visit = (item: unknown): void => {
            if (!item || typeof item !== "object") return;
            const record = item as Record<string, unknown>;
            for (const [key, child] of Object.entries(record)) {
                if (kind === "symbol" && (key === "symbolId" || key === "symbol")) record[key] = value;
                else if (kind === "positions" && key === "winningPositions") record[key] = value;
                else if (kind === "id" && (key === "id" || key === "lineId") && child === "0") record[key] = value;
                else if (kind === "multiplier" && key === "multiplierBreakdown") record[key] = value;
                else visit(child);
            }
        };
        visit(corrupt.feature.plainMath?.artifact);
        visit(corrupt.feature.logicalRound);
        visit(corrupt.feature.lastRound);
        const network = corrupt.feature.lastRound.network;
        if (kind === "id") {
            network.winningLines.foreign = network.winningLines["0"];
            Reflect.deleteProperty(network.winningLines, "0");
        }
        return corrupt as T;
    }
    if (path === "analyticsAccounting.inflated") {
        for (const state of [corrupt.feature.analyticsCheckpoint.state, corrupt.feature.analytics]) {
            for (const active of Object.values(state.active) as {win: number}[]) active.win += 999;
        }
        return corrupt as T;
    }
    if (path.startsWith("analyticsTransition.")) {
        const feature = corrupt.feature;
        if (path === "analyticsTransition.carriedPaidEntry") {
            feature.analyticsCheckpoint.before.pending = true;
            feature.analyticsCheckpoint.state.logicalKnown = false;
            feature.analytics.logicalKnown = false;
            if (feature.lastRound.analytics) {
                feature.lastRound.analytics.logicalEntry = false;
                feature.lastRound.analytics.carriedSubround = true;
                feature.lastRound.analytics.components.forEach((component: {partition: string}) => component.partition = "feature");
            }
        } else {
            for (const state of [feature.analyticsCheckpoint.state, feature.analytics]) {
                if (path === "analyticsTransition.plainCarried") state.logicalKnown = false;
                for (const active of Object.values(state.active) as {known: boolean; entryPosition: number}[]) {
                    active.known = false;
                    active.entryPosition = 0;
                }
            }
            if (feature.lastRound.analytics) {
                if (path === "analyticsTransition.plainCarried") feature.lastRound.analytics.carriedSubround = true;
                feature.lastRound.analytics.activeKnownFeatures = [];
                feature.lastRound.analytics.activeCarriedFeatures = ["weightedBonus"];
                feature.lastRound.analytics.activeEntryPositions = {};
            }
        }
        return corrupt as T;
    }
    if (path.startsWith("acceptedFeature.")) {
        const feature = corrupt.feature;
        const artifact = feature.plainMath?.artifact;
        const steps = feature.logicalRound?.subrounds[0].artifacts ?? artifact.steps;
        const [type, ...parts] = path.slice("acceptedFeature.".length).split(".");
        for (const events of [steps[steps.length - 1].featureEvents, artifact?.featureEvents]) {
            if (!events) continue;
            const event = events.find((event: {type: string}) => event.type === type);
            if (!event) throw new Error(`Fixture requires ${type}`);
            if (!parts.length) events.splice(events.indexOf(event), 1);
            else if (parts[0] === "duplicate") events.push(JSON.parse(JSON.stringify(event)));
            else setPath(event.data, parts, value);
        }
        if (type === "screenModifiers") {
            if (!parts.length) Reflect.deleteProperty(feature.lastRound.network, "modifiers");
            else if (parts[0] !== "duplicate") setPath(feature.lastRound.network.modifiers, parts, value);
        }
        if (feature.logicalRound) feature.lastRound.logicalRound = feature.logicalRound;
        return corrupt as T;
    }
    if (["acceptedBounded.payout", "acceptedBounded.omitted", "acceptedModifiers"].includes(path)) {
        const feature = corrupt.feature;
        if (path === "acceptedBounded.payout") feature.lastRound.network.boundedMechanics.weightedBonus.payout = value;
        else if (path === "acceptedBounded.omitted") Reflect.deleteProperty(feature.lastRound.network, "boundedMechanics");
        else feature.lastRound.network.modifiers = value;
        const artifact = feature.plainMath?.artifact;
        const steps = feature.logicalRound?.subrounds[0].artifacts ?? artifact.steps;
        for (const events of [steps[steps.length - 1].featureEvents, artifact?.featureEvents]) {
            const event = events?.find((event: {type: string}) => event.type === "boundedMechanics");
            if (path === "acceptedModifiers") events?.push({type: "screenModifiers", data: value});
            else if (path === "acceptedBounded.omitted" && event) events.splice(events.indexOf(event), 1);
            else if (event) event.data.weightedBonus.payout = value;
        }
        if (feature.logicalRound) feature.lastRound.logicalRound = feature.logicalRound;
        return corrupt as T;
    }
    const parts = ["feature", ...path.split(".")];
    const key = parts.pop()!;
    let parent = corrupt;
    for (const part of parts) parent = parent[part];
    if (value === undefined) Reflect.deleteProperty(parent, key);
    else parent[key] = value;
    return corrupt as T;
}

function setPath(parent: Record<string, unknown>, parts: string[], value: unknown): void {
    for (const key of parts.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
    if (value === undefined) Reflect.deleteProperty(parent, parts[parts.length - 1]);
    else parent[parts[parts.length - 1]] = value;
}

/** Actual model fixtures used by the reviewer; mutations preserve the receipt's other copies. */
export function checkpointFeatureObservationFixtures(): {id: string; blueprint: GameBlueprint; seed?: string; maxSubrounds?: number; mutations: readonly (readonly [string, unknown?])[]}[] {
    const model = (id: string) => existingMechanicsBlueprint(AUTHORED_MECHANIC_CATALOG.find(row => row.id === id)!);
    const wins: GameBlueprint = {manifest: {id: "retained-wins", name: "Wins", version: "1.0.0"}, reels: 3, rows: 1,
        symbols: ["A", "B"], reelStrips: [["A"], ["A"], ["A"]], paytable: {A: {3: 2}}, availableBets: [0.05],
        betModes: [{id: "base", runtimeType: "base", isDefault: true}]};
    const cascade: GameBlueprint = {...wins, reelStrips: [["A", "B"], ["A", "B"], ["A", "B"]], mechanics: {cascade: {maxCascades: 10}}};
    Reflect.deleteProperty(cascade, "betModes");
    return [
        {id: "freeGames", blueprint: {...model("free-games"), reelStrips: [["S"], ["S"], ["S"]]}, maxSubrounds: 2, mutations: [
            ["acceptedFeature.freeGamesTriggered.count", 999], ["acceptedFeature.freeGamesTriggered"],
            ["acceptedFeature.freeGamesTriggered.duplicate"], ["acceptedFeature.freeGamesTriggered.count", "2"],
            ["acceptedFeature.freeGamesTriggered.extra", true], ["acceptedEvents.foreign"],
        ]},
        {id: "cascade", blueprint: cascade, seed: "7", mutations: [
            ["acceptedEvents.freeGamesTriggered"], ["acceptedEvents.foreign"],
        ]},
        ...checkpointAwardFixtures(wins),
        {id: "wins", blueprint: wins, mutations: [
            ["acceptedEvents.freeGamesTriggered"], ["acceptedEvents.foreign"],
            ["acceptedWin.symbol", "INVALID"], ["acceptedWin.symbol", "B"], ["acceptedWin.positions", [[999, 999]]],
            ["acceptedWin.id", "foreign"], ["acceptedWin.multiplier", [{source: "foreign", positions: [[999, 999]], values: [999], combinedMultiplier: 999}]],
            ["acceptedWin.multiplier", [{source: "foreign", positions: [[0, 0]], values: [999], combinedMultiplier: 999}]],
            ["acceptedWin.multiplier", [{source: "authored-wild-product", positions: [[0, 0]], values: [2], combinedMultiplier: 2}]],
        ]},
        {id: "generation", blueprint: {...wins, reelStrips: [["A", "B"], ["A", "B"], ["A", "B"]]}, mutations: [
            ["lastRound.stops.0", 0], ["lastRound.draw", 0],
        ]},
        {id: "sticky", blueprint: JSON.parse(fs.readFileSync("examples/blueprints/wild-sticky.blueprint.json", "utf8")), mutations: [
            ["acceptedFeature.screenModifiers.sticky.0.remaining", 999],
            ["acceptedFeature.screenModifiers.sticky.0.remaining", 0],
            ["acceptedFeature.screenModifiers.sticky.0.symbol", "INVALID"],
            ["acceptedFeature.screenModifiers.sticky.0.position", [999, 999]],
            ["acceptedFeature.screenModifiers.sticky.0.factor", 999],
            ["acceptedFeature.screenModifiers.sticky.0.ruleId", "foreign"],
            ["acceptedFeature.screenModifiers.rules.0.id", "foreign"],
            ["acceptedFeature.screenModifiers.rules.0.positions", [[999, 999]]],
            ["acceptedFeature.screenModifiers.rules.0.positions", []],
            ["acceptedFeature.screenModifiers.sticky", [{ruleId: "sticky", position: [999, 999], symbol: "W2", factor: 2, remaining: 999}]],
            ["acceptedFeature.screenModifiers.duplicate"],
            ["acceptedFeature.screenModifiers"],
        ]},
        {id: "hold", blueprint: model("hold-flat"), mutations: [
            ["acceptedFeature.holdAndWin.payout", 999], ["acceptedFeature.holdAndWin.locks.0.position", [999, 999]],
            ["acceptedFeature.holdAndWin.duplicate"], ["acceptedFeature.holdAndWin"],
        ]},
        {id: "jackpot", blueprint: model("fixed-base"), mutations: [
            ["acceptedFeature.jackpot.pools.0.value", 999], ["acceptedFeature.jackpot.duplicate"], ["acceptedFeature.jackpot"],
        ]},
        {id: "mode", blueprint: model("modes"), mutations: [
            ["acceptedFeature.chargedBetMode.id", "foreign"], ["acceptedFeature.chargedBetMode.duplicate"], ["acceptedFeature.chargedBetMode"],
        ]},
    ];
}

/** Two accepted mathematical plays leave a live known entry in each progression owner. */
export function checkpointAccountingFixtures(): {id: string; blueprint: GameBlueprint; mode?: string; completion: number}[] {
    const model = (id: string) => existingMechanicsBlueprint(AUTHORED_MECHANIC_CATALOG.find(row => row.id === id)!);
    const bonus = model("free-games");
    const weighted = weightedBonusBlueprint();
    weighted.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const free = model("modes");
    free.betModes!.find(mode => mode.id === "buy")!.forcedFreeGames = 3;
    free.reelStrips = [["A"], ["A"], ["A"]];
    free.paytable = {A: {3: 2}};
    const hold = model("hold-flat");
    hold.reelStrips = [["C"], ["A"], ["A"]];
    const respins = {...bonus, mechanics: {respins: {trigger: {symbolId: "C", minimumCount: 1}, grant: 2, retrigger: "none" as const, maxRespins: 2}},
        reelStrips: [["C"], ["C"], ["C"]], paytable: {C: {3: 2}}};
    return [{id: "weightedBonus", blueprint: weighted, completion: 0.44999999999999996}, {id: "freeGames", blueprint: free, mode: "buy", completion: 0.30000000000000004}, {id: "holdAndWin", blueprint: hold, completion: 2},
        {id: "respins", blueprint: respins, completion: 0.2}];
}

/** Coordinated money/grant changes preserve aggregate money and every returned copy. */
function checkpointAwardFixtures(base: GameBlueprint): ReturnType<typeof checkpointFeatureObservationFixtures> {
    const respinBase = {...base};
    Reflect.deleteProperty(respinBase, "betModes");
    const twoRows = {...base, rows: 2, paylines: [[0, 0, 0], [1, 1, 1]]};
    const weighted = weightedBonusBlueprint();
    weighted.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    return [
        {id: "award-lines", blueprint: twoRows, mutations: [["acceptedAward.redistribute"], ["acceptedAward.omit"]]},
        {id: "award-ways", blueprint: {...twoRows, reelStrips: [["A", "B"], ["A", "B"], ["A", "B"]], paytable: {A: {3: 2}, B: {3: 2}},
            winModel: {type: "ways"}}, mutations: [["acceptedAward.redistribute"]]},
        {id: "award-scatters", blueprint: {...twoRows, reelStrips: [["A", "B"], ["A", "B"], ["A", "B"]], scatters: ["A", "B"],
            paytable: {A: {3: 2}, B: {3: 2}}}, mutations: [["acceptedAward.redistribute"]]},
        {id: "award-clusters", blueprint: {...base, rows: 3, reelStrips: [["A"], ["B"], ["A"]],
            winModel: {type: "clusters", minimumClusterSize: 3}}, mutations: [["acceptedAward.redistribute"]]},
        {id: "award-bonus", blueprint: weighted, maxSubrounds: 1, mutations: [["acceptedAward.bonus"]]},
        {id: "award-respins", blueprint: {...respinBase, mechanics: {respins: {trigger: {symbolId: "A", minimumCount: 1}, grant: 2, retrigger: "none", maxRespins: 2}}},
            maxSubrounds: 1, mutations: [["acceptedAward.respinGrant"], ["analyticsCheckpoint.before.respinsRemaining", -1],
                ["analyticsCheckpoint.before.respinsRemaining", 999], ["analyticsCheckpoint.before.respinsRemaining", "2"], ["analyticsCheckpoint.before.respinsRemaining"]]},
    ];
}
