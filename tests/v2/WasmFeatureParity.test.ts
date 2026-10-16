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
        const command = {bet: 0.05, delivery: "composite", roundId: "cascade"};
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
        }
        expect(stepwise.serialize()).toMatchObject({rngState: saved.rngState, credits: composite.credits});
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
    } finally {
        runtime.dispose();
    }
});
