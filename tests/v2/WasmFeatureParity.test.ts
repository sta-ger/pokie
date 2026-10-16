import {spawnSync} from "node:child_process";
import {emitPublicRuntime} from "./helpers/publicRuntime.js";
import {AUTHORED_MECHANIC_CATALOG, AUTHORED_MODIFIER_CATALOG, AUTHORED_BOUNDED_MECHANIC_CATALOG} from "../../src/generated/AuthoredMechanicCatalog.js";
import {AUTHORED_WORKFLOW_SUPPORT_CATALOG} from "../../src/generated/AuthoredWorkflowSupportCatalog.js";
import {existingMechanicsBlueprint} from "./fixtures/ExistingMechanicsGame.js";
import {boundedBlueprint} from "./fixtures/BoundedMechanicsGame.js";
import fs from "node:fs";
import path from "node:path";
import {WasmArtifactBuilder} from "../../src/project/WasmArtifactBuilder.js";
import {instantiatePokieWasm, SeededPokieWasmHost} from "../../src/wasm/PokieWasmRuntime.js";
import type {PokieWasmComponentManifest} from "../../src/project/wasm/PokieWasmComponentManifest.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import {weightedBonusBlueprint} from "./fixtures/WeightedBonusGame.js";

it("checkpoints weighted bonus through fresh JSON hosts without reselecting or charging", async () => {
    const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c21-"));
    try {
        const source = path.join(directory, "game.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(weightedBonusBlueprint()));
        const artifact = path.join(directory, "game.wasm");
        await new WasmArtifactBuilder("1.3.0").build({type: "blueprint", rootPath: source, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "feature parity"}, artifact);
        const bytes = fs.readFileSync(artifact);
        const manifest = JSON.parse(fs.readFileSync(`${artifact}.pokie-wasm.json`, "utf8")) as PokieWasmComponentManifest;
        const runtime = await instantiatePokieWasm(bytes, manifest, new SeededPokieWasmHost("0"));
        const session = runtime.createSession("0");
        const initialized = session.serialize();
        await expect(session.play({mode: () => "buy"})).rejects.toThrow(/Mode must be/);
        expect(session.serialize()).toEqual(initialized);
        const entry = await session.play({bet: 0.05, roundId: "bonus", delivery: "stepwise"});
        expect(entry.stake).toBe(0.05);
        expect(entry.network?.boundedMechanics?.weightedBonus?.selectedNow).toBe(true);
        const state = JSON.parse(JSON.stringify(session.serialize()));
        const fresh = await instantiatePokieWasm(bytes, manifest, new SeededPokieWasmHost("fresh"));
        const restored = fresh.restoreSession(state);
        if (entry.logicalRound?.status === "pending") {
            const command = {delivery: "stepwise", continuation: {roundId: "bonus", cursor: entry.logicalRound.deliveryCursor}};
            const next = await session.play(command);
            expect(await restored.play(command)).toEqual(next);
            expect(next.stake).toBe(0);
            expect(next.network?.boundedMechanics?.weightedBonus?.selectedNow).toBe(false);
        }
        expect(restored.serialize()).toEqual(session.serialize());
        fresh.dispose();
        runtime.dispose();
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

// The outer test supplies the existing catalogue fixtures; native execution uses only
// newly emitted package exports and generated delivery files, outside Jest aliases.
it("covers the frozen 36 launch rows through fresh public CJS/TypeScript/browser/WASM delivery", () => {
    const candidate = emitPublicRuntime();
    try {
        const fixtures = [
            ...AUTHORED_MECHANIC_CATALOG.map(row => ({id: row.id, kind: "existing", row, blueprint: existingMechanicsBlueprint(row)})),
            ...AUTHORED_MODIFIER_CATALOG.map(id => ({id: `modifier-${id}`, kind: "modifier", blueprint: JSON.parse(fs.readFileSync(path.resolve(`examples/blueprints/wild-${id}.blueprint.json`), "utf8"))})),
            ...AUTHORED_BOUNDED_MECHANIC_CATALOG.map(id => ({id: `bounded-${id}`, kind: "bounded", blueprint: boundedBlueprint(id)})),
            {id: "weighted-bonus", kind: "bonus", blueprint: weightedBonusBlueprint()},
        ];
        fs.writeFileSync(path.join(candidate.directory, "feature-fixtures.json"), JSON.stringify(fixtures));
        const result = spawnSync(process.execPath, [path.resolve("tests/fixtures/wasm/verifyDeliveredFeatures.cjs"), candidate.directory], {encoding: "utf8", timeout: 180000, maxBuffer: 4 * 1024 * 1024});
        if (result.stdout) console.log(result.stdout.trim());
        expect({status: result.status, error: result.error?.message, stderr: result.stderr}).toEqual({status: 0, error: undefined, stderr: ""});
        const report = JSON.parse(result.stdout.trim());
        expect(report.catalogueIds).toHaveLength(36);
        expect(report.catalogueIds.join(",")).toBe("free-games,modes,hold-flat,hold-flat-modes,hold-bet,hold-bet-modes,fixed-base,fixed-base-modes,fixed-freeGames,fixed-freeGames-modes,fixed-holdAndWin,fixed-holdAndWin-modes,fixed-holdAndWin-bet,fixed-holdAndWin-bet-modes,accumulating-base,accumulating-base-modes,accumulating-freeGames,accumulating-freeGames-modes,accumulating-holdAndWin,accumulating-holdAndWin-modes,accumulating-holdAndWin-bet,accumulating-holdAndWin-bet-modes,modifier-expanding,modifier-sticky,modifier-restricted,modifier-multiplier,modifier-transform,modifier-reel,bounded-cascade,bounded-respins,bounded-collection,bounded-cascade-collection,bounded-respins-collection,bounded-cascade-respins,bounded-cascade-respins-collection,weighted-bonus");
        expect(report.catalogueIds).toEqual(AUTHORED_WORKFLOW_SUPPORT_CATALOG.map(row => row.id));
        const crossProducts = [
            ...AUTHORED_MODIFIER_CATALOG.flatMap(variant => ["lines", "ways", "clusters"].flatMap(type => [0.05, 7.5, 1e-7].map(bet => `modifier-${variant}-${type}-${bet}`))),
            ...AUTHORED_MODIFIER_CATALOG.map(variant => `composition-${variant}`),
            "hold-full-flat", "hold-full-bet", "bonus-small", "bonus-large", "bonus-zero-effect", "cascade-terminal-bound", "weighted-dyadic", "weighted-binary64-extreme",
            ...["lines", "ways", "clusters"].flatMap(type => [false, true].map(weighted => `projection-${type}-${weighted}`)),
            "weighted-hold-flat", "weighted-hold-bet",
            ...AUTHORED_BOUNDED_MECHANIC_CATALOG.flatMap(id => ["lines", "ways", "clusters"].map(type => `weighted-bounded-${id}-${type}`)),
            ...["lines", "ways", "clusters"].map(type => `weighted-bonus-${type}`), "weighted-cascade-refill",
        ];
        expect(report.routes).toEqual(["modes:package", "modes:PAR", "weighted-dyadic:package", "weighted-dyadic:PAR"]);
        expect(report.crossProducts).toEqual(crossProducts);
        expect(report.rejectionIds).toEqual(["bonus-counts", "collection", "free-bank", "free-counters", "hold-lock", "jackpot-pool", "jackpot-stats", "modifier-model", "respins", "weighted-counts"]);
        expect(report.compact.map((row: {id: string; iterations: number}) => [row.id, row.iterations])).toEqual([...AUTHORED_WORKFLOW_SUPPORT_CATALOG.map(row => row.id), "weighted-hold-flat", "weighted-bounded-cascade-respins-collection-lines", "weighted-bonus-lines", "weighted-cascade-refill"].map(id => [id, 128]));
        expect(report.publicExports).toEqual(["cjs", "esm", "browser", "wasm"]);
    } finally {
        candidate.dispose();
    }
}, 240000);

it("preserves a committed composite prefix through a failing successor, JSON restore and original-request retry", async () => {
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    const blueprint = weightedBonusBlueprint();
    blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    const fixture = createCanonicalWasmFixture({blueprint});
    let cursor = 0;
    let failAt = 7; // 3 unpaid initialization draws, 3 entry stops, 1 bonus selection.
    const host = {
        nextRandom: () => {
            if (cursor === failAt) throw new Error("tape exhausted");
            cursor++;
            return 0;
        },
        serializeState: () => cursor,
        restoreState: (value: unknown) => {
            if (typeof value !== "number") throw new Error("cursor");
            cursor = value;
        },
    };
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
    try {
        const session = runtime.createSession("prefix");
        const command = {bet: 0.05, roundId: "bonus", delivery: "composite"};
        await expect(session.play(command)).rejects.toThrow("tape exhausted");
        const prefix = JSON.parse(JSON.stringify(session.serialize()));
        expect(prefix).toMatchObject({sequence: 1, drawCount: 7, feature: {pendingCommand: {advanced: 1}, logicalRound: {cursor: 1, status: "pending", totalStake: 0.05}}});
        failAt = -1;
        const restored = runtime.restoreSession(prefix);
        const retried = await restored.play(command);
        expect(retried.stake).toBe(0.05);
        expect(retried.win).toBeCloseTo(0.55);
        expect(retried.logicalRound).toMatchObject({status: "completed", cursor: 3, totalStake: 0.05});
        expect(restored.serialize()).toMatchObject({sequence: 3, drawCount: 13});
        expect(await session.play(command)).toEqual(retried);
    } finally {
        runtime.dispose();
    }
});

it("fails consistent feature preflight before publication and retains unsupported source bytes", async () => {
    const {resolveCanonicalWasmGameModel} = await import("../../src/project/WasmArtifactBuilder.js");
    const {ArtifactConversionPlanner} = await import("../../src/project/ArtifactConversionPlanner.js");
    const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c21-preflight-"));
    try {
        for (const field of ["mechanic-callback", "external-wallet", "custom-evaluator"]) {
            const blueprint = weightedBonusBlueprint();
            if (field === "mechanic-callback") Reflect.set(blueprint.mechanics!.weightedBonus!, "callback", "custom");
            if (field === "external-wallet") Reflect.set(blueprint, "services", ["external-wallet"]);
            if (field === "custom-evaluator") Reflect.set(blueprint, "evaluator", {module: "custom"});
            const source = path.join(directory, `${field}.blueprint.json`),
                destination = path.join(directory, `${field}.wasm`);
            fs.writeFileSync(source, JSON.stringify(blueprint));
            const original = fs.readFileSync(source);
            const project = {type: "blueprint" as const, rootPath: source, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "V2C-21"};
            expect(() => resolveCanonicalWasmGameModel(blueprint)).toThrow(/weightedBonus|services|evaluator/);
            expect(new ArtifactConversionPlanner().plan(project, "wasm").status).toBe("unavailable");
            await expect(new WasmArtifactBuilder("1.3.0").build(project, destination)).rejects.toThrow();
            expect(fs.readFileSync(source)).toEqual(original);
            expect(fs.existsSync(destination)).toBe(false);
            expect(fs.existsSync(`${destination}.pokie-wasm.json`)).toBe(false);
        }
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

it("rejects an overflowing selected denomination without losing the feature checkpoint or RNG", async () => {
    const {replayModesBlueprint} = await import("./fixtures/ExistingMechanicsGame.js");
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    const blueprint = replayModesBlueprint();
    blueprint.paytable.A = {3: Number.MAX_VALUE / 2};
    const fixture = createCanonicalWasmFixture({blueprint});
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("overflow"));
    try {
        const session = runtime.createSession("overflow");
        const initial = session.serialize();
        await expect(session.play({bet: 7.5, delivery: "stepwise", roundId: "bad"})).rejects.toThrow(/overflow/);
        expect(session.serialize()).toEqual(initial);
        const good = await session.play({bet: 1e-7, delivery: "stepwise", roundId: "good"});
        expect(good.win).toBe(Number.MAX_VALUE / 2 * 1e-7);
        const saved = JSON.parse(JSON.stringify(session.serialize()));
        const restored = runtime.restoreSession(saved);
        await expect(restored.play({bet: 7.5, delivery: "stepwise", roundId: "bad-next"})).rejects.toThrow(/overflow/);
        expect(restored.serialize()).toEqual(saved);
        const command = {bet: 1e-7, delivery: "stepwise", roundId: "next"};
        expect(await restored.play(command)).toEqual(await session.play(command));
    } finally {
        runtime.dispose();
    }
});

it("runs a public CLI composite purchase with reel-major JSON observations and a restorable checkpoint", async () => {
    const {RunWasmCommand} = await import("../../cli/commands/RunWasmCommand.js");
    const {replayModesBlueprint} = await import("./fixtures/ExistingMechanicsGame.js");
    const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c21-run-"));
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
        const blueprint = replayModesBlueprint();
        blueprint.paytable.A = {3: 2};
        const source = path.join(directory, "game.blueprint.json"),
            artifact = path.join(directory, "game.wasm");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        await new WasmArtifactBuilder("1.3.0").build({type: "blueprint", rootPath: source, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "V2C-21"}, artifact);
        expect(await new RunWasmCommand().run([artifact, "--seed", "purchase", "--bet", "0.05", "--mode", "buy", "--delivery", "composite", "--format", "json"])).toBe(0);
        const result = JSON.parse(log.mock.calls[log.mock.calls.length - 1][0] as string);
        expect(result).toMatchObject({round: {stake: 0.5, win: 0.2, screen: [["A"], ["A"], ["A"]], logicalRound: {status: "completed", totalStake: 0.5}}, state: {schemaVersion: "pokie.state.v4"}});
        expect(result.round.payout).toBeCloseTo(0.2);
    } finally {
        log.mockRestore();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});


it("V2C-21 classifies seed-7 cascades across stepwise, composite, resumed and replay boundaries", async () => {
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    const {advancePokieWasmReplay} = await import("../../src/wasm/PokieWasmCommands.js");
    const blueprint = boundedBlueprint("cascade");
    blueprint.reelStrips = [["A", "B"], ["A", "B"], ["A", "B"]];
    const fixture = createCanonicalWasmFixture({blueprint});
    const host = new SeededPokieWasmHost("7");
    const controller = new AbortController();
    let interrupt = false;
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {
        nextRandom: () => host.nextRandom(), resetSeed: seed => host.resetSeed(seed),
        restoreState: value => host.restoreState(value),
        serializeState: () => {
            if (interrupt) controller.abort();
            return host.serializeState();
        },
    });
    try {
        const command = {bet: 0.05, delivery: "composite", roundId: "cascade", maxSubrounds: 10000};
        const session = runtime.createSession("7");
        const initial = session.serialize();
        const composite = await session.play(command);
        expect(composite).toMatchObject({stake: 0.05, win: 0.2, logicalRound: {status: "completed", deliveryCursor: 3}});
        expect(composite.deliveryOnly).not.toBe(true);
        expect(composite.deliveries?.map(frame => !!frame.deliveryOnly)).toEqual([false, true, true]);
        const saved = session.serialize();
        const {deliveries: _deliveries, ...receipt} = composite;
        expect(await runtime.restoreSession(saved).play(command)).toEqual(receipt);
        const replay = await advancePokieWasmReplay(runtime, initial, {unit: "logical-round", entry: {kind: "spin", ...command, delivery: "composite"}, index: 0});
        expect(replay.rounds).toEqual([composite]);
        expect(replay.stateAfter).toEqual(saved);
        const stepwise = runtime.restoreSession(initial);
        let frame = await stepwise.play({...command, delivery: "stepwise"});
        expect(frame.deliveryOnly).not.toBe(true);
        while (frame.logicalRound?.status === "pending") {
            const next = {delivery: "stepwise", continuation: {roundId: "cascade", cursor: frame.logicalRound.deliveryCursor}};
            frame = await stepwise.play(next);
            expect(frame).toMatchObject({deliveryOnly: true, stake: 0, win: 0, payout: 0});
            const snapshot = stepwise.serialize();
            expect(await runtime.restoreSession(snapshot).play(next)).toEqual(frame);
            if (snapshot.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
            const corrupt = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
            Object.assign(corrupt.feature.lastRound!, {deliveryOnly: false});
            expect(() => runtime.restoreSession(corrupt)).toThrow(/logical delivery/);
        }
        expect(stepwise.serialize()).toMatchObject({rngState: saved.rngState, credits: composite.credits});
        const display = runtime.restoreSession(initial);
        await display.play({...command, delivery: "stepwise"});
        const drain = {delivery: "composite", continuation: {roundId: "cascade", cursor: 1}};
        const delivered = await display.play(drain);
        expect(delivered).toMatchObject({deliveryOnly: true, win: 0, stake: 0, payout: 0});
        const {deliveries: _displayFrames, ...displayReceipt} = delivered;
        expect(await runtime.restoreSession(display.serialize()).play(drain)).toEqual(displayReceipt);
        const interrupted = runtime.restoreSession(initial);
        interrupt = true;
        await interrupted.play(command, {signal: controller.signal});
        const prefix = interrupted.serialize();
        expect(prefix).toMatchObject({feature: {pendingCommand: {advanced: 1}, lastRound: {stake: 0.05, win: 0.2}}});
        interrupt = false;
        const resumed = runtime.restoreSession(prefix);
        const completed = await resumed.play(command);
        expect(completed.deliveryOnly).not.toBe(true);
        expect(completed).toMatchObject({stake: 0.05, win: 0.2, logicalRound: {status: "completed"}});
        expect(resumed.serialize()).toEqual(saved);
        expect(await resumed.play(command)).toEqual(receipt);
        // Omitted delivery still executes a whole mathematical cascade, including its
        // evaluated losing frame; its receipt remains restorable after presentation drains.
        const plain = runtime.restoreSession(initial);
        const plainResult = await plain.play({bet: 0.05});
        expect(plainResult).toMatchObject({stake: 0.05, win: 0.2});
        expect(plainResult.logicalRound).toBeUndefined();
        const plainState = plain.serialize();
        const plainRestored = runtime.restoreSession(JSON.parse(JSON.stringify(plainState)));
        const plainNext = await plainRestored.play({bet: 0.05});
        expect((await runtime.replay(plainState, [{bet: 0.05}])).rounds).toEqual([plainNext]);
        expect(await plain.play({bet: 0.05})).toEqual(plainNext);
    } finally {
        runtime.dispose();
    }
});

it.each(["bonus", "banked"] as const)("restores %s composite continuations and interrupted prefixes with separate win/payout accounting", async kind => {
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    const {replayModesBlueprint} = await import("./fixtures/ExistingMechanicsGame.js");
    const blueprint = kind === "bonus" ? weightedBonusBlueprint() : replayModesBlueprint();
    if (kind === "bonus") blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    else blueprint.paytable.A = {3: 2};
    const fixture = createCanonicalWasmFixture({blueprint});
    const host = new SeededPokieWasmHost("continuation");
    const controller = new AbortController();
    let interrupt = false;
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {
        nextRandom: () => host.nextRandom(), resetSeed: seed => host.resetSeed(seed), restoreState: value => host.restoreState(value),
        serializeState: () => {
            if (interrupt) controller.abort();
            return host.serializeState();
        },
    });
    try {
        const session = runtime.createSession("continuation");
        await session.play({bet: 0.05, delivery: "stepwise", roundId: "x", ...(kind === "banked" ? {mode: "buy-more"} : {})});
        const entry = session.serialize();
        const command = {delivery: "composite", continuation: {roundId: "x", cursor: 1}};
        const complete = await session.play(command);
        expect(complete.win).toBeCloseTo(kind === "bonus" ? 0.2 : 0.3);
        expect(complete.payout).toBeCloseTo(kind === "bonus" ? 0.2 : 0.4);
        expect(complete.stake).toBe(0);
        expect(complete.logicalRound?.status).toBe("completed");
        const saved = session.serialize();
        const {deliveries: _deliveries, ...receipt} = complete;
        expect(await runtime.restoreSession(saved).play(command)).toEqual(receipt);
        const interrupted = runtime.restoreSession(entry);
        interrupt = true;
        const prefix = await interrupted.play(command, {signal: controller.signal});
        expect(prefix.win).toBe(0.1);
        if (kind === "banked") expect(prefix.payout).toBe(0);
        const checkpoint = JSON.parse(JSON.stringify(interrupted.serialize()));
        expect(checkpoint.feature).toMatchObject({deliveryStart: {cursor: 1}, pendingCommand: {advanced: 1}});
        interrupt = false;
        for (const state of [checkpoint, saved]) {
            if (state.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
            const corrupt = JSON.parse(JSON.stringify(state));
            Object.assign(corrupt.feature.lastRound, {win: 0, winMultiplier: 0});
            corrupt.feature.deliveryStart.totalWin = corrupt.feature.logicalRound.totalWin;
            await expect(runtime.replay(corrupt, [command])).rejects.toThrow(/money.*logical delivery/);
            expect(() => runtime.restoreSession(corrupt)).toThrow(/money.*logical delivery/);
        }
        const resumed = runtime.restoreSession(checkpoint);
        expect(await resumed.play(command)).toMatchObject(receipt);
        expect(resumed.serialize()).toEqual(saved);
        expect(await resumed.play(command)).toEqual(receipt);
        // A bounded batch has its own starting totals; the next request starts anew.
        const bounded = runtime.restoreSession(entry);
        const frame = await bounded.play({...command, maxSubrounds: 1});
        const boundedState = bounded.serialize();
        expect(await runtime.restoreSession(boundedState).play({...command, maxSubrounds: 1})).toEqual(frame);
        const next = {delivery: "composite", continuation: {roundId: "x", cursor: frame.logicalRound!.deliveryCursor}};
        const finished = await bounded.play(next);
        expect(finished.logicalRound?.status).toBe("completed");
        expect(await runtime.restoreSession(bounded.serialize()).play(next)).toEqual({...finished, deliveries: undefined});
    } finally {
        runtime.dispose();
    }
});

it("binds visible receipt screens to artifact coordinates rather than evaluated or generated matrices", async () => {
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    const blueprint = weightedBonusBlueprint();
    Reflect.deleteProperty(blueprint.mechanics!, "weightedBonus");
    blueprint.mechanics!.freeGames = {scatterSymbol: "C", awardsByCount: {3: 0}};
    blueprint.rows = 3;
    blueprint.scatters = ["C"];
    blueprint.reelStrips = [["C", "A", "C", "A"], ["C", "A", "C", "A"], ["C", "A", "C", "A"]];
    blueprint.screenGeometry = {generated: {reels: 3, rows: 4}, visible: {rowOffset: 0.5, rows: 2}, evaluated: {rowOffset: 1, rows: 1}, paylineSpace: "evaluated"};
    const fixture = createCanonicalWasmFixture({blueprint});
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("projection"));
    try {
        const session = runtime.createSession("projection");
        const command = {bet: 0.05, roundId: "screen", delivery: "stepwise"};
        const result = await session.play(command);
        const saved = session.serialize();
        if (saved.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
        const artifact = saved.feature.logicalRound!.subrounds[0].artifacts![0];
        expect(result.screen.every(reel => reel.length === 3)).toBe(true);
        expect(artifact.screen.every(reel => reel.length === 3)).toBe(true);
        const evaluated = artifact.generatedScreen!.map(reel => reel.slice(1, 2));
        expect(await runtime.restoreSession(saved).play(command)).toEqual(result);
        for (const screen of [evaluated, artifact.generatedScreen, [["A", "A", "A"], ["A", "A", "A"], ["A", "A", "A"]]]) {
            const corrupt = JSON.parse(JSON.stringify(saved));
            Object.assign(corrupt.feature.lastRound, {screen, network: {...result.network, reelsSymbols: screen}});
            expect(() => runtime.restoreSession(corrupt)).toThrow(/screen/);
        }
        const corrupt = JSON.parse(JSON.stringify(saved));
        const retained = corrupt.feature.logicalRound.subrounds[0];
        retained.artifacts[0].geometry.visible.rowOffset = 1.5;
        retained.artifacts[0].screen = retained.artifacts[0].generatedScreen.map((reel: string[]) => reel.slice(1, 4));
        retained.screen = retained.artifacts[0].screen;
        corrupt.feature.lastRound.screen = retained.screen;
        corrupt.feature.lastRound.network.reelsSymbols = retained.screen;
        corrupt.feature.lastRound.logicalRound = corrupt.feature.logicalRound;
        expect(() => runtime.restoreSession(corrupt)).toThrow(/geometry/);
    } finally {
        runtime.dispose();
    }
});

it.each(["stepwise", "composite"].flatMap(delivery => ["literal", "weighted", "banked"].map(kind => ({delivery, kind}))))("keeps completed $delivery/$kind progress aligned through plain play, restore and replay", async ({delivery, kind}) => {
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    const {replayModesBlueprint} = await import("./fixtures/ExistingMechanicsGame.js");
    const blueprint = kind === "banked" ? replayModesBlueprint() : weightedBonusBlueprint();
    if (kind === "banked") blueprint.paytable.A = {3: 2};
    else blueprint.mechanics!.weightedBonus!.outcomes.forEach(outcome => outcome.weight = outcome.id === "large" ? 1 : 0);
    if (kind === "weighted") {
        Reflect.deleteProperty(blueprint, "reelStrips");
        blueprint.reelSequences = Array.from({length: 3}, () => ({type: "weighted", variants: [{id: "chosen", symbols: ["C"], weight: 1}, {id: "zero", symbols: ["A"], weight: 0}]}));
    }
    const fixture = createCanonicalWasmFixture({blueprint});
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("probe"));
    const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("fresh"));
    try {
        const session = runtime.createSession("probe");
        let result = await session.play({bet: 0.05, roundId: "logical", delivery, ...(kind === "banked" ? {mode: "buy-more"} : {})});
        while (result.logicalRound?.status === "pending") result = await session.play({delivery, continuation: {roundId: "logical", cursor: result.logicalRound.deliveryCursor}});
        const completed = session.serialize();
        await expect(session.play({bet: 99})).rejects.toThrow(/bet/);
        expect(session.serialize()).toEqual(completed);
        for (const entryId of [undefined, "plain"]) {
            const active = runtime.restoreSession(completed);
            const reference = fresh.restoreSession(completed);
            const steps = kind === "banked" ? 4 : 3;
            for (let index = 0; index < steps; index++) {
                const command = {bet: 0.05, ...(index === 0 && entryId ? {roundId: entryId} : {}), ...(index === 0 && kind === "banked" ? {mode: "buy-more"} : {})};
                const before = active.serialize();
                const played = await active.play(command);
                expect(played).toEqual(await reference.play(command));
                expect(played.logicalRound).toBeUndefined();
                if (kind === "banked") {
                    expect(played.win).toBe(0.1);
                    expect(played.payout).toBeCloseTo(index === steps - 1 ? 0.4 : 0);
                }
                const state = active.serialize();
                if (state.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature state");
                expect(state.feature.logicalRound).toBeUndefined();
                expect(state.feature.deliveryStart).toBeUndefined();
                expect(state.feature.deliveryPrefix).toBeUndefined();
                expect(state.feature.plainMath?.artifact.totalWin).toBe(played.win);
                expect(await runtime.replay(before, [command])).toMatchObject({rounds: [played], stateAfter: state});
                const restored = runtime.restoreSession(JSON.parse(JSON.stringify(state)));
                expect(restored.serialize()).toEqual(state);
                const next = {bet: 0.05};
                const expected = await restored.play(next);
                expect((await runtime.replay(state, [next])).rounds).toEqual([expected]);
                restored.dispose();
                if (index === 0 && entryId) expect(await reference.play(command)).toEqual(played);
            }
            expect(await active.play({bet: 0.05, delivery: "composite", roundId: "again"})).toEqual(await reference.play({bet: 0.05, delivery: "composite", roundId: "again"}));
            active.dispose();
            reference.dispose();
        }
    } finally {
        fresh.dispose();
        runtime.dispose();
    }
});

it.each(["ways", "clusters"] as const)("restores %s base display amounts separately from multiplied mathematics, including zero factors", async type => {
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    for (const factor of [0, 2, 1e-7]) {
        const blueprint = JSON.parse(fs.readFileSync(path.resolve("examples/blueprints/wild-multiplier.blueprint.json"), "utf8"));
        blueprint.winModel = {type, ...(type === "clusters" ? {minimumClusterSize: 2} : {})};
        blueprint.mechanics.modifiers.wilds[0].factor = factor;
        const fixture = createCanonicalWasmFixture({blueprint});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("amounts"));
        try {
            const session = runtime.createSession("amounts");
            const command = {bet: 0.05, roundId: "amounts", delivery: "stepwise"};
            const played = await session.play(command);
            const saved = session.serialize();
            const restored = runtime.restoreSession(saved);
            expect(await restored.play(command)).toEqual(played);
            expect(restored.getInitialData?.()).toMatchObject(played.network!);
            const corrupt = JSON.parse(JSON.stringify(saved));
            const field = type === "ways" ? "winningWays" : "winningClusters";
            const key = Object.keys(corrupt.feature.lastRound.network[field])[0];
            corrupt.feature.lastRound.network[field][key].winAmount = -123;
            expect(() => runtime.restoreSession(corrupt)).toThrow(`network.${field}`);
            expect(await restored.play({bet: 0.05})).toEqual(await session.play({bet: 0.05}));
        } finally {
            runtime.dispose();
        }
    }
});

it.each([1, 3])("preserves ordered overlapping modifiers and lifetime %s expiry through JSON restore/replay", async lifetime => {
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    const blueprint = JSON.parse(fs.readFileSync("examples/blueprints/wild-sticky.blueprint.json", "utf8"));
    blueprint.rows = 2;
    blueprint.reelStrips = [["A", "A"], ["B", "B"], ["W3", "W3"]];
    blueprint.mechanics.modifiers.rules = [
        {id: "make", type: "transform", space: "evaluated", positions: [[1, 0]], from: "B", to: "W2"},
        {id: "expand", type: "expand", space: "evaluated", positions: [[1, 0]], symbol: "W2"},
        {id: "retain", type: "sticky", space: "evaluated", positions: [[1, 1]], symbol: "W2", lifetime},
    ];
    const fixture = createCanonicalWasmFixture({blueprint});
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("expiry"));
    const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("receiving"));
    try {
        const session = runtime.createSession("expiry");
        for (let index = 0; index < 4; index++) {
            const command = {bet: 0.05, roundId: `expiry:${index}`, delivery: "stepwise"};
            const played = await session.play(command);
            const remaining = lifetime === 1 ? 0 : [2, 1, 0, 2][index];
            expect(played.network?.modifiers).toEqual({space: "evaluated", rules: [
                {id: "make", positions: [[1, 0]]}, {id: "expand", positions: [[1, 0], [1, 1]]}, {id: "retain", positions: [[1, 1]]},
            ], sticky: [{ruleId: "retain", position: [1, 1], symbol: "W2", factor: 2, remaining}]});
            const saved = JSON.parse(JSON.stringify(session.serialize()));
            expect(saved.feature.state.modifierState.cells).toHaveLength(remaining > 0 ? 1 : 0);
            const restored = fresh.restoreSession(saved);
            expect(await restored.play(command)).toEqual(played);
            expect((await runtime.replay(saved, [command])).rounds).toEqual([played]);
            const next = {bet: 0.05, roundId: `next:${index}`, delivery: "stepwise"};
            const expected = await restored.play(next);
            expect((await runtime.replay(saved, [next])).rounds).toEqual([expected]);
            restored.dispose();
        }
    } finally {
        runtime.dispose();
        fresh.dispose();
    }
});

it("restores expansion in triggering-cell order when configured reels are interleaved", async () => {
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    const blueprint = JSON.parse(fs.readFileSync("examples/blueprints/wild-sticky.blueprint.json", "utf8"));
    blueprint.rows = 2;
    blueprint.reelStrips = [["A", "W2"], ["W2", "A"], ["W3", "W3"]];
    blueprint.mechanics.modifiers.rules = [{id: "expand", type: "expand", space: "evaluated", positions: [[0, 0], [1, 0], [0, 1]], symbol: "W2"}];
    const fixture = createCanonicalWasmFixture({blueprint});
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom: () => 0, serializeState: () => 0, restoreState: () => undefined});
    try {
        const session = runtime.createSession("interleaved");
        const command = {bet: 0.05, roundId: "x", delivery: "stepwise"};
        const played = await session.play(command);
        expect(played.network?.modifiers?.rules).toEqual([{id: "expand", positions: [[1, 0], [1, 1], [0, 0], [0, 1]]}]);
        expect(played.screen).toEqual([["W2", "W2"], ["W2", "W2"], ["W3", "W3"]]);
        const saved = session.serialize();
        expect(await runtime.restoreSession(saved).play(command)).toEqual(played);
        expect((await runtime.replay(saved, [command])).rounds).toEqual([played]);
    } finally {
        runtime.dispose();
    }
});

it.each(["plain", "stepwise", "composite"] as const)("restores %s modifier/free-game accounting with banked wins and outer jackpot awards", async policy => {
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    const {mutateCheckpointProjection} = await import("../fixtures/wasm/checkpointProjectionMutations.js");
    const blueprint = JSON.parse(fs.readFileSync("examples/blueprints/wild-expanding.blueprint.json", "utf8"));
    blueprint.mechanics.freeGames = {scatterSymbol: "S", awardsByCount: {3: 0}};
    blueprint.mechanics.jackpot = {pool: {id: "mini", type: "fixed", amount: 10}, contribution: {type: "percentage", percentage: 0.1}, trigger: {type: "symbol-count", symbolId: "A", minimumCount: 1}, award: "single-tier"};
    blueprint.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 10, forcedFreeGames: 3}];
    const fixture = createCanonicalWasmFixture({blueprint});
    const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("probe"));
    const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("fresh"));
    try {
        const session = runtime.createSession("probe");
        const delivery = policy === "plain" ? {} : {delivery: policy, ...(policy === "composite" ? {maxSubrounds: 1} : {})};
        await session.play({bet: 0.05, mode: "buy", roundId: "banked", ...delivery});
        await session.play(policy === "plain" ? {} : {...delivery, continuation: {roundId: "banked", cursor: 1}});
        const saved = session.serialize();
        const corrupt = mutateCheckpointProjection(saved, ["analyticsAccounting.inflated"]);
        expect(() => runtime.restoreSession(corrupt)).toThrow(/analytics.*accounting/i);
        const restored = fresh.restoreSession(saved);
        const finish = policy === "plain" ? {} : {...delivery, continuation: {roundId: "banked", cursor: 2}};
        const result = await restored.play(finish);
        expect(await session.play(finish)).toEqual(result);
        expect(result.analytics?.features).toContainEqual(expect.objectContaining({feature: "freeGames", completion: {duration: 3, win: 39, entryPosition: 1}}));
        expect(result.win).toBe(13);
        expect(result.payout).toBe(19);
        expect((await runtime.replay(saved, [finish])).rounds).toEqual([result]);
        expect(await runtime.restoreSession(restored.serialize()).play({bet: 0.05})).toEqual(await restored.play({bet: 0.05}));
    } finally {
        runtime.dispose();
        fresh.dispose();
    }
});

it.each(["plain", "stepwise", "composite"] as const)("retains valid %s natural free-game grants, retriggers and missing/zero grants", async policy => {
    const {createCanonicalWasmFixture} = await import("../fixtures/wasm/createCanonicalWasmFixture.js");
    const {checkpointFeatureObservationFixtures} = await import("../fixtures/wasm/checkpointProjectionMutations.js");
    for (const grant of [undefined, 0, 2]) {
        const blueprint = checkpointFeatureObservationFixtures().find(fixture => fixture.id === "freeGames")!.blueprint;
        blueprint.mechanics!.freeGames!.awardsByCount = grant === undefined ? {} : {3: grant};
        const fixture = createCanonicalWasmFixture({blueprint});
        const host = new SeededPokieWasmHost("probe");
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, host);
        const fresh = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("fresh"));
        try {
            const session = runtime.createSession("probe");
            let restored = fresh.restoreSession(session.serialize());
            for (let index = 0; index < 4; index++) {
                const saved = session.serialize();
                const progress = saved.schemaVersion === "pokie.state.v4" ? saved.feature.logicalRound : undefined;
                const command = {bet: 0.05, ...(policy === "plain" ? {} : {delivery: policy, maxSubrounds: 1,
                    ...(progress?.status === "pending" ? {continuation: {roundId: progress.id, cursor: progress.deliveryCursor}} : {roundId: `grant:${index}`})})};
                const result = await session.play(command);
                expect(await restored.play(command)).toEqual(result);
                expect((await runtime.replay(saved, [command])).rounds).toEqual([result]);
                const state = session.serialize();
                expect(state).toEqual(restored.serialize());
                if (state.schemaVersion !== "pokie.state.v4") throw new Error("Expected feature checkpoint");
                const events = state.feature.logicalRound?.subrounds[0].artifacts?.flatMap(step => step.featureEvents ?? []) ?? state.feature.plainMath!.artifact.featureEvents ?? [];
                expect(events).toEqual(grant ? [{type: "freeGamesTriggered", data: {count: grant}}] : []);
                expect(Reflect.get(result.network!, "freeGamesSum")).toBe((grant ?? 0) * (index + 1));
                expect(result.stake).toBe(grant && index > 0 ? 0 : 0.05);
                const before = host.serializeState();
                restored.dispose();
                restored = fresh.restoreSession(state);
                expect(host.serializeState()).toEqual(before);
            }
        } finally {
            runtime.dispose();
            fresh.dispose();
        }
    }
});
