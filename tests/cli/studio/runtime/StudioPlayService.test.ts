import {transactionalRoundGame} from "../../../v2/fixtures/TransactionalRoundGame.js";
import {createOverscanGame, overscanBlueprint, overscanGeometry} from "../../../v2/fixtures/OverscanGame.js";
import {emitPublicRuntime} from "../../../v2/helpers/publicRuntime.js";
import {replayModesBlueprint} from "../../../v2/fixtures/ExistingMechanicsGame.js";
import {createRequire} from "node:module";
import ts from "typescript";
import {
    ReplayRecorder, AuditRoundReplay, buildRoundArtifact, InMemorySessionRepository, InMemoryWallet, SpinCommandHandler,
    GameSessionHandling,
    GameWithFreeGamesSessionHandling,
    GamePackageGenerator,
    type GameBlueprint,
    OutcomeLibraryBundleModeInput,
    OutcomeLibraryBundleWriter,
    PokieGame,
    PokieGameManifest,
    PokieWasmRuntime,
    PokieWasmRuntimeSession,
    loadPokieGame,
    STUDIO_OPERATION,
    StakeEngineExportModeInput,
    StakeEngineExporter,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotSessionHandling,
    VideoSlotWinCalculator,
    WASM_MANIFEST_READ_CAPABILITY,
    WinEvaluationResult,
} from "@fromstan/pokie";
import ExcelJS from "exceljs";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {StudioPlayService} from "../../../../cli/studio/runtime/StudioPlayService.js";
import {createMaterializingRuntimePackageResolver} from "../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioRoundRecorder} from "../../../../cli/studio/runtime/StudioRoundRecorder.js";
import {
    buildOutcomeLibraryBundleModeInput,
    outcomeLibraryBundleTestProvenance,
} from "../../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {buildStakeEngineTestLibrary} from "../../../stakeengine/StakeEngineTestFixtures.js";

import {buildReplayDownload} from "../../../../cli/studio/replay/buildReplayDownload.js";
import {validateReplayRequest} from "../../../../cli/studio/replay/validateReplayRequest.js";

import {legacyCompositions} from "../../../v2/fixtures/LegacyComposedGame.js";

const fixtureCommandAuthority: Pick<PokieGame, "getSessionCommandCapabilities"> = {
    getSessionCommandCapabilities: () => ({bets: [0.05, 7.5, 1e-7, 1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100], modes: ["base", "ante", "buyFeature"]}),
};

const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

function wasmProject(
    rootPath = "/fake/canonical.wasm",
    capabilities = [WASM_MANIFEST_READ_CAPABILITY, "wasm.canonical", "wasm.runtime.play", "wasm.runtime.serialize", "wasm.runtime.replay", "wasm.runtime.execute", "wasm.artifact.inspect"],
) {
    return {rootPath, type: "wasm" as const, capabilities, provenance: "canonical POKIE WASM component"};
}

function fakeWasmRuntime(play: PokieWasmRuntimeSession["play"] = () => Promise.resolve({
    sequence: 1,
    draw: 0,
    stops: [0],
    screen: [["A"]],
    winMultiplier: 1,
    stake: 1,
    payout: 1,
    creditsBefore: 1000,
    credits: 1000,
    command: {},
})): {runtime: PokieWasmRuntime; session: PokieWasmRuntimeSession; dispose: jest.Mock; disposeSession: jest.Mock} {
    const dispose = jest.fn();
    const disposeSession = jest.fn();
    const session: PokieWasmRuntimeSession = {play, serialize: () => ({schemaVersion: "pokie.state.v2", seed: "test", drawCount: 0, sequence: 0, credits: 1000}), dispose: disposeSession, setTraceCollector: jest.fn()};
    const runtime = {
        manifest: {component: {id: "wasm-slot", version: "1.0.0"}, capabilities: ["runtime.play", "runtime.serialize", "runtime.replay", "artifact.inspect"], artifact: {sha256: "integrity"}},
        createSession: () => session,
        restoreSession: () => session,
        replay: () => Promise.resolve([]),
        dispose,
    } as unknown as PokieWasmRuntime;
    return {runtime, session, dispose, disposeSession};
}

function deferred<T>(): {promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void} {
    let resolve: (value: T) => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

function runtimeSnapshotsForPackage(packageName: string): string[] {
    return fs
        .readdirSync(os.tmpdir())
        .filter((entry) => entry.startsWith("pokie-runtime-"))
        .map((entry) => path.join(os.tmpdir(), entry))
        .filter((root) => {
            try {
                return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).name === packageName;
            } catch {
                return false;
            }
        });
}

function winEvaluationResultWithWin(): WinEvaluationResult<string> {
    const config = new VideoSlotConfig();
    const winCalculator = new VideoSlotWinCalculator(config);
    const symbols = new SymbolsCombination<string>().fromMatrix([
        ["A", "A", "A"],
        ["A", "K", "Q"],
        ["A", "K", "Q"],
        ["K", "Q", "J"],
        ["Q", "J", "10"],
    ]);
    winCalculator.calculateWin(config.getAvailableBets()[0], symbols);
    return winCalculator.getWinEvaluationResult();
}

// A real GameSessionHandling + VideoSlotSessionHandling-shaped fake -- what "full" capture (always on
// for Play, see StudioPlayService's own doc comment) needs to actually build a RoundArtifact through
// buildRoundArtifactFromSession, not just a plain fake with no screen/win-evaluation shape.
function createFakeVideoSlotSession(seed: string | number | undefined): GameSessionHandling & VideoSlotSessionHandling<string> {
    let credits = 1000;
    const bet = 5;
    const screen = [[`seed-${String(seed ?? "none")}`]];

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        canPlayNextGame: () => credits >= bet,
        play: () => {
            credits -= bet;
        },
        getWinAmount: () => winEvaluationResultWithWin().getTotalWin(),
        getSymbolsCombination: () => ({toMatrix: () => screen}),
        getWinEvaluationResult: () => winEvaluationResultWithWin(),
    } as unknown as GameSessionHandling & VideoSlotSessionHandling<string>;
}

function createFakeVideoSlotGame(): PokieGame {
    return {getManifest: () => manifest, ...fixtureCommandAuthority, createSession: (context) => createFakeVideoSlotSession(context?.seed)};
}

function fakeLoadVideoSlotGame(): (packageRoot: string) => Promise<PokieGame> {
    return () => Promise.resolve(createFakeVideoSlotGame());
}

// The serializer's public payload is allowed to be presentation-oriented and therefore can contain a
// stale `win`. Studio must keep the settled result from SpinCommandHandler as the round summary's
// authoritative win; otherwise Session Spin can contradict the RoundArtifact it opens.
function fakeLoadGameWithStaleSerializedWin(): (packageRoot: string) => Promise<PokieGame> {
    return () =>
        Promise.resolve({
            getManifest: () => manifest, ...fixtureCommandAuthority,
            createSession: () => {
                const session = createFakeVideoSlotSession(undefined);
                return {...session, getWinAmount: () => 7};
            },
            getSessionSerializer: () => ({
                getInitialData: (session: GameSessionHandling) => ({
                    availableBets: session.getAvailableBets(),
                    credits: session.getCreditsAmount(),
                    bet: session.getBet(),
                }),
                getRoundData: (session: GameSessionHandling) => ({
                    credits: session.getCreditsAmount(),
                    bet: session.getBet(),
                    win: 0,
                }),
            }),
        });
}

// A controllable VideoSlotSessionHandling-shaped fake for findAnyWin()/findSymbolWin() -- unlike
// createFakeVideoSlotSession above (always wins the exact same way), each play() here consults
// `winningSymbolAtAttempt` for *this* attempt's own outcome, so a test can make the search take an exact
// number of real spins, or never win at all, without depending on the real win-evaluation engine's own
// paytable/line-matching odds. getWinningLines()/getWinningScatters()/isSymbolScatter() are exactly what
// PlayUntilSymbolWinStrategy itself reads (see its own doc comment) -- getWinEvaluationResult() (what
// buildRoundArtifactFromSession itself reads) is kept independently truthful to the same outcome.
function createControllableVideoSlotSession(winningSymbolAtAttempt: (attempt: number) => string | undefined): {
    session: GameSessionHandling & VideoSlotSessionHandling<string>;
    getAttempts: () => number;
} {
    let credits = 100000;
    const bet = 5;
    let attempts = 0;
    let currentWinningSymbol: string | undefined;

    const session = {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        getAvailableSymbols: () => ["A", "K", "Q", "J"],
        canPlayNextGame: () => credits >= bet,
        isSymbolScatter: () => false,
        play: () => {
            attempts += 1;
            currentWinningSymbol = winningSymbolAtAttempt(attempts);
            credits = credits - bet + (currentWinningSymbol !== undefined ? 2 : 0);
        },
        getWinAmount: () => (currentWinningSymbol !== undefined ? 2 : 0),
        getSymbolsCombination: () => ({toMatrix: () => [[currentWinningSymbol ?? "none"]]}),
        getWinEvaluationResult: () => (currentWinningSymbol !== undefined ? winEvaluationResultWithWin() : new WinEvaluationResult<string>()),
        getWinningLines: () => (currentWinningSymbol !== undefined ? {"1": {getSymbolId: () => currentWinningSymbol}} : {}),
        getWinningScatters: () => ({}),
    } as unknown as GameSessionHandling & VideoSlotSessionHandling<string>;

    return {session, getAttempts: () => attempts};
}

// A controllable GameWithFreeGamesSessionHandling-shaped fake for findFreeGames() -- each play() consults
// `wonFreeGamesAtAttempt` for *this* attempt's own outcome, the same per-attempt control
// createControllableVideoSlotSession above gives findAnyWin()/findSymbolWin(). getFreeGamesNum()/
// getFreeGamesSum()/getFreeGamesBank() are never actually read by the default (lastFreeGame: false)
// PlayFreeGamesStrategy findFreeGames() drives, but are implemented anyway so this fake genuinely
// satisfies the full feature-detected contract, not just the one method that call path happens to touch.
function createControllableFreeGamesSession(wonFreeGamesAtAttempt: (attempt: number) => number): {
    session: GameSessionHandling & VideoSlotSessionHandling<string> & GameWithFreeGamesSessionHandling;
    getAttempts: () => number;
} {
    let credits = 100000;
    const bet = 5;
    let attempts = 0;
    let currentWonFreeGames = 0;

    const session = {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        canPlayNextGame: () => credits >= bet,
        play: () => {
            attempts += 1;
            currentWonFreeGames = wonFreeGamesAtAttempt(attempts);
            credits -= bet;
        },
        getWinAmount: () => 0,
        getSymbolsCombination: () => ({toMatrix: () => [[currentWonFreeGames > 0 ? "Scatter" : "A"]]}),
        getWinEvaluationResult: () => new WinEvaluationResult<string>(),
        getWonFreeGamesNumber: () => currentWonFreeGames,
        getFreeGamesNum: () => 0,
        getFreeGamesSum: () => 0,
        getFreeGamesBank: () => 0,
    } as unknown as GameSessionHandling & VideoSlotSessionHandling<string> & GameWithFreeGamesSessionHandling;

    return {session, getAttempts: () => attempts};
}

// An outcome-library mode whose every drawn outcome's own RoundArtifact already carries a real
// "freeGamesTriggered" feature event -- the exact event buildRoundArtifactFromSession derives from a live
// session's own getWonFreeGamesNumber() (see that function's own doc comment), here built directly since
// an outcome-library draw has no live session to derive it from. Every outcome matches, so a search against
// this mode always finds one on the very first draw -- deterministic, no reliance on weighted-draw luck.
function buildFreeGamesLibraryModeInput(modeName: string, libraryId: string): OutcomeLibraryBundleModeInput<string> {
    return {
        modeName,
        libraryId,
        outcomes: [
            {
                id: "0",
                weight: 1,
                artifact: buildRoundArtifact({
                    roundId: `${libraryId}-0`,
                    provenance: outcomeLibraryBundleTestProvenance,
                    betMode: "base",
                    stake: 1,
                    steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult<string>()}],
                    featureEvents: [{type: "freeGamesTriggered", data: {count: 3}}],
                }),
            },
        ],
    };
}

// No getSymbolsCombination()/getWinEvaluationResult() at all -- plain GameSessionHandling, so a "full"
// capture can't build a RoundArtifact and must report roundArtifactUnavailableReason instead.
function createFakeNonVideoSlotGame(): PokieGame {
    return {
        getManifest: () => manifest, ...fixtureCommandAuthority,
        createSession: () => {
            let credits = 1000;
            const bet = 1;
            return {
                getCreditsAmount: () => credits,
                setCreditsAmount: (value: number) => {
                    credits = value;
                },
                getBet: () => bet,
                setBet: () => undefined,
                getAvailableBets: () => [bet],
                canPlayNextGame: () => credits >= bet,
                play: () => {
                    credits -= bet;
                },
                getWinAmount: () => 0,
            };
        },
    };
}

describe("StudioPlayService", () => {
    let publicRuntime: ReturnType<typeof emitPublicRuntime>;
    beforeAll(() => {
        publicRuntime = emitPublicRuntime();
    }, 60000);
    afterAll(() => publicRuntime?.dispose());
    it.each([false, true].flatMap(weighted => [false, true].flatMap(typed => [undefined, "review-fixed"].map(seed => ({weighted, typed, seed})))))("records executable package steps through Play, history and replay import (weighted=$weighted, typed=$typed, seed=$seed)", async ({weighted, typed, seed}) => {
        const root = path.join(publicRuntime.directory, `audit-${weighted}-${typed}-${seed ?? "unseeded"}`);
        const blueprint = replayModesBlueprint(weighted);
        blueprint.availableBets = [0.05];
        blueprint.manifest = {id: `v2c12-package-${weighted ? "weighted" : "ordinary"}`, name: `V2C12 Package ${weighted ? "Weighted" : "Ordinary"}`, version: "1.0.0"};
        const built = new GamePackageGenerator("1.3.0").generate(blueprint, root);
        const entry = path.join(built.projectRoot, "dist", "index.js");
        if (typed) fs.writeFileSync(entry, ts.transpileModule(fs.readFileSync(path.join(built.projectRoot, "src", "index.ts"), "utf8"), {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
        }).outputText);
        const game = createRequire(path.join(publicRuntime.directory, "consumer.cjs"))(entry) as PokieGame;
        if (!weighted) expect(game.getConfigHash!()).toBe("sha256:7246985256df82890e2ebfcec0f81e6b7be5b5f5459a4a22b4c7a90b2554c124");
        const recorder = new StudioRoundRecorder();
        const service = new StudioPlayService(() => Promise.resolve(game), undefined, undefined, undefined, undefined, undefined, recorder);
        try {
            for (const [mode, stakes] of Object.entries({ante: [0.05 * 1.5, 0.05 * 1.5], buy: [0.5, 0, 0.5, 0], "buy-more": [1.25, 0, 0, 0, 1.25, 0, 0, 0]})) {
                recorder.clearAll();
                const created = await service.newSession(built.projectRoot, seed);
                if (created.status !== "ok") throw new Error("No generated Play session");
                expect(created.session.debug?.stateAfter).toMatchObject({executionState: "durably-restorable"});
                const id = created.session.sessionId;
                expect(await service.spin(id, "spin", undefined, "missing", {requestId: "invalid"})).toMatchObject({status: "error", code: "invalid-command"});
                let continuation: {roundId: string; cursor: number} | undefined;
                for (const [index, stake] of stakes.entries()) {
                    const intent = continuation ? {requestId: `${mode}-${index}`, delivery: "stepwise" as const, continuation}
                        : {requestId: `${mode}-${index}`, roundId: `${mode}-${index}`, delivery: "stepwise" as const};
                    const result = await service.spin(id, "spin", undefined, continuation ? undefined : mode, intent);
                    if (result.status !== "ok") throw new Error(JSON.stringify(result));
                    const descriptor = result.session.debug?.recording;
                    expect(result.session.debug?.auditUnavailableReason).toBeUndefined();
                    expect(descriptor).toMatchObject({unit: "step", seed: seed ?? null, modePolicy: {betModeId: mode, selection: "recorded-commands"}, artifact: {stake, betMode: mode}});
                    expect(result.session.debug?.artifact).toEqual(descriptor!.artifact);
                    expect(descriptor!.artifact?.steps).toHaveLength(1);
                    expect(descriptor!.artifact?.featureEvents).toContainEqual({type: "chargedBetMode", data: {id: mode}});
                    expect(Boolean(descriptor!.artifact?.sequenceSelections?.length)).toBe(weighted);
                    const deliveries = descriptor!.audit!.deliveries;
                    expect(deliveries[deliveries.length - 1].result).toMatchObject({stake, mode});
                    expect(descriptor!.commands![descriptor!.commands!.length - 1]).toEqual(expect.objectContaining(intent));
                    const download = JSON.parse(buildReplayDownload(descriptor!, "step").body);
                    const imported = validateReplayRequest({recording: download}).recording!;
                    expect(imported).toEqual(descriptor);
                    expect(new AuditRoundReplay().replay(game, imported.audit).verification).toBe("verified");
                    expect(recorder.list()[0].debug?.recording).toEqual(descriptor);
                    const logical = result.session.logicalRound!;
                    continuation = logical.status === "pending" ? {roundId: logical.roundId, cursor: logical.cursor} : undefined;
                    if (continuation) expect(await service.spin(id, "spin", undefined, "buy", {requestId: `forbidden-${index}`, delivery: "stepwise", continuation})).toMatchObject({status: "error", code: "invalid-command"});
                }
                expect(continuation).toBeUndefined();
                expect(recorder.list()).toHaveLength(2);
            }
            // The independently observed public Spin drives composite delivery to completion.
            const created = await service.newSession(built.projectRoot);
            if (created.status !== "ok") throw new Error("No composite session");
            const intent = {requestId: "composite-buy", roundId: "composite-buy", delivery: "composite" as const};
            const result = await service.spin(created.session.sessionId, "spin", undefined, "buy", intent);
            if (result.status !== "ok") throw new Error(JSON.stringify(result));
            expect(result.session.logicalRound).toMatchObject({status: "completed", totalStake: 0.5});
            expect(result.session.debug?.recording).toMatchObject({artifact: {stake: 0, betMode: "buy"}, commands: [{mode: "buy"}, {continuation: {roundId: "composite-buy"}}]});
            expect(await service.spin(created.session.sessionId, "spin", undefined, "buy", intent)).toEqual(result);
        } finally {
            await service.reset();
        }
    });
    it("rejects a CJS selected mode excluded by retained capabilities in Play and scenario callers", async () => {
        const game = publicRuntime.legacyGame("bet-free", true);
        const service = new StudioPlayService(() => Promise.resolve(game));
        try {
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") throw new Error("Play session creation failed");
            const id = created.session.sessionId;
            expect(await service.spin(id)).toMatchObject({status: "ok"});
            const active = Reflect.get(service, "active") as {spinHandler: SpinCommandHandler};
            const repository = Reflect.get(active.spinHandler, "sessionRepository") as InMemorySessionRepository;
            const record = (await repository.loadVersioned(id))!;
            record.state.commandCapabilities = {...record.state.commandCapabilities!, modes: []};
            await repository.save(id, record.state);
            const before = await repository.loadVersioned(id);
            const writes = [jest.spyOn(repository, "saveVersioned"), jest.spyOn(game, "createSession")];
            for (const result of [await service.spin(id), await service.findAnyWin(id), await service.findSymbolWin(id, "A")]) {
                expect(result).toMatchObject({status: "error", code: "corrupt-state"});
            }
            expect(await repository.loadVersioned(id)).toEqual(before);
            writes.forEach(spy => {
                expect(spy).not.toHaveBeenCalled();
                spy.mockRestore();
            });
        } finally {
            service.reset();
        }
    });

    it.each(legacyCompositions)("plays and searches unchanged CJS composed %s packages without declarations", async composition => {
        for (const opaque of [false, true]) {
            const game = publicRuntime.legacyGame(composition, opaque);
            const service = new StudioPlayService(() => Promise.resolve(game));
            try {
                const created = await service.newSession("/fake/project");
                if (created.status !== "ok") throw new Error("Composed Play session creation failed");
                const id = created.session.sessionId;
                expect(await service.spin(id)).toMatchObject({status: "ok"});
                expect(await service.findAnyWin(id)).toMatchObject({status: "ok"});
                expect(await service.findSymbolWin(id, "A")).toMatchObject({status: "ok"});
                if (composition === "free-games" || composition === "free-bet") expect(await service.findFreeGames(id)).toMatchObject({status: "ok"});
                const active = Reflect.get(service, "active") as {spinHandler: SpinCommandHandler};
                const repository = Reflect.get(active.spinHandler, "sessionRepository") as InMemorySessionRepository;
                const record = (await repository.loadVersioned(id))!;
                expect(record.state.executionState).toBe("live-only");
                if (composition !== "free-games") {
                    let feature = record.state.featureState as {betModeId?: string; base?: unknown};
                    while (feature.betModeId === undefined) feature = feature.base as typeof feature;
                    feature.betModeId = "nonexistent";
                    await repository.save(id, record.state);
                    const before = await repository.loadVersioned(id);
                    const writes = [jest.spyOn(repository, "saveVersioned"), jest.spyOn(game, "createSession")];
                    expect(await service.spin(id)).toMatchObject({status: "error", code: "corrupt-state"});
                    expect(await service.findAnyWin(id)).toMatchObject({status: "error", code: "corrupt-state"});
                    expect(await repository.loadVersioned(id)).toEqual(before);
                    writes.forEach(spy => {
                        expect(spy).not.toHaveBeenCalled();
                        spy.mockRestore();
                    });
                }
            } finally {
                service.reset();
            }
        }
    });

    it("plays an unchanged CJS GameSession subclass and preserves restrictions and opaque snapshots", async () => {
        const game = publicRuntime.roundGame();
        expect(Object.keys(game).sort()).toEqual(["createSession", "getManifest"]);
        const service = new StudioPlayService(() => Promise.resolve(game));
        try {
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") throw new Error("Subclass Play session creation failed");
            const id = created.session.sessionId;
            const active = Reflect.get(service, "active") as {spinHandler: SpinCommandHandler};
            const repository = Reflect.get(active.spinHandler, "sessionRepository") as InMemorySessionRepository;
            const initial = (await repository.load(id))!;
            expect(initial).toMatchObject({stateSchema: {kind: "custom"}, featureState: {round: 0}, executionState: "live-only"});
            initial.commandCapabilities = {bets: [1]};
            await repository.save(id, initial);
            active.spinHandler.primeSession(id, active.spinHandler.getLiveSession(id)!, 2);
            for (const round of [1, 2]) {
                expect(await service.spin(id, undefined, 1)).toMatchObject({status: "ok", session: {debug: {stateAfter: {featureState: {round}, commandCapabilities: {bets: [1]}}}}});
                const before = await repository.loadVersioned(id);
                const writes = [jest.spyOn(repository, "saveVersioned"), jest.spyOn(game, "createSession")];
                expect(await service.spin(id, undefined, 2)).toMatchObject({status: "error", code: "invalid-command"});
                expect(await repository.loadVersioned(id)).toEqual(before);
                writes.forEach(spy => {
                    expect(spy).not.toHaveBeenCalled();
                    spy.mockRestore();
                });
            }
        } finally {
            service.reset();
        }
    });

    it("plays and searches scenarios with an unchanged getManifest/createSession-only package", async () => {
        const {session, getAttempts} = createControllableVideoSlotSession(attempt => attempt >= 3 ? "A" : undefined);
        const game: PokieGame = {getManifest: () => manifest, createSession: () => session};
        expect(Object.keys(game).sort()).toEqual(["createSession", "getManifest"]);
        const service = new StudioPlayService(() => Promise.resolve(game));
        try {
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") throw new Error("Unchanged package creation failed");
            const played = await service.spin(created.session.sessionId);
            expect(played.status).toBe("ok");
            const found = await service.findAnyWin(created.session.sessionId);
            expect(found.status).toBe("ok");
            if (found.status !== "ok") throw new Error("Unchanged package search failed");
            expect(found.session.win).toBeGreaterThan(0);
            expect(getAttempts()).toBe(3);
            expect(await service.findSymbolWin(created.session.sessionId, "A")).toMatchObject({status: "ok"});
        } finally {
            service.reset();
        }
    });

    it("finds free games with an unchanged getManifest/createSession-only package", async () => {
        const {session, getAttempts} = createControllableFreeGamesSession(attempt => attempt >= 3 ? 3 : 0);
        const game: PokieGame = {getManifest: () => manifest, createSession: () => session};
        const service = new StudioPlayService(() => Promise.resolve(game));
        try {
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") throw new Error("Unchanged package creation failed");
            const found = await service.findFreeGames(created.session.sessionId);
            expect(found.status).toBe("ok");
            if (found.status !== "ok") throw new Error("Unchanged package feature search failed");
            expect(found.session.debug?.artifact?.featureEvents).toEqual([{type: "freeGamesTriggered", data: {count: 3}}]);
            expect(getAttempts()).toBe(3);
        } finally {
            service.reset();
        }
    });

    it("creates a real, live session directly, with no server/host/port involved", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());

        const result = await service.newSession("/fake/project");

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.sessionId).toEqual(expect.any(String));
        expect(result.session.game).toEqual(manifest);
        expect(result.session.credits).toBe(1000);
        expect(result.session.win).toBeUndefined();
    });

    it("passes a given seed through to the game's own createSession() as a real PokieGameContext", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());

        const result = await service.newSession("/fake/project", "my-seed");

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.screen).toEqual([["seed-my-seed"]]);
    });

    it("reports a safe 'failed' result when the game fails to load, never throwing", async () => {
        const service = new StudioPlayService(() => Promise.reject(new Error("bad package")));

        const result = await service.newSession("/fake/project");

        expect(result).toEqual({status: "failed", error: "bad package"});
    });

    it("invalidates a live package session when its current path resolves as an inspection-only WASM component", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-play-wasm-session-"));
        const componentPath = path.join(workDir, "project.wasm");
        fs.writeFileSync(componentPath, "");
        const resolve = jest.fn()
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({
                rootPath: componentPath,
                type: "wasm",
                capabilities: [WASM_MANIFEST_READ_CAPABILITY],
                provenance: "compatible POKIE WASM component sidecar",
            });
        const loadGame = jest.fn(fakeLoadVideoSlotGame());
        const service = new StudioPlayService(loadGame, undefined, "unknown", {resolve});

        try {
            const created = await service.newSession(componentPath);
            if (created.status !== "ok") {
                throw new Error("expected a package session");
            }

            await expect(service.spin(created.session.sessionId)).resolves.toMatchObject({
                status: "error",
                error: expect.stringContaining("cannot play a game round"),
            });
            await expect(service.findAnyWin(created.session.sessionId)).resolves.toEqual({status: "not-found"});
            expect(loadGame).toHaveBeenCalledTimes(1);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("disposes a canonical WASM runtime when cancellation wins after loading but before installation", async () => {
        const controller = new AbortController();
        let resolveRuntime: (runtime: PokieWasmRuntime) => void = () => undefined;
        const deferred = new Promise<PokieWasmRuntime>((resolve) => {
            resolveRuntime = resolve;
        });
        const {runtime, dispose} = fakeWasmRuntime();
        const loadWasmRuntime = jest.fn(() => deferred);
        const service = new StudioPlayService(
            undefined,
            undefined,
            undefined,
            {resolve: () => Promise.resolve(wasmProject())},
            undefined,
            undefined,
            undefined,
            loadWasmRuntime,
        );

        const creating = service.newSession("/fake/canonical.wasm", "cancelled", undefined, {signal: controller.signal});
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(loadWasmRuntime).toHaveBeenCalledTimes(1);
        controller.abort();
        resolveRuntime(runtime);

        await expect(creating).resolves.toMatchObject({status: "failed", error: expect.stringContaining("cancelled")});
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it("disposes and removes a trapped canonical WASM session, and validates foreign scenario ids first", async () => {
        const trapped = fakeWasmRuntime(() => Promise.reject(new Error("WASM play trap")));
        const revalidation = fakeWasmRuntime();
        let loads = 0;
        const service = new StudioPlayService(
            undefined,
            undefined,
            undefined,
            {resolve: () => Promise.resolve(wasmProject())},
            undefined,
            undefined,
            undefined,
            () => Promise.resolve(++loads === 1 ? trapped.runtime : revalidation.runtime),
        );

        const created = await service.newSession("/fake/canonical.wasm", "trap-seed");
        if (created.status !== "ok") throw new Error("expected canonical WASM session");
        await expect(service.findAnyWin("foreign-session")).resolves.toEqual({status: "not-found"});
        await expect(service.findSymbolWin("foreign-session", "A")).resolves.toEqual({status: "not-found"});
        await expect(service.findFreeGames("foreign-session")).resolves.toEqual({status: "not-found"});

        await expect(service.spin(created.session.sessionId)).resolves.toEqual({status: "error", error: "WASM play trap"});
        expect(trapped.disposeSession).toHaveBeenCalledTimes(1);
        expect(trapped.dispose).toHaveBeenCalledTimes(1);
        await expect(service.spin(created.session.sessionId)).resolves.toEqual({status: "not-found"});
    });

    it("finds a settled canonical WASM payout and projects it through the ordinary RoundArtifact contract", async () => {
        const active = fakeWasmRuntime();
        const revalidation = fakeWasmRuntime();
        let loads = 0;
        const service = new StudioPlayService(
            undefined,
            undefined,
            "1.3.0",
            {resolve: () => Promise.resolve(wasmProject())},
            undefined,
            undefined,
            undefined,
            () => Promise.resolve(++loads === 1 ? active.runtime : revalidation.runtime),
        );

        const created = await service.newSession("/fake/canonical.wasm", "winning-seed");
        if (created.status !== "ok") throw new Error("expected canonical WASM session");
        const result = await service.findAnyWin(created.session.sessionId);
        expect(result).toMatchObject({
            status: "ok",
            session: {
                win: 1,
                debug: {
                    artifact: {
                        stake: 1,
                        totalWin: 1,
                        screen: [["A"]],
                        wins: [],
                        steps: [expect.objectContaining({totalWin: 1, wins: []})],
                    },
                },
            },
        });
        if (result.status === "ok") expect(result.session.debug?.artifactUnavailableReason).toBeUndefined();
    });

    it("finds a canonical WASM payout without artifact inspection and never infers a symbol catalog from its screen", async () => {
        const active = fakeWasmRuntime();
        const revalidation = fakeWasmRuntime();
        (active.runtime as unknown as {manifest: {capabilities: string[]}}).manifest.capabilities = ["runtime.play", "runtime.serialize"];
        (revalidation.runtime as unknown as {manifest: {capabilities: string[]}}).manifest.capabilities = ["runtime.play", "runtime.serialize"];
        let loads = 0;
        const service = new StudioPlayService(
            undefined,
            undefined,
            "1.3.0",
            {resolve: () => Promise.resolve(wasmProject("/fake/canonical.wasm", [WASM_MANIFEST_READ_CAPABILITY, "wasm.canonical", "wasm.runtime.play", "wasm.runtime.serialize"]))},
            undefined,
            undefined,
            undefined,
            () => Promise.resolve(++loads === 1 ? active.runtime : revalidation.runtime),
        );

        const created = await service.newSession("/fake/canonical.wasm", "payout-without-inspection");
        if (created.status !== "ok") throw new Error("expected canonical WASM session");
        const result = await service.findAnyWin(created.session.sessionId);

        expect(result).toMatchObject({
            status: "ok",
            session: {
                win: 1,
                screen: [["A"]],
                debug: {artifactUnavailableReason: expect.stringContaining("does not declare artifact.inspect")},
            },
        });
        if (result.status === "ok") {
            expect(result.session.debug?.artifact).toBeUndefined();
            expect(result.session.availableSymbols).toBeUndefined();
        }
    });

    it("disposes the captured WASM session when integrity revalidation fails", async () => {
        const active = fakeWasmRuntime();
        const mismatched = fakeWasmRuntime();
        (mismatched.runtime as unknown as {manifest: {artifact: {sha256: string}}}).manifest.artifact.sha256 = "replacement-integrity";
        let loads = 0;
        const service = new StudioPlayService(
            undefined,
            undefined,
            undefined,
            {resolve: () => Promise.resolve(wasmProject())},
            undefined,
            undefined,
            undefined,
            () => Promise.resolve(++loads === 1 ? active.runtime : mismatched.runtime),
        );

        const created = await service.newSession("/fake/canonical.wasm", "integrity");
        if (created.status !== "ok") throw new Error("expected canonical WASM session");
        await expect(service.spin(created.session.sessionId)).resolves.toMatchObject({
            status: "error",
            error: expect.stringContaining("artifact changed after this session was opened"),
        });
        expect(active.disposeSession).toHaveBeenCalledTimes(1);
        expect(active.dispose).toHaveBeenCalledTimes(1);
        await expect(service.spin(created.session.sessionId)).resolves.toEqual({status: "not-found"});
    });

    it("does not let stale WASM revalidation dispose a replacement session", async () => {
        const stale = fakeWasmRuntime();
        const replacement = fakeWasmRuntime();
        const revalidation = deferred<PokieWasmRuntime>();
        const replacementRevalidationRuntime = fakeWasmRuntime();
        let calls = 0;
        const service = new StudioPlayService(
            undefined,
            undefined,
            undefined,
            {resolve: () => Promise.resolve(wasmProject())},
            undefined,
            undefined,
            undefined,
            () => {
                calls++;
                if (calls === 1) return Promise.resolve(stale.runtime);
                if (calls === 2) return revalidation.promise;
                if (calls === 3) return Promise.resolve(replacement.runtime);
                return Promise.resolve(replacementRevalidationRuntime.runtime);
            },
        );

        const first = await service.newSession("/fake/canonical.wasm", "stale");
        if (first.status !== "ok") throw new Error("expected stale WASM session");
        const spinning = service.spin(first.session.sessionId);
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(calls).toBe(2);

        const current = await service.newSession("/fake/canonical.wasm", "replacement");
        if (current.status !== "ok") throw new Error("expected replacement WASM session");
        revalidation.reject(new Error("stale revalidation failure"));

        await expect(spinning).resolves.toEqual({status: "not-found"});
        expect(stale.disposeSession).toHaveBeenCalledTimes(1);
        expect(stale.dispose).toHaveBeenCalledTimes(1);
        expect(replacement.disposeSession).not.toHaveBeenCalled();
        expect(replacement.dispose).not.toHaveBeenCalled();
        await expect(service.spin(current.session.sessionId)).resolves.toMatchObject({status: "ok", session: {sessionId: current.session.sessionId}});
    });

    it("returns not-found and records nothing when a WASM session is replaced while play awaits", async () => {
        const played = deferred<Awaited<ReturnType<PokieWasmRuntimeSession["play"]>>>();
        const stale = fakeWasmRuntime(() => played.promise);
        const replacement = fakeWasmRuntime();
        const staleRevalidationRuntime = fakeWasmRuntime();
        const replacementRevalidationRuntime = fakeWasmRuntime();
        const recorder = new StudioRoundRecorder();
        let calls = 0;
        const service = new StudioPlayService(
            undefined,
            undefined,
            undefined,
            {resolve: () => Promise.resolve(wasmProject())},
            undefined,
            undefined,
            recorder,
            () => {
                calls++;
                if (calls === 1) return Promise.resolve(stale.runtime);
                if (calls === 2) return Promise.resolve(staleRevalidationRuntime.runtime);
                if (calls === 3) return Promise.resolve(replacement.runtime);
                return Promise.resolve(replacementRevalidationRuntime.runtime);
            },
        );

        const first = await service.newSession("/fake/canonical.wasm", "stale");
        if (first.status !== "ok") throw new Error("expected stale WASM session");
        const spinning = service.spin(first.session.sessionId);
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(calls).toBe(2);

        const current = await service.newSession("/fake/canonical.wasm", "replacement");
        if (current.status !== "ok") throw new Error("expected replacement WASM session");
        played.resolve({sequence: 1, draw: 0, stops: [0], screen: [["A"]], winMultiplier: 1, stake: 1, payout: 1, creditsBefore: 1000, credits: 1000, command: {}});

        await expect(spinning).resolves.toEqual({status: "not-found"});
        expect(recorder.list()).toEqual([]);
        await expect(service.spin(current.session.sessionId)).resolves.toMatchObject({status: "ok", session: {sessionId: current.session.sessionId}});
        expect(recorder.list()).toHaveLength(1);
    });

    it("spins the just-created session and returns a real RoundArtifact, settled through the same wallet SpinCommandHandler always uses", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        const result = await service.spin(created.session.sessionId);

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.credits).toBe(995);
        expect(typeof result.session.win).toBe("number");
        expect(result.session.debug?.artifact).toBeDefined();
        expect(result.session.debug?.artifactUnavailableReason).toBeUndefined();
    });

    it("applies Play's selected bet and runtime mode to the exact SpinCommandHandler round", async () => {
        const session = createFakeVideoSlotSession(undefined) as GameSessionHandling & VideoSlotSessionHandling<string> & {
            getBetModeId(): string;
            getAvailableBetModeIds(): string[];
            setBetMode(mode: string): void;
        };
        let selectedBet = 1;
        let selectedMode = "base";
        session.getBet = () => selectedBet;
        session.setBet = (bet) => {
            selectedBet = bet;
        };
        session.getAvailableBets = () => [1, 5];
        session.getBetModeId = () => selectedMode;
        session.getAvailableBetModeIds = () => ["base", "ante", "buyFeature"];
        session.setBetMode = (mode) => {
            selectedMode = mode;
        };
        const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, ...fixtureCommandAuthority, createSession: () => session}));
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        const result = await service.spin(created.session.sessionId, "spin", 5, "ante");

        expect(result).toMatchObject({status: "ok"});
        expect(selectedBet).toBe(5);
        expect(selectedMode).toBe("ante");
    });

    it("keeps the settled win when a serializer's round payload carries a stale win", async () => {
        const service = new StudioPlayService(fakeLoadGameWithStaleSerializedWin());
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        const result = await service.spin(created.session.sessionId);

        expect(result).toMatchObject({status: "ok"});
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.win).toBe(7);
    });

    it("reports an honest artifactUnavailableReason instead of a fabricated artifact for a non-video-slot game", async () => {
        const service = new StudioPlayService(() => Promise.resolve(createFakeNonVideoSlotGame()));
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        const result = await service.spin(created.session.sessionId);

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.debug?.artifact).toBeUndefined();
        expect(result.session.debug?.artifactUnavailableReason).toEqual(expect.any(String));
    });

    it("reports 'not-found' spinning a sessionId from before the most recent newSession() call", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const first = await service.newSession("/fake/project");
        if (first.status !== "ok") {
            throw new Error("expected ok");
        }

        await service.newSession("/fake/project");
        const result = await service.spin(first.session.sessionId);

        expect(result).toEqual({status: "not-found"});
    });

    it("reports 'not-found' spinning before any session was ever created", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());

        const result = await service.spin("unknown-session-id");

        expect(result).toEqual({status: "not-found"});
    });

    it("reports 'not-found' spinning after reset()", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        service.reset();
        const result = await service.spin(created.session.sessionId);

        expect(result).toEqual({status: "not-found"});
    });

    it("does not install a session when reset cancels a pending runtime preparation", async () => {
        let resolveRuntime: ((value: {runtimePath: string; release(): Promise<void>}) => void) | undefined;
        const release = jest.fn(() => Promise.resolve());
        const service = new StudioPlayService(
            fakeLoadVideoSlotGame(),
            () => new Promise((resolve) => {
                resolveRuntime = resolve;
            }),
            "unknown",
            {resolve: () => Promise.resolve(undefined)},
        );

        const pending = service.newSession("/old-project");
        await new Promise<void>((resolve) => {
            setImmediate(() => resolve());
        });
        service.reset();
        resolveRuntime?.({runtimePath: "/runtime", release});

        await expect(pending).resolves.toEqual({status: "failed", error: "Runtime preparation was cancelled before a runnable game was available."});
        expect(release).toHaveBeenCalledTimes(1);
        await expect(service.spin("old-session")).resolves.toEqual({status: "not-found"});
    });

    it("releases a real CJS runtime snapshot when abort wins immediately after loading", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-play-abort-"));
        const packageRoot = path.join(workDir, "game");
        const packageName = `studio-play-abort-${crypto.randomUUID()}`;
        fs.cpSync(path.join(__dirname, "..", "..", "fixtures", "playable-game"), packageRoot, {
            recursive: true,
            filter: (source) => path.basename(source) !== ".pokie-runtime-cache",
        });
        fs.writeFileSync(
            path.join(packageRoot, "package.json"),
            JSON.stringify({name: packageName, version: "1.0.0", pokie: {entry: "./index.js"}}),
        );
        const controller = new AbortController();
        const service = new StudioPlayService(async (root) => {
            const game = await loadPokieGame(root);
            controller.abort();
            return game;
        });

        try {
            expect(runtimeSnapshotsForPackage(packageName)).toEqual([]);
            await expect(service.newSession(packageRoot, undefined, undefined, {signal: controller.signal})).resolves.toEqual({
                status: "failed",
                error: "Runtime preparation was cancelled before a runnable game was available.",
            });
            expect(runtimeSnapshotsForPackage(packageName)).toEqual([]);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("crosses the shared runtime-package-materialization boundary exactly once per newSession(), loading only the resolved runtime path", async () => {
        const rawProjectRoot = "/blueprints/raw-game.json";
        const resolvedRuntimePath = "/materialized/raw-game";
        const resolveCalls: string[] = [];
        const resolveRuntimePackageRoot = (packageRoot: string) => {
            resolveCalls.push(packageRoot);
            return Promise.resolve({runtimePath: resolvedRuntimePath, release: () => Promise.resolve()});
        };
        const loadCalls: string[] = [];
        const loadGame = (packageRoot: string) => {
            loadCalls.push(packageRoot);
            return Promise.resolve(createFakeVideoSlotGame());
        };
        const service = new StudioPlayService(loadGame, resolveRuntimePackageRoot);

        const result = await service.newSession(rawProjectRoot);

        expect(result.status).toBe("ok");
        expect(resolveCalls).toEqual([rawProjectRoot]);
        expect(loadCalls).toEqual([resolvedRuntimePath]);
    });

    it("reports a safe 'failed' result, without ever loading the game, when the runtime package cannot be materialized", async () => {
        const resolveRuntimePackageRoot = () => Promise.reject(new Error("dependencies phase failed"));
        const loadGame = jest.fn(() => Promise.resolve(createFakeVideoSlotGame()));
        const service = new StudioPlayService(loadGame, resolveRuntimePackageRoot);

        const result = await service.newSession("/fake/project");

        expect(result).toEqual({status: "failed", error: "dependencies phase failed"});
        expect(loadGame).not.toHaveBeenCalled();
    });

    it("returns the shared PAR recognition/import diagnostic for corrupt and incomplete workbooks without creating a Play session", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-play-malformed-par-"));
        const corrupt = path.join(workDir, "corrupt.xlsx");
        const incomplete = path.join(workDir, "incomplete.xlsx");
        fs.writeFileSync(corrupt, "not an XLSX");
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet("Manifest");
        await workbook.xlsx.writeFile(incomplete);
        const loadGame = jest.fn(() => Promise.resolve(createFakeVideoSlotGame()));
        const service = new StudioPlayService(loadGame, createMaterializingRuntimePackageResolver("1.3.0", STUDIO_OPERATION));

        try {
            for (const workbookPath of [corrupt, incomplete]) {
                await expect(service.newSession(workbookPath)).resolves.toEqual({
                    status: "failed",
                    error: expect.stringMatching(/Cannot prepare a runnable runtime.*PAR workbook recognition.*failed PAR recognition\/import stage.*Next:/),
                });
            }
            expect(loadGame).not.toHaveBeenCalled();
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("replaces whatever session was active on every newSession() call, discarding the previous one", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const first = await service.newSession("/fake/project");
        const second = await service.newSession("/fake/project");
        if (first.status !== "ok" || second.status !== "ok") {
            throw new Error("expected ok");
        }

        expect(first.session.sessionId).not.toEqual(second.session.sessionId);
        expect((await service.spin(second.session.sessionId)).status).toBe("ok");
        expect(await service.spin(first.session.sessionId)).toEqual({status: "not-found"});
    });

    describe("a resolved native outcome-library project", () => {
        let bundleRoot: string;

        beforeEach(() => {
            bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-play-outcome-library-test-"));
        });

        afterEach(() => {
            fs.rmSync(bundleRoot, {recursive: true, force: true});
        });

        async function buildLibraryBundle(): Promise<string> {
            const bundleDir = path.join(bundleRoot, "library");
            await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
            return bundleDir;
        }

        it("plays a real draw through the bundle's own OutcomeLibraryBundleOutcomeSource adapter, never loadPokieGame", async () => {
            const bundleDir = await buildLibraryBundle();
            const loadGame = jest.fn(() => Promise.resolve(createFakeVideoSlotGame()));
            const service = new StudioPlayService(loadGame);

            const created = await service.newSession(bundleDir, "studio-play-seed");
            expect(created.status).toBe("ok");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(created.session.game).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
            expect(created.session.win).toBeUndefined();
            expect(created.session.screen).toBeUndefined();

            const spun = await service.spin(created.session.sessionId);
            expect(spun.status).toBe("ok");
            if (spun.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(typeof spun.session.win).toBe("number");
            expect(typeof spun.session.bet).toBe("number");
            expect(spun.session.screen).toBeDefined();
            expect(spun.session.debug?.artifact).toBeDefined();
            expect(spun.session.debug?.artifactUnavailableReason).toBeUndefined();
            // Studio's own running ledger starts at 0 for a bundle-backed session (there is no real
            // starting balance to report -- see buildOutcomeSourceSessionView's own doc comment), so after
            // exactly one draw it's simply that draw's own real win minus its own real stake.
            expect(spun.session.credits).toBe((spun.session.win as number) - (spun.session.bet as number));

            expect(loadGame).not.toHaveBeenCalled();
        });

        it.each(["", "   "])("rejects a blank seed before creating an exactly replayable outcome-library Play session (%p)", async (seed) => {
            const bundleDir = await buildLibraryBundle();
            const service = new StudioPlayService();

            await expect(service.newSession(bundleDir, seed)).resolves.toEqual({
                status: "failed",
                error: expect.stringMatching(/seed.*non-empty.*best-effort/i),
            });
        });

        it("draws the same real outcome every time for a given seed, the same reproducibility a live game's own seed promises", async () => {
            const bundleDir = await buildLibraryBundle();
            const first = new StudioPlayService();
            const second = new StudioPlayService();

            const firstCreated = await first.newSession(bundleDir, "reproducible-seed");
            const secondCreated = await second.newSession(bundleDir, "reproducible-seed");
            if (firstCreated.status !== "ok" || secondCreated.status !== "ok") {
                throw new Error("expected ok");
            }

            const firstSpin = await first.spin(firstCreated.session.sessionId);
            const secondSpin = await second.spin(secondCreated.session.sessionId);
            if (firstSpin.status !== "ok" || secondSpin.status !== "ok") {
                throw new Error("expected ok");
            }

            expect(firstSpin.session.debug?.artifact).toEqual(secondSpin.session.debug?.artifact);
        });

        async function buildMultiModeLibraryBundle(): Promise<string> {
            const bundleDir = path.join(bundleRoot, "multi-mode-library");
            await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(
                [buildOutcomeLibraryBundleModeInput("base", "base-lib"), buildOutcomeLibraryBundleModeInput("buyFeature", "buy-lib")],
                bundleDir,
            );
            return bundleDir;
        }

        describe("a multi-mode outcome-library project", () => {
            it("plays the manifest's own first mode when no mode is explicitly requested, preserving pre-existing behavior", async () => {
                const bundleDir = await buildMultiModeLibraryBundle();
                const service = new StudioPlayService();

                const created = await service.newSession(bundleDir, "multi-mode-default-seed");
                if (created.status !== "ok") {
                    throw new Error("expected ok");
                }
                const spun = await service.spin(created.session.sessionId);
                if (spun.status !== "ok") {
                    throw new Error("expected ok");
                }
                expect((spun.session.debug?.artifact as {roundId?: string} | undefined)?.roundId).toMatch(/^base-lib-/);
                expect(spun.session.studioModeName).toBe("base");
            });

            it("plays an explicitly-requested non-first mode -- never silently substitutes the manifest's own first mode", async () => {
                const bundleDir = await buildMultiModeLibraryBundle();
                const service = new StudioPlayService();

                const created = await service.newSession(bundleDir, "multi-mode-explicit-seed", "buyFeature");
                if (created.status !== "ok") {
                    throw new Error("expected ok");
                }
                const spun = await service.spin(created.session.sessionId);
                if (spun.status !== "ok") {
                    throw new Error("expected ok");
                }
                expect((spun.session.debug?.artifact as {roundId?: string} | undefined)?.roundId).toMatch(/^buy-lib-/);
                expect(spun.session.studioModeName).toBe("buyFeature");
                expect(spun.session.replay).toEqual(expect.objectContaining({
                    libraryId: "buy-lib",
                    modeName: "buyFeature",
                    seed: "multi-mode-explicit-seed",
                    round: 1,
                    selectionAlgorithm: "derived-round-seed-v1",
                }));
            });

            it("fails honestly, naming every real mode, for a mode name that isn't part of this library -- never falls back to the first mode", async () => {
                const bundleDir = await buildMultiModeLibraryBundle();
                const service = new StudioPlayService();

                const result = await service.newSession(bundleDir, undefined, "bonus");
                expect(result.status).toBe("failed");
                if (result.status !== "failed") {
                    throw new Error("expected failed");
                }
                expect(result.error).toContain('"bonus" is not a mode of this outcome library');
                expect(result.error).toContain("base");
                expect(result.error).toContain("buyFeature");
            });

            it("stamps the shared StudioRoundRecorder's own provenance with the real mode a round was drawn against", async () => {
                const bundleDir = await buildMultiModeLibraryBundle();
                const roundRecorder = new StudioRoundRecorder();
                const service = new StudioPlayService(undefined, undefined, undefined, undefined, undefined, undefined, roundRecorder);

                const created = await service.newSession(bundleDir, "multi-mode-provenance-seed", "buyFeature");
                if (created.status !== "ok") {
                    throw new Error("expected ok");
                }
                await service.spin(created.session.sessionId);

                const recorded = roundRecorder.list();
                expect(recorded).toHaveLength(1);
                expect(recorded[0].studioModeName).toBe("buyFeature");
                expect(recorded[0].replay).toEqual(expect.objectContaining({modeName: "buyFeature", round: 1}));
            });
        });
    });

    it("explains that a resolved Stake Engine export cannot be sampled and recommends an Outcome Library, never attempting to load it as a package", async () => {
        const stakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-play-stake-adapter-test-"));
        try {
            const stakeDir = path.join(stakeRoot, "stake-export");
            const modes: StakeEngineExportModeInput[] = [
                {modeName: "base", cost: 1, library: buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1})},
            ];
            await new StakeEngineExporter("1.3.0").exportToDirectory(modes, stakeDir);
            const loadGame = jest.fn(() => Promise.resolve(createFakeVideoSlotGame()));
            const service = new StudioPlayService(loadGame);

            const result = await service.newSession(stakeDir);

            expect(result.status).toBe("failed");
            if (result.status !== "failed") {
                throw new Error("expected failed");
            }
            expect(result.error).toContain("Stake Engine export");
            expect(result.error).toContain("cannot sample an outcome");
            expect(result.error).toContain("Outcome Library");
            expect(loadGame).not.toHaveBeenCalled();
        } finally {
            fs.rmSync(stakeRoot, {recursive: true, force: true});
        }
    });

    describe("findAnyWin / findSymbolWin / findFreeGames", () => {
        it("findAnyWin returns the very first round when it already wins, driving the engine's own PlayUntilAnyWinStrategy against the live session", async () => {
            const {session} = createControllableVideoSlotSession(() => "A");
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, ...fixtureCommandAuthority, createSession: () => session}));
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findAnyWin(created.session.sessionId);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.session.win).toBeGreaterThan(0);
        });

        it("findAnyWin repeats real, authoritative spins -- never a client-side calculation -- until one actually wins", async () => {
            const {session, getAttempts} = createControllableVideoSlotSession((attempt) => (attempt >= 4 ? "A" : undefined));
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, ...fixtureCommandAuthority, createSession: () => session}));
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findAnyWin(created.session.sessionId);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.session.win).toBeGreaterThan(0);
            // Proves the search actually played 4 real, settled rounds to get there, not a single check --
            // each of the first 3 genuinely lost (see winningSymbolAtAttempt above).
            expect(getAttempts()).toBe(4);
        });

        it("retains the matching settled round when progress cancels before publishing scenario success", async () => {
            const {session, getAttempts} = createControllableVideoSlotSession(() => "A");
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, ...fixtureCommandAuthority, createSession: () => session}));
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") throw new Error("expected ok");
            const controller = new AbortController();
            expect(await service.findAnyWin(created.session.sessionId, {signal: controller.signal, onProgress: () => controller.abort()})).toMatchObject({status: "cancelled", session: {sessionId: created.session.sessionId, win: expect.any(Number)}});
            expect(getAttempts()).toBe(1);
            service.reset();
        });

        it("does not publish a matching scenario result after progress supersedes its session", async () => {
            const {session, getAttempts} = createControllableVideoSlotSession(() => "A");
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, ...fixtureCommandAuthority, createSession: () => session}));
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") throw new Error("expected ok");
            expect(await service.findAnyWin(created.session.sessionId, {onProgress: () => service.reset()})).toEqual({status: "not-found"});
            expect(getAttempts()).toBe(1);
        });

        it("reports every settled search attempt through the optional durable-progress hook", async () => {
            const {session} = createControllableVideoSlotSession((attempt) => (attempt >= 3 ? "A" : undefined));
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, ...fixtureCommandAuthority, createSession: () => session}), undefined, "unknown", undefined, undefined, 5);
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") throw new Error("expected ok");
            const progress = jest.fn();

            await expect(service.findAnyWin(created.session.sessionId, {onProgress: progress})).resolves.toMatchObject({status: "ok"});

            expect(progress.mock.calls).toEqual([[1, 5], [2, 5], [3, 5]]);
        });

        it("findSymbolWin propagates the chooser's own selected symbol into the search -- a round winning a different symbol never matches", async () => {
            const {session} = createControllableVideoSlotSession(() => "A");
            // maxFindScenarioSpins is overridden to a small bound (the 6th constructor argument) so this
            // exercises the real "search exhausted" path without waiting out thousands of real spins.
            const service = new StudioPlayService(
                () => Promise.resolve({getManifest: () => manifest, ...fixtureCommandAuthority, createSession: () => session}),
                undefined,
                undefined,
                undefined,
                undefined,
                5,
            );
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const matchingSymbol = await service.findSymbolWin(created.session.sessionId, "A");
            expect(matchingSymbol.status).toBe("ok");

            const created2 = await service.newSession("/fake/project");
            if (created2.status !== "ok") {
                throw new Error("expected ok");
            }
            const differentSymbol = await service.findSymbolWin(created2.session.sessionId, "Q");
            expect(differentSymbol).toEqual({status: "error", error: "No matching round was found within 5 spins."});
        });

        it("findSymbolWin stops on the first real spin that actually wins the requested symbol, not just any win", async () => {
            const {session, getAttempts} = createControllableVideoSlotSession((attempt) => (attempt >= 3 ? "K" : undefined));
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, ...fixtureCommandAuthority, createSession: () => session}));
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findSymbolWin(created.session.sessionId, "K");

            expect(result.status).toBe("ok");
            expect(getAttempts()).toBe(3);
        });

        it("findSymbolWin reports an honest 'error' for a non-video-slot game, never throwing, and never burning a spin first", async () => {
            const loadGame = jest.fn(() => Promise.resolve(createFakeNonVideoSlotGame()));
            const service = new StudioPlayService(loadGame);
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findSymbolWin(created.session.sessionId, "A");

            expect(result).toEqual({status: "error", error: "This game doesn't report per-symbol win details, so Find symbol win isn't available for it."});

            // Proves it never burned a real spin trying: the session's credits are exactly what a plain
            // spin() from this same starting point produces, not one round further along.
            const spun = await service.spin(created.session.sessionId);
            if (spun.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(spun.session.credits).toBe(999);
        });

        it("findAnyWin reports 'not-found' against a sessionId from before the most recent newSession() call", async () => {
            const service = new StudioPlayService(fakeLoadVideoSlotGame());
            const first = await service.newSession("/fake/project");
            if (first.status !== "ok") {
                throw new Error("expected ok");
            }

            await service.newSession("/fake/project");
            const result = await service.findAnyWin(first.session.sessionId);

            expect(result).toEqual({status: "not-found"});
        });

        it("findFreeGames returns the very first round when it already triggers free games, driving the engine's own PlayFreeGamesStrategy against the live session", async () => {
            const {session} = createControllableFreeGamesSession(() => 3);
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, ...fixtureCommandAuthority, createSession: () => session}));
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findFreeGames(created.session.sessionId);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.session.debug?.artifact?.featureEvents).toEqual([{type: "freeGamesTriggered", data: {count: 3}}]);
        });

        it("findFreeGames repeats real, authoritative spins -- never a client-side calculation -- until one actually triggers free games", async () => {
            const {session, getAttempts} = createControllableFreeGamesSession((attempt) => (attempt >= 4 ? 3 : 0));
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, ...fixtureCommandAuthority, createSession: () => session}));
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findFreeGames(created.session.sessionId);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.session.debug?.artifact?.featureEvents?.some((event) => event.type === "freeGamesTriggered")).toBe(true);
            // Proves the search actually played 4 real, settled rounds to get there, not a single check --
            // each of the first 3 genuinely didn't trigger free games (see wonFreeGamesAtAttempt above).
            expect(getAttempts()).toBe(4);
        });

        it("findFreeGames completes against a real configured 5x3 Blueprint with literal scatter reels", async () => {
            const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-play-free-games-"));
            try {
                const blueprint: GameBlueprint = {
                    manifest: {id: "literal-free-games", name: "Literal Free Games", version: "0.1.0"},
                    reels: 5,
                    rows: 3,
                    symbols: ["A", "K"],
                    scatters: ["K"],
                    availableBets: [1],
                    paytable: {A: {3: 5}, K: {3: 2}},
                    // Each of the first three reels contributes exactly one K to the 3-row window,
                    // so the configured 3x award is deterministic while still exercising literal
                    // 5x3 strips rather than a hand-shaped session fake.
                    reelStrips: [
                        ["K", "A", "A"],
                        ["K", "A", "A"],
                        ["K", "A", "A"],
                        ["A", "A", "A"],
                        ["A", "A", "A"],
                    ],
                    mechanics: {freeGames: {scatterSymbol: "K", awardsByCount: {3: 10}}},
                };
                const generated = new GamePackageGenerator("1.3.0").generate(blueprint, packageRoot);
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const game = require(path.join(generated.projectRoot, "dist", "index.js")) as PokieGame;
                const service = new StudioPlayService(() => Promise.resolve(game));
                const created = await service.newSession(generated.projectRoot);
                if (created.status !== "ok") {
                    throw new Error("expected ok");
                }

                const result = await service.findFreeGames(created.session.sessionId);

                expect(result.status).toBe("ok");
                if (result.status !== "ok") {
                    throw new Error("expected ok");
                }
                expect(result.session.debug?.artifact?.featureEvents).toEqual([{type: "freeGamesTriggered", data: {count: 10}}]);
            } finally {
                fs.rmSync(packageRoot, {recursive: true, force: true});
            }
        });

        it("findFreeGames reports an honest 'error' for a game that doesn't support free games, never throwing, and never burning a spin first", async () => {
            const loadGame = jest.fn(() => Promise.resolve(createFakeVideoSlotGame()));
            const service = new StudioPlayService(loadGame);
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findFreeGames(created.session.sessionId);

            expect(result).toEqual({status: "error", error: "This game doesn't support free games, so Find free games isn't available for it."});

            // Proves it never burned a real spin trying: the session's credits are exactly what a plain
            // spin() from this same starting point produces, not one round further along.
            const spun = await service.spin(created.session.sessionId);
            if (spun.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(spun.session.credits).toBe(995);
        });

        describe("against a resolved native outcome-library project (no live GameSessionHandling)", () => {
            let bundleRoot: string;

            beforeEach(() => {
                bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-play-find-scenario-test-"));
            });

            afterEach(() => {
                fs.rmSync(bundleRoot, {recursive: true, force: true});
            });

            async function buildLibraryBundle(): Promise<string> {
                const bundleDir = path.join(bundleRoot, "library");
                await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
                return bundleDir;
            }

            it("finds a real winning draw by reading the already-drawn artifact's own totalWin, never a live session/strategy object", async () => {
                const bundleDir = await buildLibraryBundle();
                const service = new StudioPlayService();
                const created = await service.newSession(bundleDir, "studio-play-find-seed");
                if (created.status !== "ok") {
                    throw new Error("expected ok");
                }

                const result = await service.findAnyWin(created.session.sessionId);

                expect(result.status).toBe("ok");
                if (result.status !== "ok") {
                    throw new Error("expected ok");
                }
                expect(result.session.win).toBeGreaterThan(0);
                expect(result.session.debug?.artifact?.totalWin).toBeGreaterThan(0);
            });

            it("reaches the identical winning round for the same seed -- deterministic search, same reproducibility a single seeded draw promises", async () => {
                const bundleDir = await buildLibraryBundle();
                const first = new StudioPlayService();
                const second = new StudioPlayService();

                const firstCreated = await first.newSession(bundleDir, "reproducible-find-seed");
                const secondCreated = await second.newSession(bundleDir, "reproducible-find-seed");
                if (firstCreated.status !== "ok" || secondCreated.status !== "ok") {
                    throw new Error("expected ok");
                }

                const firstFound = await first.findAnyWin(firstCreated.session.sessionId);
                const secondFound = await second.findAnyWin(secondCreated.session.sessionId);
                if (firstFound.status !== "ok" || secondFound.status !== "ok") {
                    throw new Error("expected ok");
                }

                expect(firstFound.session.debug?.artifact).toEqual(secondFound.session.debug?.artifact);
            });

            it("findSymbolWin against a symbol that never wins in the bundle reports an honest 'error' once the bound is exhausted, never hanging", async () => {
                const bundleDir = await buildLibraryBundle();
                // maxFindScenarioSpins overridden to a small bound (6th constructor argument) -- the
                // bundle's own winning outcomes all carry symbolId "A" (see OutcomeLibraryBundleTestFixtures),
                // so "no-such-symbol" can never match.
                const service = new StudioPlayService(undefined, undefined, undefined, undefined, undefined, 5);
                const created = await service.newSession(bundleDir, "studio-play-find-seed");
                if (created.status !== "ok") {
                    throw new Error("expected ok");
                }

                const result = await service.findSymbolWin(created.session.sessionId, "no-such-symbol");

                expect(result).toEqual({status: "error", error: "No matching round was found within 5 spins."});
            });

            it("findFreeGames finds a real drawn round by reading the already-drawn artifact's own featureEvents, never a live session/strategy object", async () => {
                const bundleDir = path.join(bundleRoot, "free-games-library");
                await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildFreeGamesLibraryModeInput("base", "fg-lib")], bundleDir);
                const service = new StudioPlayService();
                const created = await service.newSession(bundleDir, "studio-play-find-free-games-seed");
                if (created.status !== "ok") {
                    throw new Error("expected ok");
                }

                const result = await service.findFreeGames(created.session.sessionId);

                expect(result.status).toBe("ok");
                if (result.status !== "ok") {
                    throw new Error("expected ok");
                }
                expect(result.session.debug?.artifact?.featureEvents?.some((event) => event.type === "freeGamesTriggered")).toBe(true);
            });

            it("findFreeGames against a bundle whose outcomes never trigger free games reports an honest 'error' once the bound is exhausted, never hanging", async () => {
                const bundleDir = await buildLibraryBundle();
                // maxFindScenarioSpins overridden to a small bound (6th constructor argument) -- this
                // bundle's own outcomes (see OutcomeLibraryBundleTestFixtures) never carry a
                // "freeGamesTriggered" feature event, so a search against it can never match.
                const service = new StudioPlayService(undefined, undefined, undefined, undefined, undefined, 5);
                const created = await service.newSession(bundleDir, "studio-play-find-seed");
                if (created.status !== "ok") {
                    throw new Error("expected ok");
                }

                const result = await service.findFreeGames(created.session.sessionId);

                expect(result).toEqual({status: "error", error: "No matching round was found within 5 spins."});
            });
        });
    });
});

describe("StudioPlayService canonical error propagation", () => {
    it("preserves an incompatible-game distinction before playing or recording a replacement round", async () => {
        let version = "1";
        const session = createFakeVideoSlotSession(undefined);
        const play = jest.spyOn(session, "play");
        const game: PokieGame = {getManifest: () => ({...manifest, version}), ...fixtureCommandAuthority, createSession: () => session};
        const service = new StudioPlayService(() => Promise.resolve(game));
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") throw new Error("Could not create fixture session");
        version = "2";
        expect(await service.spin(created.session.sessionId)).toMatchObject({status: "error", code: "incompatible-state"});
        expect(play).not.toHaveBeenCalled();
        service.reset();
    });
});


describe("Overscan Studio Play", () => {
    it("preserves partial viewport coverage without a game serializer", async () => {
        const game = createOverscanGame({...overscanBlueprint, screenGeometry: {...overscanGeometry, visible: {rowOffset: 1.25, rows: 2.5}}});
        game.getSessionSerializer = undefined;
        const service = new StudioPlayService(() => Promise.resolve(game));
        try {
            const created = await service.newSession("/overscan", "7");
            if (created.status !== "ok") throw new Error(JSON.stringify(created));
            expect(created.session.screen?.[0]).toHaveLength(3);
            expect(created.session.visibleRowCoverage).toEqual([0.75, 1, 0.75]);
            const round = await service.spin(created.session.sessionId);
            if (round.status !== "ok") throw new Error(JSON.stringify(round));
            expect(round.session.visibleRowCoverage).toEqual([0.75, 1, 0.75]);
            expect(round.session.screen?.[0]).toHaveLength(3);
            expect(round.session).not.toHaveProperty("generatedScreen");
            expect(round.session).not.toHaveProperty("coordinates");
            expect(round.session.debug?.artifact?.generatedScreen?.[0]).toHaveLength(7);
        } finally {
            service.reset();
        }
    });
    it("matches seeded replay payout and retains the last settled viewport after search cancellation", async () => {
        const game = createOverscanGame();
        const release = jest.fn(() => Promise.resolve());
        const service = new StudioPlayService(() => Promise.resolve(game), () => Promise.resolve({runtimePath: "/overscan", release}), "1.3.0");
        try {
            const created = await service.newSession("/overscan", "7");
            if (created.status !== "ok") throw new Error(JSON.stringify(created));
            expect(created.session.screen?.[0]).toHaveLength(3);
            const controller = new AbortController();
            const result = await service.findAnyWin(created.session.sessionId, {signal: controller.signal, onProgress: () => controller.abort()});
            expect(result.status).toBe("cancelled");
            if (result.status !== "cancelled" || !result.session) throw new Error(JSON.stringify(result));
            const replay = new ReplayRecorder().record({game, seed: "7", round: 1});
            expect(result.session.win).toBe(replay.totalWin);
            expect(result.session.screen).toEqual(replay.screen);
            expect(result.session.debug?.artifact?.generatedScreen?.[0]).toHaveLength(7);
            expect(result.session.credits).toBe(created.session.credits! - created.session.bet! + replay.totalWin);
            expect(release).toHaveBeenCalledTimes(1);
        } finally {
            service.reset();
        }
    });
});

describe("Studio logical history retention", () => {
    it("evicts full views while compact historical identities still prevent duplicate records", () => {
        const recorder = new StudioRoundRecorder();
        const views = Array.from({length: 25}, (_, index) => ({sessionId: "session", game: manifest, credits: 100, bet: 1, screen: [[`screen-${index}`]], studioRequestId: `request-${index}`}));
        for (const view of views) recorder.record(view, {source: "play", operation: "spin"});
        expect(recorder.list()).toHaveLength(20);
        const identities = Reflect.get(recorder, "identities") as Map<string, Record<string, unknown>>;
        expect(identities.size).toBe(25);
        for (const identity of identities.values()) {
            expect(identity).not.toHaveProperty("screen");
            expect(identity).not.toHaveProperty("logicalRound");
            expect(identity).not.toHaveProperty("debug");
        }
        const historical = {...views[0]};
        recorder.record(historical, {source: "simulation-sample", operation: "simulation-sample"});
        expect(historical).toMatchObject({studioRound: 1, studioSource: "play"});
        expect(recorder.list()).toHaveLength(20);
        expect(recorder.list()[0]).toMatchObject({studioRound: 25});
        recorder.clearAll();
        expect(identities.size).toBe(0);
    });
});

it.each([
    {failure: "execution-error", audit: true}, {failure: "blocked", audit: true},
    {failure: "execution-error", audit: false}, {failure: "blocked", audit: false},
])("Studio retains committed-prefix evidence across $failure (audit=$audit)", async ({failure, audit}) => {
    let fail = true;
    let calculations = 0;
    const fixture = transactionalRoundGame(() => {
        calculations++;
        if (failure === "execution-error" && fail && calculations > 1) throw new Error("successor failed");
    });
    const model: PokieGame = {...fixture, ...(audit ? {getConfigHash: () => "prefix-audit-model"} : {}),
        createSession: context => {
            const session = fixture.createSession(context);
            const canPlay = session.canPlayNextGame.bind(session);
            session.canPlayNextGame = () => !(failure === "blocked" && fail && calculations >= 1) && canPlay();
            return session;
        }};
    const recorder = new StudioRoundRecorder();
    const service = new StudioPlayService(() => Promise.resolve(model), undefined, undefined, undefined, undefined, undefined, recorder);
    const execute = jest.spyOn(SpinCommandHandler.prototype, "execute");
    const writes = [jest.spyOn(InMemoryWallet.prototype, "debit"), jest.spyOn(InMemoryWallet.prototype, "credit"), jest.spyOn(InMemoryWallet.prototype, "reverse"),
        jest.spyOn(InMemorySessionRepository.prototype, "saveVersioned")];
    try {
        const created = await service.newSession("/logical", "1");
        if (created.status !== "ok") throw new Error("No Play session");
        const intent = {requestId: "entry", roundId: "round", delivery: "composite" as const};
        const failed = await service.spin(created.session.sessionId, "spin", undefined, undefined, intent);
        expect(failed).toMatchObject({status: failure === "blocked" ? "blocked" : "error", code: failure,
            committedProgress: {roundId: "round", cursor: 1, requestId: "entry", nextRequestId: "entry:subround:1"}, session: {logicalRound: {cursor: 1, status: "pending"}}});
        if (failed.status !== "error" && failed.status !== "blocked") throw new Error("No committed prefix");
        const retained = (await execute.mock.results[0].value).committedResult!;
        expect(recorder.list()).toEqual([failed.session]);
        const recording = failed.session?.debug?.recording;
        if (audit) {
            expect(recording?.audit).toEqual(retained.audit);
            expect(recording).toMatchObject({auditCompletion: "pending", sessionId: created.session.sessionId,
                audit: {deliveries: [{disposition: {requestId: "entry", status: "committed", version: retained.version}}]}});
            expect(recording!.audit!.deliveries).toHaveLength(1);
            const exported = JSON.parse(buildReplayDownload(recording!, "prefix").body);
            const imported = validateReplayRequest({recording: exported}).recording!;
            expect(imported).toEqual(recording);
            const beforeWrites = writes.map(write => write.mock.calls.length);
            const replayGame = {...transactionalRoundGame(), getConfigHash: model.getConfigHash};
            expect(new ReplayRecorder().replay(replayGame, imported.audit)).toMatchObject({auditStatus: "verified", auditCompletion: "pending", audit: retained.audit});
            expect(writes.map(write => write.mock.calls.length)).toEqual(beforeWrites);
            expect(recorder.list()).toEqual([failed.session]);
        } else {
            expect(recording).toBeUndefined();
            expect(failed.session?.debug?.auditUnavailableReason).toBe(retained.auditUnavailableReason);
            expect(retained.auditUnavailableReason).toContain("Exact audit requires");
        }
        const repeated = await service.spin(created.session.sessionId, "spin", undefined, undefined, intent);
        expect(repeated).toMatchObject({code: failure, session: {debug: failed.session!.debug}});
        expect(recorder.list()).toEqual([failed.session]);
        fail = false;
        const completed = await service.spin(created.session.sessionId, "spin", undefined, undefined, intent);
        expect(completed).toMatchObject({status: "ok", session: {logicalRound: {status: "completed", cursor: 3, totalStake: 0.05}}});
        expect(recorder.list()).toHaveLength(1);
        const completedView = recorder.list()[0];
        if (audit) {
            expect(completedView.debug!.recording!.audit!.deliveries[0]).toEqual(recording!.audit!.deliveries[0]);
            expect(completedView.debug!.recording!.audit!.deliveries.map(delivery => delivery.disposition.requestId)).toEqual(["entry", "entry:subround:1", "entry:subround:2"]);
        }
        await service.spin(created.session.sessionId, "spin", undefined, undefined, {requestId: "later", roundId: "later", delivery: "composite"});
        const beforeRetry = calculations;
        const history = recorder.list();
        const writeCounts = writes.map(write => write.mock.calls.length);
        const historical = await service.spin(created.session.sessionId, "spin", undefined, undefined, intent);
        expect(historical).toMatchObject({status: "ok", session: {debug: completedView.debug}});
        expect(calculations).toBe(beforeRetry);
        expect(writes.map(write => write.mock.calls.length)).toEqual(writeCounts);
        expect(recorder.list()).toEqual(history);
        expect(recorder.list()).toHaveLength(2);
    } finally {
        await service.reset();
        execute.mockRestore();
        writes.forEach(write => write.mockRestore());
    }
});
