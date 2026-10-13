import fs from "node:fs";
import path from "node:path";
import * as api from "../../src/index.js";
import {transactionalRoundGame} from "./fixtures/TransactionalRoundGame.js";
import {ControllableDurableWallet} from "../server/wallet/fixtures/ControllableDurableWallet.js";
import {setTransactionBoundaryHook} from "../../src/server/storage/internal/transactionBoundary.js";

describe("public transactional runtime compositions", () => {
    let directory: string;
    const stores: Array<api.TransactionalRoundStore | api.ExternalRoundStore> = [];
    const wallets: ControllableDurableWallet[] = [];
    const servers: api.PokieDevServer[] = [];
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c05-")); 
    });
    afterEach(async () => {
        for (const server of servers.splice(0)) await server.stop();
        for (const store of stores.splice(0)) await store.close();
        for (const wallet of wallets.splice(0)) wallet.close();
        fs.rmSync(directory, {recursive: true, force: true});
    });
    async function wallet(): Promise<ControllableDurableWallet> {
        const value = await ControllableDurableWallet.open(path.join(directory, "wallet.sqlite"));
        wallets.push(value);
        return value;
    }
    async function open(external?: ControllableDurableWallet): Promise<api.TransactionalRoundStore | api.ExternalRoundStore> {
        const store = external ? await api.SqliteExternalRoundStore.open(path.join(directory, "external.sqlite"), external, {callTimeoutMs: 50, recoveryWaitMs: 1000}) :
            await api.SqliteTransactionalRoundStore.open(path.join(directory, "reference.sqlite"));
        stores.push(store);
        return store;
    }
    async function initialize(store: api.TransactionalRoundStore | api.ExternalRoundStore, id = "s", balance = 1000): Promise<void> {
        const game = transactionalRoundGame(), 
            context = {seed: 1}, 
            session = game.createSession(context);
        session.setCreditsAmount(balance);
        await store.initialize(id, api.captureInitialPokieSessionState(context, session, game.getSessionSerializer!(), true, game), game);
    }
    async function server(store: api.TransactionalRoundStore | api.ExternalRoundStore): Promise<string> {
        const options = "externalSettlement" in store ? {externalRoundStore: store} : {transactionalRoundStore: store};
        const instance = new api.PokieDevServer(transactionalRoundGame(), {port: 0, ...options});
        servers.push(instance);
        const address = await instance.start();
        return `http://127.0.0.1:${address.port}`;
    }
    const intent = {kind: "spin" as const, sessionId: "s", requestId: "round", expectedVersion: 1, bet: 0.05, mode: "base"};
    async function post(base: string, id: string, body: object, debug = false): Promise<{status: number; body: Record<string, unknown>}> {
        const response = await fetch(`${base}/sessions/${id}/spin${debug ? "?debug=1" : ""}`, {method: "POST", body: JSON.stringify(body)});
        return {status: response.status, body: await response.json() as Record<string, unknown>};
    }
    it.each([false, true])("HTTP creation, duplicate concurrency, restart and historical public/debug replay (external=%s)", async external => {
        const provider = external ? await wallet() : undefined;
        const store = await open(provider);
        const base = await server(store);
        const created = await fetch(`${base}/sessions?debug=1`, {method: "POST", body: JSON.stringify({seed: 1})});
        expect(created.status).toBe(201);
        const {sessionId} = await created.json() as {sessionId: string};
        const body = {requestId: "round", expectedSessionVersion: 1, bet: 0.05, mode: "base"};
        const [a, b] = await Promise.all([post(base, sessionId, body), post(base, sessionId, body)]);
        expect(a.status).toBe(200);
        expect(b).toEqual(a);
        expect(a.body.internal).toBeUndefined();
        const debug = await post(base, sessionId, body, true);
        expect(debug.body).toMatchObject({...a.body, internal: {requestId: "round", sessionVersion: 2}});
        await servers[0].stop();
        const reopened = await open(provider);
        const fresh = await server(reopened);
        const read = await fetch(`${fresh}/sessions/${sessionId}?debug=1`);
        expect(read.status).toBe(200);
        expect(await read.json()).toMatchObject({sessionId, internal: {sessionVersion: 2}});
        expect((await post(fresh, sessionId, {requestId: "next"})).status).toBe(200);
        expect(await post(fresh, sessionId, body, true)).toEqual(debug);
        const saved = await reopened.lookupResult(sessionId, "round");
        const handler = new api.SpinCommandHandler(transactionalRoundGame(() => {
            throw new Error("Replay constructed/calculated again"); 
        }), reopened);
        expect(await handler.handle(sessionId, "round", 1, 0.05, "base")).toEqual(saved);
        expect(await handler.execute({...intent, sessionId})).toEqual(saved);
        expect((await post(fresh, sessionId, {...body, bet: 7.5})).status).toBe(409);
        if (provider) expect(provider.counts(sessionId)).toEqual({debit: 2, credit: 2});
    });
    it.each([0.05, 7.5, 1e-7])("separate handlers/stores preserve fractional %s, stale loser and original result", async bet => {
        const provider = await wallet(), 
            first = await open(provider);
        await initialize(first);
        const second = await open(provider);
        const one = new api.SpinCommandHandler(transactionalRoundGame(), first), 
            two = new api.SpinCommandHandler(transactionalRoundGame(), second);
        const command = {...intent, bet};
        const [a, b] = await Promise.all([one.execute(command), two.execute(command)]);
        expect(a).toMatchObject({status: "played", stake: bet, version: 2});
        expect(b).toEqual(a);
        expect(provider.counts("s")).toEqual({debit: 1, credit: 1});
        expect(await two.execute({...command, requestId: "stale"})).toMatchObject({status: "conflict"});
        expect(await two.execute({...command, requestId: "next", expectedVersion: undefined})).toMatchObject({status: "played", stake: 0, version: 3});
        if (a.status === "played") a.state.credits = -1;
        expect(await first.lookupResult("s", "round")).toMatchObject({status: "played", stake: bet, version: 2});
        expect(await two.execute(command)).toEqual(await first.lookupResult("s", "round"));
    });
    it.each(["before-debit", "after-debit", "before-credit", "after-credit", "hang-debit", "hang-credit"] as const)("retains original intent/candidate across %s and reopening", async fault => {
        const provider = await wallet(), 
            store = await open(provider);
        await initialize(store);
        const before = await store.readSession("s");
        provider.fault = fault;
        const handler = new api.SpinCommandHandler(transactionalRoundGame(), store);
        expect(await handler.execute(intent)).toMatchObject({status: "recovery-required"});
        expect(await store.readSession("s")).toEqual(before);
        expect(await handler.execute({...intent, requestId: "other"})).toMatchObject({status: "recovery-required"});
        await store.close();
        const reopened = await open(provider);
        const recovery = new api.SpinCommandHandler(transactionalRoundGame(() => {
            throw new Error("Recovery played again"); 
        }), reopened);
        const result = await recovery.execute(intent);
        expect(result).toMatchObject({status: "played", version: 2});
        if (result.status === "played") expect(result.win).toBeGreaterThan(0);
        expect(provider.counts("s")).toEqual({debit: 1, credit: 1});
        expect(await reopened.lookupResult("s", "round")).toEqual(result);
        expect(await recovery.handle("s", "round", 1, 0.05, "base")).toEqual(result);
    });
    it.each(["unknown", "pending", "compensated", "malformed", "throw", "hang"])("blocks unsafe dispatch for inspected %s with a retained session claim", async status => {
        const provider = await wallet(), 
            store = await open(provider);
        await initialize(store);
        provider.inspection = (status === "throw" || status === "hang") ? status : {status} as api.DurableWalletTransaction;
        const handler = new api.SpinCommandHandler(transactionalRoundGame(), store);
        for (let attempt = 0; attempt < 2; attempt++) expect(await handler.execute(intent)).toMatchObject({status: "recovery-required"});
        expect(provider.counts("s")).toEqual({debit: 0, credit: 0});
        expect(await handler.execute({...intent, requestId: "another"})).toMatchObject({status: "recovery-required"});
        provider.inspection = undefined;
        expect(await handler.reconcileOne("s", "round")).toMatchObject({status: "resumed"});
        expect(provider.counts("s")).toEqual({debit: 1, credit: 1});
    });
    it("fails strong admission upfront and deliberately supports weaker dev ports", async () => {
        const incapable = new api.InMemoryWallet(1000);
        await expect(api.SqliteExternalRoundStore.open(path.join(directory, "bad.sqlite"), incapable as unknown as api.DurableWalletPort)).rejects.toThrow("capabilities");
        expect(() => new api.PokieDevServer(transactionalRoundGame(), {wallet: incapable, settlementGuarantee: "external-reconciliation"})).toThrow("guarantee");
        expect(() => new api.PokieDevServer(transactionalRoundGame(), {wallet: incapable, settlementGuarantee: "compensation"})).not.toThrow();
        const provider = await wallet();
        await expect(api.SqliteExternalRoundStore.open(path.join(directory, "bad.sqlite"), {...provider, capabilities: provider.capabilities} as api.DurableWalletPort)).rejects.toThrow("capabilities");
    });
    it("does not advance on insufficient funds, capture failure or invalid/nonfinite commands", async () => {
        const provider = await wallet(), 
            store = await open(provider);
        await initialize(store);
        await provider.setBalance("s", 0);
        const before = await store.readSession("s");
        const handler = new api.SpinCommandHandler(transactionalRoundGame(), store);
        expect(await handler.execute(intent)).toMatchObject({status: "blocked"});
        expect(await handler.execute({...intent, requestId: "invalid", bet: NaN})).toMatchObject({status: "invalid-command"});
        await provider.setBalance("s", 1000);
        const broken = new api.SpinCommandHandler(transactionalRoundGame(undefined, "capture"), store);
        expect(await broken.execute({...intent, requestId: "capture"})).toMatchObject({status: "execution-error"});
        expect(await store.readSession("s")).toEqual(before);
        expect(provider.counts("s")).toEqual({debit: 0, credit: 0});
    });
    it("retains settlement across response publication loss through HTTP and restart", async () => {
        const provider = await wallet(), 
            store = await open(provider);
        await initialize(store);
        setTransactionBoundaryHook(store, name => {
            if (name === "before:response-body") throw new Error("Response lost");
            return Promise.resolve();
        });
        const base = await server(store);
        const body = {requestId: "round", expectedSessionVersion: 1, bet: 0.05, mode: "base"};
        await post(base, "s", body).catch(() => undefined);
        await servers[0].stop();
        const reopened = await open(provider);
        const fresh = await server(reopened);
        expect((await post(fresh, "s", body)).status).toBe(200);
        expect(provider.counts("s")).toEqual({debit: 1, credit: 1});
    });
    it.each(["after-debit", "after-credit"] as const)("HTTP disconnect %s survives BOTH provider and local reopen", async fault => {
        const provider = await wallet(), 
            store = await open(provider);
        await initialize(store);
        const base = await server(store);
        provider.fault = fault;
        const body = {requestId: "round", expectedSessionVersion: 1, bet: 0.05, mode: "base"};
        const interrupted = await post(base, "s", body);
        expect(interrupted).toMatchObject({status: 409, body: {code: "recovery-required"}});
        await servers[0].stop();
        provider.close();
        wallets.splice(wallets.indexOf(provider), 1);
        const freshProvider = await wallet(), 
            freshStore = await open(freshProvider);
        const fresh = await server(freshStore);
        expect((await post(fresh, "s", body, true)).body).toMatchObject({internal: {requestId: "round", sessionVersion: 2}});
        expect(freshProvider.counts("s")).toEqual({debit: 1, credit: 1});
    });
    it("bounds a late committed debit, drains shutdown and fences its late acknowledgement", async () => {
        const provider = await wallet(), 
            store = await open(provider);
        await initialize(store);
        let acknowledge!: (balance: number) => void;
        const original = provider.debit.bind(provider);
        provider.debit = async (session, id, amount) => {
            const balance = await original(session, id, amount);
            return new Promise<number>(resolve => {
                acknowledge = () => resolve(balance); 
            });
        };
        const handler = new api.SpinCommandHandler(transactionalRoundGame(), store);
        const work = handler.execute(intent);
        const closing = store.close();
        expect(await work).toMatchObject({status: "recovery-required"});
        await closing;
        const reopened = await open(provider);
        const recovery = new api.SpinCommandHandler(transactionalRoundGame(), reopened);
        const result = await recovery.execute(intent);
        expect(result).toMatchObject({status: "played", version: 2});
        acknowledge(0);
        await Promise.resolve();
        expect(await reopened.lookupResult("s", "round")).toEqual(result);
        expect(provider.counts("s")).toEqual({debit: 1, credit: 1});
    });
    it("cancellation before dispatch has no effect and after dispatch retains ambiguity", async () => {
        const provider = await wallet(), 
            store = await open(provider);
        await initialize(store);
        const handler = new api.SpinCommandHandler(transactionalRoundGame(), store);
        const before = new AbortController();
        before.abort();
        expect(await handler.execute(intent, before.signal)).toMatchObject({status: "recovery-required"});
        expect(provider.counts("s")).toEqual({debit: 0, credit: 0});
        const after = new AbortController();
        provider.onDispatch = () => after.abort();
        expect(await handler.execute(intent, after.signal)).toMatchObject({status: "recovery-required"});
        provider.onDispatch = undefined;
        expect(await handler.execute(intent)).toMatchObject({status: "played"});
        expect(provider.counts("s")).toEqual({debit: 1, credit: 1});
    });

    it.each(["bet", "mode", "version"])("binds pending and committed external identity to original %s", async field => {
        const provider = await wallet(), 
            store = await open(provider);
        await initialize(store);
        await initialize(store, "other-session");
        const handler = new api.SpinCommandHandler(transactionalRoundGame(), store);
        provider.fault = "after-debit";
        expect(await handler.execute(intent)).toMatchObject({status: "recovery-required"});
        const changed = {...intent, ...(field === "bet" ? {bet: 7.5} : {}), ...(field === "mode" ? {mode: "double"} : {}), ...(field === "version" ? {expectedVersion: 2} : {})};
        expect(await handler.execute(changed)).toMatchObject({status: "identity-conflict"});
        expect(await handler.execute(intent)).toMatchObject({status: "played"});
        expect(await handler.execute(changed)).toMatchObject({status: "identity-conflict"});
        expect(await handler.execute({...intent, sessionId: "other-session"})).toMatchObject({status: "played"});
        expect(provider.counts("s")).toEqual({debit: 1, credit: 1});
    });
    it("rejects corrupt candidate/accounting before further settlement and exposes raw handle versus classified execute failures", async () => {
        const provider = await wallet(), 
            store = await open(provider);
        await initialize(store);
        const broken = new api.SpinCommandHandler(transactionalRoundGame(undefined, "capture"), store);
        await expect(broken.handle("s", "broken", 1, 0.05, "base")).rejects.toThrow("capture failure");
        expect(await broken.execute({...intent, requestId: "broken-again"})).toMatchObject({status: "execution-error"});
        provider.fault = "after-debit";
        const handler = new api.SpinCommandHandler(transactionalRoundGame(), store);
        expect(await handler.execute(intent)).toMatchObject({status: "recovery-required"});
        const db = Reflect.get(store, "database") as import("node:sqlite").DatabaseSync;
        const row = db.prepare("SELECT intent FROM external_requests WHERE session_id='s' AND request_id='round'").get()!;
        const captured = JSON.parse(String(row.intent));
        captured.candidate.credits = -1;
        db.prepare("UPDATE external_requests SET intent=? WHERE session_id='s' AND request_id='round'").run(JSON.stringify(captured));
        expect(await handler.execute(intent)).toMatchObject({status: "recovery-required"});
        expect(provider.counts("s")).toEqual({debit: 1, credit: 0});
        expect(await store.readSession("s")).toMatchObject({version: 1});
    });
    it("rejects non-durable falsely incomplete store composition before game construction", () => {
        const fake = {externalSettlement: true, readSession: () => Promise.resolve(undefined)} as unknown as api.ExternalRoundStore;
        expect(() => new api.SpinCommandHandler(transactionalRoundGame(), fake)).toThrow("durable intent");
        expect(() => new api.PokieDevServer(transactionalRoundGame(), {externalRoundStore: fake})).toThrow("durable intent");
    });

    it("serializes separate-instance different keys, rejects stale revisions and consumes successive omitted revisions", async () => {
        const provider = await wallet(), 
            first = await open(provider);
        await initialize(first);
        const second = await open(provider);
        const a = new api.SpinCommandHandler(transactionalRoundGame(), first), 
            b = new api.SpinCommandHandler(transactionalRoundGame(), second);
        const [winner, loser] = await Promise.all([a.execute(intent), b.execute({...intent, requestId: "loser"})]);
        expect(winner).toMatchObject({status: "played", version: 2});
        expect(loser).toMatchObject({status: "conflict"});
        const results = await Promise.all([a.execute({...intent, requestId: "two", expectedVersion: undefined}), b.execute({...intent, requestId: "three", expectedVersion: undefined})]);
        expect(results).toMatchObject([{status: "played", stake: 0, version: 3}, {status: "played", stake: 0, version: 4}]);
        expect(provider.counts("s")).toEqual({debit: 3, credit: 3});
    });
    it("serialization failure preserves the old state and performs no remote action", async () => {
        const provider = await wallet(), 
            store = await open(provider);
        await initialize(store);
        const handler = new api.SpinCommandHandler(transactionalRoundGame(undefined, "serialization"), store);
        const before = await store.readSession("s");
        expect(await handler.execute(intent)).toMatchObject({status: "execution-error"});
        expect(provider.counts("s")).toEqual({debit: 0, credit: 0});
        expect(await store.readSession("s")).toEqual(before);
    });

});
