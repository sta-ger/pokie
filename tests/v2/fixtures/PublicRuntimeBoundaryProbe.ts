import assert from "node:assert/strict";
import type * as PublicApi from "@fromstan/pokie";
import type {PokieGame, PokieSessionState, SpinCommandResult, VideoSlotSessionHandling} from "@fromstan/pokie";
import type {legacyComposedGame} from "./LegacyComposedGame.js";

type Api = typeof PublicApi;

/** Runs under native Node with import/require package resolution, not Jest's source mapper. */
export async function probe(host: Api, guest: Api, legacyGame: typeof legacyComposedGame): Promise<void> {
    assert.notEqual(host.VideoSlotSession, guest.VideoSlotSession);
    assert.notEqual(host.AbstractVideoSlotSessionDecorator, guest.AbstractVideoSlotSessionDecorator);
    for (const composition of ["free-games", "bet-modes", "bet-free", "free-bet"] as const) {
        for (const opaque of [false, true]) await playLive(host, legacyGame(composition, opaque));
    }
    await playLive(host, {getManifest: () => ({id: "default-free", name: "Default", version: "1"}), createSession: () => new guest.VideoSlotWithFreeGamesSession()});
    const opaqueGame: PokieGame = {
        getManifest: () => ({id: "opaque-rng", name: "Opaque RNG", version: "1"}),
        createSession: () => {
            let draws = 0;
            const config = new guest.VideoSlotConfig();
            const rng = {getRandomInt: (min: number) => {
                draws++;
                return min;
            }, toSessionState: () => ({draws})};
            return new guest.VideoSlotSession(config, new guest.SymbolsCombinationsGenerator(config, rng));
        },
    };
    await playLive(host, opaqueGame);
    // Complete children must keep their own strict RNG codec under live-only parents.
    for (const location of ["current", "cached-state", "cached-previous", "captured-state", "captured-previous"] as const) {
        for (const corruption of ["mode", "restriction", "rng"] as const) {
            for (const declared of [false, true]) {
                const game = modeGame(guest, declared);
                await rejects(host, guest, game, location, state => {
                    const feature = state.featureState as {base: {betModeId: string; base: {rngState: unknown}}};
                    if (corruption === "mode") feature.base.betModeId = "nonexistent";
                    if (corruption === "restriction") {
                        // A free-games outer node does not expose mode commands, so use the
                        // corresponding modes-outer game below for stored subset restrictions.
                        feature.base.betModeId = "ante";
                        state.commandCapabilities = {...state.commandCapabilities!, modes: ["base"]};
                    }
                    if (corruption === "rng") feature.base.base.rngState = {draws: 3};
                }, corruption === "restriction");
            }
        }
    }
}

function modeGame(api: Api, declared: boolean, modesOuter = false): PokieGame {
    const capabilities = {bets: [1], modes: ["base", "ante"]};
    const baseSchema = {kind: "seeded-video-slot" as const};
    const modeSchema = {kind: "bet-modes" as const, base: baseSchema};
    return {
        getManifest: () => ({id: "nested-modes", name: "Nested modes", version: "1"}),
        ...(declared ? {
            getSessionCommandCapabilities: () => capabilities,
            getSessionStateSchema: () => modesOuter ? modeSchema : {kind: "free-games" as const, base: modeSchema},
        } : {}),
        createSession: () => {
            const config = new api.VideoSlotConfig();
            config.setAvailableBets([1]);
            config.setBet(1);
            const base = new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(7)));
            const modes = new api.VideoSlotWithBetModesSession(base, new api.BetModesConfig([new api.BetModeDefinition("base"), new api.BetModeDefinition("ante")], "base"));
            return modesOuter ? modes : new api.VideoSlotWithFreeGamesSession(undefined, undefined, undefined, modes);
        },
    };
}

async function playLive(api: Api, game: PokieGame): Promise<void> {
    assert.deepEqual(Object.keys(game).sort(), ["createSession", "getManifest"]);
    const session = game.createSession();
    const repository = new api.InMemorySessionRepository(),
        wallet = new api.InMemoryWallet();
    const operations = new api.InMemorySpinOperationLog();
    const initial = api.captureInitialPokieSessionState(undefined, session, undefined, false, game);
    assert.equal(initial.executionState, "live-only");
    await repository.save("session", initial);
    await wallet.setBalance("session", initial.credits!);
    const handler = new api.SpinCommandHandler(game, repository, wallet, new api.InMemoryIdempotencyRepository(), operations, true);
    handler.primeSession("session", session, 1);
    assert.equal(handler.validateStoredSession("session", initial), undefined);
    for (const requestId of ["first", "second"]) {
        const result = await handler.execute({kind: "spin", sessionId: "session", requestId});
        assert.equal(result.status, "played");
        assert.deepEqual(await handler.execute({kind: "spin", sessionId: "session", requestId}), result);
    }
    const recovery = new api.SpinCommandHandler(game, repository, wallet, new api.InMemoryIdempotencyRepository(), operations, true);
    recovery.primeSession("session", session, (await repository.loadVersioned("session"))!.version);
    assert.equal((await recovery.reconcileOne("session", "second")).status, "resumed");
    const before = await repository.loadVersioned("session"),
        retained = await operations.load("session", "second");
    let constructions = 0;
    const freshGame = {...game, createSession: () => {
        constructions++;
        return game.createSession();
    }};
    const fresh = new api.SpinCommandHandler(freshGame, repository, wallet, new api.InMemoryIdempotencyRepository(), operations, true);
    assert.equal((await fresh.execute({kind: "spin", sessionId: "session"})).status, "restoration-unsupported");
    assert.equal((await fresh.reconcileOne("session", "second")).status, "manual-recovery-required");
    assert.equal(constructions, 0);
    assert.deepEqual(await repository.loadVersioned("session"), before);
    assert.deepEqual(await operations.load("session", "second"), retained);
}

async function rejects(api: Api, guest: Api, original: PokieGame, location: string, corrupt: (state: PokieSessionState) => void, restriction: boolean): Promise<void> {
    const game = restriction ? modeGame(guest, original.getSessionStateSchema !== undefined, true) : original;
    const session = game.createSession() as VideoSlotSessionHandling;
    const repository = new api.InMemorySessionRepository(),
        wallet = new api.InMemoryWallet();
    let idempotency = new api.InMemoryIdempotencyRepository<SpinCommandResult>();
    const operations = new api.InMemorySpinOperationLog();
    const initial = api.captureInitialPokieSessionState(undefined, session, undefined, false, game);
    await repository.save("session", initial);
    await wallet.setBalance("session", initial.credits!);
    const first = new api.SpinCommandHandler(game, repository, wallet, idempotency, operations, true);
    first.primeSession("session", session, 1);
    const result = await first.execute({kind: "spin", sessionId: "session", requestId: "retry"});
    assert.equal(result.status, "played");
    if (result.status !== "played") throw new Error("Initial execution failed");
    const change = (state: PokieSessionState): void => {
        if (restriction) {
            (state.featureState as {betModeId: string}).betModeId = "ante";
            state.commandCapabilities = {...state.commandCapabilities!, modes: ["base"]};
        } else corrupt(state);
    };
    if (location === "current") {
        change(result.state);
        await repository.save("session", result.state);
    } else if (location.startsWith("cached")) {
        change(location === "cached-state" ? result.state : result.previousState!);
        await idempotency.save("session", "retry", result);
    } else {
        const record = (await operations.load("session", "retry"))!;
        change(location === "captured-state" ? record.capturedResult!.newState : record.capturedResult!.previousState);
        await operations.record({...record, checkpoint: "settled", updatedAt: new Date(0).toISOString()});
        idempotency = new api.InMemoryIdempotencyRepository();
    }
    const handler = new api.SpinCommandHandler(game, repository, wallet, idempotency, operations, true);
    const before = (await repository.loadVersioned("session"))!;
    handler.primeSession("session", session, before.version);
    const retained = await operations.load("session", "retry"),
        cached = await idempotency.load("session", "retry"),
        balance = await wallet.getBalance("session");
    const executable = api.captureInitialPokieSessionState(undefined, session, undefined, false, game);
    let mutations = 0;
    const forbid = (): never => {
        mutations++;
        throw new Error("Rejected data mutated runtime or stores");
    };
    game.createSession = forbid;
    session.play = forbid;
    session.setBet = forbid;
    session.setCreditsAmount = forbid;
    repository.save = forbid;
    repository.saveVersioned = forbid;
    wallet.debit = forbid;
    wallet.credit = forbid;
    operations.record = forbid;
    operations.delete = forbid;
    idempotency.save = forbid;
    assert.equal((await handler.execute({kind: "spin", sessionId: "session", requestId: "retry"})).status, "corrupt-state", `${location} restriction=${restriction}`);
    assert.equal((await handler.reconcileOne("session", "retry")).status, "manual-recovery-required");
    assert.equal((await handler.getReconciliationService().reconcileOne("session", "retry")).status, "manual-recovery-required");
    assert.equal(mutations, 0);
    assert.deepEqual(await repository.loadVersioned("session"), before);
    assert.deepEqual(await operations.load("session", "retry"), retained);
    assert.deepEqual(await idempotency.load("session", "retry"), cached);
    assert.equal(await wallet.getBalance("session"), balance);
    assert.deepEqual(api.captureInitialPokieSessionState(undefined, session, undefined, false, game), executable);
}
