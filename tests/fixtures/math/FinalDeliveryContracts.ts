import assert from "node:assert/strict";
import type * as API from "@fromstan/pokie";

type Api = typeof API;
type MakeGame = (blueprint: API.GameBlueprint) => API.PokieGame;
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const finalStakes = [0.05, 7.5, 1e-7];

export function finalBlueprint(): API.GameBlueprint {
    return {manifest: {id: "final-contract", name: "Final contract", version: "1"}, reels: 3, rows: 1,
        symbols: ["A", "S"], wilds: [], scatters: ["S"], paylines: [[0, 0, 0]],
        reelStrips: [["A"], ["A"], ["A"]], availableBets: finalStakes, paytable: {A: {3: 2}, S: {3: 0}}};
}
function played(result: API.SessionCommandResult): Extract<API.SessionCommandResult, {status: "played"}> {
    if (result.status !== "played") throw new Error(result.reason);
    return result;
}
function amount(actual: number, expected: number): void {
    if (expected === 0) assert.equal(actual, 0);
    else {
        assert(actual > 0, "zero cannot satisfy a positive payout");
        assert(Math.abs(actual / expected - 1) <= 32 * Number.EPSILON, `${actual} != ${expected}`);
    }
}

/** Same assertions run as source regressions and by the normal installed smoke.
 * makeGame owns native generated-module resolution in the installed consumer.
 * These local case names deliberately do not invent the missing N/A ID register. */
export async function verifyFinalDelivery(api: Api, makeGame: MakeGame, database: string): Promise<string[]> {
    const completed: string[] = [];
    for (const stake of finalStakes) {
        for (const payout of [undefined, 0, 2]) {
            const model = finalBlueprint();
            model.paytable = payout === undefined ? {S: {3: 0}} : {A: {3: payout}};
            const game = makeGame(model), 
                session = game.createSession({seed: "0"});
            session.setCreditsAmount(1000);
            const result = played(new api.SessionRuntime(session).execute({kind: "spin", bet: stake, delivery: "composite", roundId: "money"}));
            amount(result.payout!, stake * (payout ?? 0));
            assert.equal(result.stake, stake);
            assert.equal(result.logicalRound?.totalPayout, result.payout);
            const artifact = api.buildRoundRecordFromSession(session as API.VideoSlotSessionHandling, {roundId: "money", origin: {game: model.manifest, pokieVersion: "2.0.0"}});
            amount(artifact.totalWin, stake * (payout ?? 0));
            assert.equal(artifact.stake, stake);
        }
    }
    completed.push("fractional-and-authoritative-payouts");

    // A scatter on every reel grants on entry and again during the free play.
    // This catches replacement instead of additive retriggering, independently of parity.
    for (const grant of [undefined, 0, 2]) {
        const model = finalBlueprint();
        model.reelStrips = [["S"], ["S"], ["S"]];
        model.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: grant === undefined ? {2: 0} : {3: grant}}};
        const node = makeGame(model).createSession({seed: "0"}) as API.VideoSlotWithFreeGamesSession;
        const artifact = await api.createBlueprintWasmArtifact(model);
        const runtime = await api.instantiatePokieWasm(artifact.bytes, artifact.manifest, new api.SeededPokieWasmHost("0"));
        try {
            const wasm = runtime.createSession("0");
            for (let index = 0; index < 2; index++) {
                node.setBet(0.05);
                const before = node.getCreditsAmount();
                node.play();
                const round = await wasm.play({bet: 0.05});
                const remaining = index === 0 ? 2 : 3;
                assert.equal(node.getFreeGamesSum() - node.getFreeGamesNum(), grant ? remaining : 0);
                assert.equal(node.getWinAmount(), 0);
                assert.equal(round.payout, 0);
                assert.equal(round.stake, grant && index === 1 ? 0 : 0.05);
                assert.equal(node.getCreditsAmount(), before - round.stake);
                assert.equal(round.credits, node.getCreditsAmount());
            }
        } finally {
            runtime.dispose(); 
        }
    }
    for (const bet of finalStakes) {
        const bankModel = finalBlueprint();
        bankModel.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {3: 0}}};
        bankModel.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 5, forcedFreeGames: 3}];
        const session = makeGame(bankModel).createSession({seed: "0"});
        const runtime = new api.SessionRuntime(session);
        try {
            let round = played(runtime.execute({kind: "spin", bet, mode: "buy", roundId: "bank", delivery: "stepwise"}));
            assert.equal(round.payout, 0);
            for (let index = 1; index < 3; index++) {
                round = played(runtime.execute({kind: "spin", delivery: "stepwise", continuation: {roundId: "bank", cursor: index}}));
                amount(round.payout!, index === 2 ? 6 * bet : 0);
            }
            amount(round.logicalRound!.totalWin, 6 * bet);
            amount(round.logicalRound!.totalPayout, 6 * bet);
        } finally {
            runtime.release(); 
        }
    }
    completed.push("missing-zero-and-additive-grants");

    const model = finalBlueprint();
    model.reelStrips = undefined;
    model.reelSequences = Array.from({length: 3}, () => ({type: "weighted" as const, variants: [
        {id: "a", symbols: ["A", "A"], weight: 1}, {id: "s", symbols: ["S", "S"], weight: 3}, {id: "zero", symbols: ["A", "S"], weight: 0},
    ]}));
    model.mechanics = {freeGames: {scatterSymbol: "S", awardsByCount: {3: 0}}};
    model.betModes = [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 5, forcedFreeGames: 3}];
    const game = makeGame(model);
    for (const bet of finalStakes) {
        const sessions = [game.createSession({seed: "0"}), game.createSession({seed: "0"})] as API.VideoSlotWithBetModesSession[];
        const runtimes = sessions.map(session => new api.SessionRuntime(session));
        try {
            for (const id of ["first", "later"]) {
                const entry: API.SessionCommand = {kind: "spin", mode: "buy", bet, roundId: id, delivery: "stepwise"};
                let step = played(runtimes[0].execute(entry));
                const complete = played(runtimes[1].execute({...entry, delivery: "composite"}));
                const selections = sessions[0].getSequenceSelections();
                assert.deepEqual(selections.map(s => s.reelIndex), [0, 1, 2]);
                assert(selections.every(s => s.variantId !== "zero" && s.context === `logical:${id}`));
                const restored = game.createSession({seed: "fresh"}) as API.VideoSlotWithBetModesSession;
                restored.fromSessionState(json(sessions[0].toSessionState()));
                restored.setCreditsAmount(sessions[0].getCreditsAmount());
                restored.setBet(bet);
                const resumed = new api.SessionRuntime(restored, json(step.logicalRound));
                try {
                    for (let index = 0; step.logicalRound?.status === "pending"; index++) {
                        assert(index < 3, "feature must terminate");
                        const command: API.SessionCommand = {kind: "spin", delivery: "stepwise", continuation: {roundId: id, cursor: step.logicalRound.deliveryCursor}};
                        step = played(runtimes[0].execute(command));
                        assert.deepEqual(resumed.execute(command), step);
                        assert.deepEqual(sessions[0].getSequenceSelections(), selections);
                    }
                    assert.deepEqual(restored.toSessionState(), sessions[0].toSessionState());
                } finally {
                    resumed.release(); 
                }
                assert.deepEqual(api.projectLogicalRound(step.logicalRound!), api.projectLogicalRound(complete.logicalRound!));
                assert.deepEqual(sessions[0].toSessionState(), sessions[1].toSessionState());
                amount(step.logicalRound!.totalStake, bet * 5);
                const visible = api.projectLogicalRound(step.logicalRound!);
                assert.equal(visible.totalPayout, complete.logicalRound!.totalPayout);
                assert.equal(visible.totalStake, complete.logicalRound!.totalStake);
                assert.equal(visible.subrounds.length, 3);
                const before = json(sessions[0].toSessionState());
                assert.deepEqual(runtimes[0].execute(entry).status, "played");
                assert.deepEqual(sessions[0].toSessionState(), before);
            }
        } finally {
            runtimes.forEach(runtime => runtime.release()); 
        }
    }
    completed.push("weighted-purchased-rounds-restore-and-projection");

    // Public SQLite boundary: discard the response, close storage, then retry
    // from a fresh handler/store. Durable result and balance must be identical.
    const storageGame = makeGame(finalBlueprint());
    let store = await api.SqliteTransactionalRoundStore.open(database);
    try {
        for (const [index, bet] of finalStakes.entries()) {
            const sessionId = `final-${index}`;
            const session = storageGame.createSession({seed: "0"});
            session.setCreditsAmount(100);
            await store.initialize(sessionId, api.captureInitialPokieSessionState({seed: "0"}, session, storageGame.getSessionSerializer?.(), false, storageGame), storageGame);
            const command = {kind: "spin" as const, sessionId, requestId: "lost-response", bet};
            const settled = await new api.SpinCommandHandler(storageGame, store).execute(command);
            assert.equal(settled.status, "played", JSON.stringify(settled));
            if (settled.status !== "played") throw new Error(JSON.stringify(settled));
            assert.equal(settled.audit!.deliveries[0].disposition.walletPayout, 2 * bet);
            assert.equal(new api.AuditRoundReplay().replay(storageGame, json(settled.audit!)).verification, "verified");
            const balance = await store.getBalance(sessionId), 
                state = await store.readSession(sessionId);
            assert.equal(balance, 100 - bet + 2 * bet);
            await store.close();
            store = await api.SqliteTransactionalRoundStore.open(database);
            assert.deepEqual(await new api.SpinCommandHandler(storageGame, store).execute(command), settled);
            assert.equal(await store.getBalance(sessionId), balance);
            assert.deepEqual(await store.readSession(sessionId), state);
            const abort = new AbortController();
            abort.abort();
            assert.notEqual((await new api.SpinCommandHandler(storageGame, store).execute({...command, requestId: "cancelled"}, abort.signal)).status, "played");
            assert.notEqual((await new api.SpinCommandHandler(storageGame, store).execute({...command, requestId: "invalid", bet: 99})).status, "played");
            const empty = storageGame.createSession({seed: "0"});
            empty.setCreditsAmount(0);
            const emptyId = `${sessionId}-empty`;
            await store.initialize(emptyId, api.captureInitialPokieSessionState({seed: "0"}, empty, storageGame.getSessionSerializer?.(), false, storageGame), storageGame);
            const emptyState = await store.readSession(emptyId);
            assert.notEqual((await new api.SpinCommandHandler(storageGame, store).execute({...command, sessionId: emptyId, requestId: "unfunded"})).status, "played");
            assert.equal(await store.getBalance(emptyId), 0);
            assert.deepEqual(await store.readSession(emptyId), emptyState);
            assert.equal(await store.getBalance(sessionId), balance);
            assert.deepEqual(await store.readSession(sessionId), state);
        }
    } finally {
        await store.close(); 
    }
    completed.push("durable-settlement-response-loss-restart-and-rejection");
    return completed;
}
