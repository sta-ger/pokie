import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fork, type ChildProcess} from "node:child_process";
import ts from "typescript";
import * as API from "../../src/index.js";
import type {RoundTransaction} from "../../src/server/storage/TransactionalRoundStore.js";
import {transactionalRoundGame} from "./fixtures/TransactionalRoundGame.js";
import {setTransactionBoundaryHook} from "../../src/server/storage/internal/transactionBoundary.js";
import {emitPublicRuntime} from "./helpers/publicRuntime.js";

const command = {kind: "spin" as const, sessionId: "session", requestId: "request", expectedVersion: 1, bet: 0.05, mode: "base"};
function changedIntent(field: string): typeof command {
    if (field === "bet") return {...command, bet: 7.5};
    if (field === "mode") return {...command, mode: "double"};
    if (field === "expectedVersion") return {...command, expectedVersion: 2};
    return {...command};
}
// Every SQL mutation in a round, COMMIT and HTTP publication has a before/after hook.
const writes = ["request", "operation-started", "debit-ledger", "debit-balance", "operation-debited", "payout-ledger", "payout-balance", "operation-settled", "state", "operation-session-saved", "result", "operation-committed", "commit"];
const boundaries = [...writes, "response", "response-headers", "response-body"].flatMap(write => [`before:${write}`, `after:${write}`]);

type Message = {[key: string]: unknown; type: string};
class Worker {
    public readonly process: ChildProcess;
    public readonly exited: Promise<void>;
    private readonly messages: Message[] = [];
    private readonly listeners = new Set<() => void>();
    private stderr = "";
    constructor(file: string, args: string[]) {
        this.process = fork(file, args, {execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"]});
        this.process.stderr?.on("data", data => {
            this.stderr += String(data);
        });
        this.process.on("message", message => {
            this.messages.push(message as Message);
            this.listeners.forEach(listener => listener());
        });
        this.exited = new Promise(resolve => {
            this.process.once("exit", () => {
                this.listeners.forEach(listener => listener());
                resolve();
            });
            this.process.once("error", error => {
                this.messages.push({type: "error", error: String(error)});
                this.listeners.forEach(listener => listener());
                resolve();
            });
        });
    }
    public wait(type: string): Promise<Message> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => finish(new Error(`Worker timed out waiting for ${type}: ${this.stderr}`)), 15000);
            const finish = (error?: Error, value?: Message): void => {
                clearTimeout(timer);
                this.listeners.delete(check);
                if (error) reject(error);
                else resolve(value!);
            };
            const check = (): void => {
                const failure = this.messages.find(value => value.type === "error");
                if (failure) {
                    finish(new Error(String(failure.error)));
                    return;
                }
                const index = this.messages.findIndex(value => value.type === type);
                if (index >= 0) {
                    finish(undefined, this.messages.splice(index, 1)[0]);
                    return;
                }
                if (this.process.exitCode !== null || this.process.signalCode !== null) finish(new Error(`Worker exited before ${type}: ${this.stderr}`));
            };
            this.listeners.add(check);
            check();
        });
    }
    public send(type: string): void {
 this.process.send!({type});
    }
    public async kill(): Promise<void> {
        if (this.process.exitCode === null && this.process.signalCode === null) this.process.kill("SIGKILL");
        await this.exited;
    }
}

describe("durable transactional reference rounds", () => {
    let runtime: ReturnType<typeof emitPublicRuntime>;
    const api = API;
    let gameFactory: typeof transactionalRoundGame;
    let hook: typeof setTransactionBoundaryHook;
    let directory: string;
    let database: string;
    let calculations: string;
    let workers: Worker[];
    let stores: API.SqliteTransactionalRoundStore[];
    let readers: import("node:sqlite").DatabaseSync[];
    beforeAll(() => {
        runtime = emitPublicRuntime();
        for (const name of ["TransactionalRoundGame", "TransactionalRoundStoreProcess"]) {
            const source = fs.readFileSync(path.join(process.cwd(), "tests/v2/fixtures", `${name}.ts`), "utf8");
            for (const format of ["mjs", "cjs"]) {
                const output = ts.transpileModule(source, {fileName: format === "mjs" ? "fixture.mts" : "fixture.cts", compilerOptions: {module: ts.ModuleKind.NodeNext, target: ts.ScriptTarget.ES2022}}).outputText.replace("./TransactionalRoundGame.js", `./TransactionalRoundGame.${format}`);
                fs.writeFileSync(path.join(runtime.directory, `${name}.${format}`), output);
            }
        }
        gameFactory = transactionalRoundGame;
        hook = setTransactionBoundaryHook;
    }, 60000);
    afterAll(() => runtime?.dispose());
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(runtime.directory, "database-"));
        database = path.join(directory, "rounds.sqlite");
        calculations = path.join(directory, "calculations.txt");
        workers = [];
        stores = [];
        readers = [];
    });
    afterEach(async () => {
        await Promise.all(workers.map(worker => worker.kill()));
        await Promise.all(stores.map(store => store.close()));
        readers.forEach(reader => {
            if (reader.isOpen) reader.close();
        });
        fs.rmSync(directory, {recursive: true, force: true});
    });
    async function open(lockWaitMs = 5000): Promise<API.SqliteTransactionalRoundStore> {
        const store = await api.SqliteTransactionalRoundStore.open(database, {lockWaitMs});
        stores.push(store);
        return store;
    }
    async function initialize(store: API.SqliteTransactionalRoundStore, id = "session", credits = 1000): Promise<void> {
        const game = gameFactory(),
            context = {seed: 7},
            session = game.createSession(context);
        session.setCreditsAmount(credits);
        await store.initialize(id, api.captureInitialPokieSessionState(context, session, game.getSessionSerializer!(), true, game), game);
    }
    function worker(action: string, intent = command, boundary = "", format = "mjs", filename = database): Worker {
        const child = new Worker(path.join(runtime.directory, `TransactionalRoundStoreProcess.${format}`), [filename, action,
            JSON.stringify(intent), boundary, path.join(runtime.directory, `node_modules/@fromstan/pokie/dist/${format === "mjs" ? "esm" : "cjs"}/server/storage/internal/transactionBoundary.js`), calculations]);
        workers.push(child);
        return child;
    }
    async function run(action: string, intent = command, filename = database): Promise<Message> {
        const child = worker(action, intent, "", "mjs", filename);
        if (action === "execute" || action === "busy") {
            await child.wait("ready");
            child.send("start");
        }
        const result = await child.wait("done");
        await child.exited;
        expect(child.process.exitCode).toBe(0);
        return result;
    }
    function countCalculations(): number {
        return fs.existsSync(calculations) ? fs.readFileSync(calculations, "utf8").trim().split("\n").length : 0;
    }

    async function completeReferenceRound(tx: RoundTransaction, intent: API.RepositoryCommand, credits: number): Promise<API.SpinCommandResult> {
        const previous = (await tx.sessions.loadVersioned(intent.sessionId))!;
        const state = {...previous.state, credits};
        const version = await tx.sessions.saveVersioned(intent.sessionId, state, previous.version);
        const result: API.SpinCommandResult = {status: "played", sessionId: intent.sessionId, requestId: intent.requestId,
            previousState: previous.state, state, credits, stake: 20, win: 5, version};
        await tx.results.save(intent.sessionId, intent.requestId!, result);
        await tx.operations.record({sessionId: intent.sessionId, requestId: intent.requestId!, attemptId: "reference",
            debitTransactionId: "reference:debit", creditTransactionId: "reference:credit", stakeAmount: 20,
            expectedVersion: previous.version, checkpoint: "committed", startedAt: "test", updatedAt: "test",
            capturedResult: {previousState: previous.state, newState: state, credits, stake: 20, win: 5, newVersion: version}});
        return result;
    }

    it("serializes overlapping public ledger debit/credit and commits consistent balance, state and result", async () => {
        const store = await open();
        await initialize(store, "session", 100);
        const result = await store.transact(command, async (tx, intent) => {
            const outcomes = await Promise.all([tx.ledger.debit("session", "reference:debit", 20),
                tx.ledger.credit("session", "reference:credit", 5), tx.ledger.getBalance("session")]);
            expect(outcomes).toEqual([80, 85, 85]);
            return completeReferenceRound(tx, intent, outcomes[2]);
        });
        await store.close();
        const observed = await run("observe");
        expect(observed).toMatchObject({balance: 85, state: {version: 2, state: {credits: 85}}, result});
        expect(observed.ledger).toEqual([{kind: "debit", amount: 20, balance: 80}, {kind: "credit", amount: 5, balance: 85}]);
        expect(JSON.parse(String((observed.operations as {record: string}[])[0].record))).toMatchObject({checkpoint: "committed"});
    });

    it("applies concurrent duplicate ledger identities once, returns historical outcomes and rejects conflicting reuse", async () => {
        const store = await open();
        await initialize(store, "session", 100);
        const result = await store.transact(command, async (tx, intent) => {
            const outcomes = await Promise.allSettled([tx.ledger.debit("session", "reference:debit", 20),
                tx.ledger.credit("session", "reference:credit", 5), tx.ledger.debit("session", "reference:debit", 20),
                tx.ledger.credit("session", "reference:credit", 5), tx.ledger.debit("session", "reference:debit", 21),
                tx.ledger.credit("session", "reference:debit", 20)]);
            expect(outcomes.slice(0, 4)).toEqual([80, 85, 80, 85].map(value => ({status: "fulfilled", value})));
            for (const outcome of outcomes.slice(4)) {
                expect(outcome).toMatchObject({status: "rejected", reason: new Error("Conflicting reference ledger transaction identity.")});
            }
            expect(await tx.ledger.getBalance("session")).toBe(85);
            return completeReferenceRound(tx, intent, 85);
        });
        await store.close();
        const observed = await run("observe");
        expect(observed).toMatchObject({balance: 85, state: {version: 2, state: {credits: 85}}, result});
        expect(observed.ledger).toEqual([{kind: "debit", amount: 20, balance: 80}, {kind: "credit", amount: 5, balance: 85}]);
    });

    it("rolls back overlapping debits that exceed available funds and retries from the original tuple", async () => {
        const store = await open();
        await initialize(store, "session", 100);
        const before = await store.readSession("session");
        await expect(store.transact(command, async tx => {
            await Promise.all([tx.ledger.debit("session", "reference:debit", 60), tx.ledger.debit("session", "second:debit", 50)]);
            throw new Error("Overdraw was accepted");
        })).rejects.toThrow('Cannot debit 50 for session "session": balance is only 40.');
        await store.close();
        const observed = await run("observe");
        expect(observed).toMatchObject({balance: 100, state: before, ledger: [], operations: [], requests: []});
        expect(observed.result).toBeUndefined();
        const reopened = await open();
        const result = await reopened.transact(command, async (tx, intent) => {
            await Promise.all([tx.ledger.debit("session", "reference:debit", 20), tx.ledger.credit("session", "reference:credit", 5)]);
            return completeReferenceRound(tx, intent, await tx.ledger.getBalance("session"));
        });
        expect(result).toMatchObject({status: "played", version: 2, credits: 85, previousState: before?.state});
    });

    it("drains accepted ledger writes before callback failure rolls back and the next transaction starts", async () => {
        const store = await open();
        await initialize(store, "session", 100);
        let acknowledge!: () => void, release!: () => void;
        const acknowledged = new Promise<void>(resolve => {
            acknowledge = resolve;
        });
        const released = new Promise<void>(resolve => {
            release = resolve;
        });
        const events: string[] = [];
        hook(store, async boundary => {
            if (boundary === "before:payout-ledger") {
                acknowledge();
                await released;
            }
            if (boundary === "after:payout-balance") events.push("ledger-finished");
        });
        const failed = store.transact(command, tx => {
            tx.ledger.credit("session", "aborted:credit", 5).catch(() => undefined);
            return Promise.reject(new Error("callback failed"));
        }).catch(error => {
            events.push("rolled-back");
            return error as Error;
        });
        try {
            await acknowledged;
            const next = store.transact(command, async (tx, intent) => {
                events.push("next-started");
                await Promise.all([tx.ledger.debit("session", "reference:debit", 20), tx.ledger.credit("session", "reference:credit", 5)]);
                return completeReferenceRound(tx, intent, await tx.ledger.getBalance("session"));
            });
            release();
            expect(await failed).toMatchObject({message: "callback failed"});
            expect(await next).toMatchObject({status: "played", version: 2, credits: 85});
            expect(events).toEqual(["ledger-finished", "rolled-back", "next-started", "ledger-finished"]);
            await store.close();
            const observed = await run("observe");
            expect(observed).toMatchObject({balance: 85, state: {version: 2, state: {credits: 85}}});
            expect(observed.ledger).toEqual([{kind: "debit", amount: 20, balance: 80}, {kind: "credit", amount: 5, balance: 85}]);
        } finally {
            release();
        }
    });

    it("cannot commit a caught partial ledger persistence failure with an otherwise matching tuple", async () => {
        const store = await open();
        await initialize(store, "session", 100);
        const before = await store.readSession("session");
        hook(store, boundary => {
            if (boundary === "after:payout-ledger") throw new Error("payout balance not written");
            return Promise.resolve();
        });
        await expect(store.transact(command, async (tx, intent) => {
            const outcomes = await Promise.allSettled([tx.ledger.debit("session", "reference:debit", 20), tx.ledger.credit("session", "reference:credit", 5)]);
            expect(outcomes).toMatchObject([{status: "fulfilled", value: 80}, {status: "rejected"}]);
            return completeReferenceRound(tx, intent, 80);
        })).rejects.toThrow("payout balance not written");
        await store.close();
        const observed = await run("observe");
        expect(observed).toMatchObject({balance: 100, state: before, ledger: [], operations: [], requests: []});
        expect(observed.result).toBeUndefined();
    });

    it("constructs public CJS/ESM storage, initializes once, reopens and detaches historical results without constructing the game", async () => {
        const store = await open();
        await initialize(store);
        await expect(initialize(store)).rejects.toThrow();
        const result = await new api.SpinCommandHandler(gameFactory(), store).handle("session", "request", 1, 0.05, "base");
        expect(result).toMatchObject({status: "played", version: 2, stake: 0.05});
        const original = JSON.parse(JSON.stringify(result));
        if (result.status !== "played") throw new Error("Round rejected");
        result.state.credits = -1;
        expect(await store.lookupResult("session", "request")).toEqual(original);
        await new api.SpinCommandHandler(gameFactory(), store).execute({...command, requestId: "later", expectedVersion: 2});
        await store.close();
        const reopened = await open();
        const game = gameFactory();
        game.createSession = () => {
            throw new Error("must not construct for replay");
        };
        expect(await new api.SpinCommandHandler(game, reopened).execute(command)).toEqual(original);
        expect(await new api.SpinCommandHandler(game, reopened).getReconciliationService().reconcileOne("session", "request")).toMatchObject({status: "already-committed"});
        expect(await new api.SpinCommandHandler(game, reopened).reconcileOne("session", "request")).toMatchObject({status: "already-committed"});
        expect(await new api.SpinCommandHandler(game, reopened).reconcileAll()).toEqual([]);
        const observed = await run("observe");
        expect((observed.ledger as unknown[])).toHaveLength(4);
        expect(observed.state).toMatchObject({version: 3});
        expect(observed.result).toEqual(original);
    });

    it("constructs and executes a real CJS public consumer and commits requestId-omitted rounds independently", async () => {
        const child = worker("initialize", command, "", "cjs");
        await child.wait("done");
        await child.exited;
        expect(child.process.exitCode).toBe(0);
        const execute = worker("execute", command, "", "cjs");
        await execute.wait("ready");
        execute.send("start");
        expect((await execute.wait("done")).result).toMatchObject({status: "played", version: 2});
        await execute.exited;
        expect(execute.process.exitCode).toBe(0);
        const store = await open();
        const handler = new api.SpinCommandHandler(gameFactory(), store);
        expect(await handler.execute({kind: "spin", sessionId: "session"})).toMatchObject({status: "played", version: 3});
        expect(await handler.execute({kind: "spin", sessionId: "session"})).toMatchObject({status: "played", version: 4});
        expect((await run("observe")).ledger).toHaveLength(6);
    });

    it.each([0.05, 7.5, 1e-7])("retains fractional stake %s, zero free-round debit and complete continuation", async bet => {
        const store = await open();
        await initialize(store);
        const handler = new api.SpinCommandHandler(gameFactory(), store);
        expect(await handler.execute({...command, bet})).toMatchObject({status: "played", stake: bet});
        const free = await handler.execute({...command, requestId: "free", expectedVersion: 2, bet});
        expect(free).toMatchObject({status: "played", stake: 0, version: 3});
        const snapshot = await store.readSession("session");
        expect(snapshot?.state.featureState).toMatchObject({round: 2, free: 1});
        expect(snapshot?.state.credits).toBe(await store.getBalance("session"));
    });

    it("rejects invalid schema, incompatible/corrupt/live-only states before calculation and forbids escaped participants", async () => {
        const store = await open();
        const game = gameFactory(),
            context = {seed: 7};
        const initial = api.captureInitialPokieSessionState(context, game.createSession(context), game.getSessionSerializer!(), true, game);
        await expect(store.initialize("session", {...initial, featureState: {}}, game)).rejects.toThrow();
        await expect(store.initialize("session", {...initial, executionState: "live-only"}, game)).rejects.toThrow();
        await initialize(store);
        let escaped: RoundTransaction | undefined;
        expect(await store.transact(command, tx => {
            escaped = tx;
            return Promise.resolve({status: "blocked", sessionId: "session", reason: "test abort"});
        })).toMatchObject({status: "blocked"});
        expect(() => escaped!.sessions.load("session")).toThrow("owning transaction");
        const {DatabaseSync} = createRequire(path.join(runtime.directory, "consumer.cjs"))("node:sqlite") as typeof import("node:sqlite");
        const raw = new DatabaseSync(database);
        readers.push(raw);
        raw.prepare("UPDATE sessions SET state=?").run(JSON.stringify({...initial, featureState: {}}));
        let calculationsCount = 0;
        const handler = new api.SpinCommandHandler(gameFactory(() => calculationsCount++), store);
        expect(await handler.execute(command)).toMatchObject({status: "corrupt-state"});
        raw.prepare("UPDATE sessions SET state=?").run(JSON.stringify({...initial, identity: {...initial.identity, gameId: "other"}}));
        expect(await handler.execute(command)).toMatchObject({status: "incompatible-state"});
        raw.prepare("UPDATE sessions SET state=?").run(JSON.stringify({...initial, executionState: "live-only"}));
        expect(await handler.execute(command)).toMatchObject({status: "restoration-unsupported"});
        expect(calculationsCount).toBe(0);
        raw.exec("PRAGMA user_version=2");
        await expect(api.SqliteTransactionalRoundStore.open(database)).rejects.toThrow("schema");
    });

    it("rolls back insufficient balance, failed calculation/capture/serialization and every persistence boundary, preserving state/RNG", async () => {
        const store = await open();
        await initialize(store, "poor", 0);
        expect(await new api.SpinCommandHandler(gameFactory(), store).execute({...command, sessionId: "poor"})).toMatchObject({status: "blocked"});
        await initialize(store);
        const selected = {...command, bet: 7.5, mode: "double"};
        const before = await store.readSession("session");
        for (const failure of ["calculation", "capture", "serialization"] as const) {
            expect(await new api.SpinCommandHandler(gameFactory(() => undefined, failure), store).execute(selected)).toMatchObject({status: "execution-error"});
            expect(await store.readSession("session")).toEqual(before);
            expect(await store.getBalance("session")).toBe(1000);
        }
        for (const boundary of writes.flatMap(write => [`before:${write}`, `after:${write}`]).filter(name => name !== "after:commit")) {
            hook(store, name => {
                if (name === boundary) throw new Error(`fault at ${boundary}`);
                return Promise.resolve();
            });
            const result = await new api.SpinCommandHandler(gameFactory(), store).execute(selected);
            expect({boundary, result}).toMatchObject({boundary, result: {status: boundary.includes("debit-") || boundary.includes("payout-") ? "settlement-error" : "storage-error"}});
            expect(await store.readSession("session")).toEqual(before);
            expect(await store.lookupResult("session", "request")).toBeUndefined();
            expect(await store.getBalance("session")).toBe(1000);
        }
        hook(store, () => Promise.resolve());
        const result = await new api.SpinCommandHandler(gameFactory(), store).execute(selected);
        const control = await api.SqliteTransactionalRoundStore.open(path.join(directory, "control.sqlite"));
        stores.push(control);
        await initialize(control);
        expect(result).toEqual(await new api.SpinCommandHandler(gameFactory(), control).execute(selected));
    });

    it("rejects insufficient reference settlement and resolves an error after durable commit from the original result", async () => {
        const store = await open();
        await initialize(store, "poor", 0);
        const game = gameFactory();
        const create = game.createSession.bind(game);
        game.createSession = context => {
            const session = create(context);
            session.canPlayNextGame = () => true;
            return session;
        };
        expect(await new api.SpinCommandHandler(game, store).execute({...command, sessionId: "poor"})).toMatchObject({status: "settlement-error"});
        expect(await store.readSession("poor")).toMatchObject({version: 1});
        expect(await store.getBalance("poor")).toBe(0);
        await initialize(store);
        hook(store, name => {
            if (name === "after:commit") throw new Error("lost commit acknowledgement");
            return Promise.resolve();
        });
        const handler = new api.SpinCommandHandler(gameFactory(), store);
        const result = await handler.execute(command);
        expect(result).toMatchObject({status: "played", version: 2});
        expect(await handler.execute(command)).toEqual(result);
    });

    it.each(["bet", "mode", "expectedVersion", "omitted-bet"])("rejects conflicting durable request identity (%s) through handle and execute", async field => {
        const store = await open();
        await initialize(store);
        const handler = new api.SpinCommandHandler(gameFactory(), store);
        await handler.execute(command);
        const intent = changedIntent(field);
        if (field === "omitted-bet") Reflect.deleteProperty(intent, "bet");
        expect(await handler.execute(intent)).toMatchObject({status: "identity-conflict"});
        expect(await handler.handle(intent.sessionId, intent.requestId, intent.expectedVersion, intent.bet, intent.mode)).toMatchObject({status: "identity-conflict"});
        expect((await run("observe")).ledger).toHaveLength(2);
    });

    it("races identical processes with one actual calculation, settlement pair and revision", async () => {
        await run("initialize");
        const first = worker("execute"),
            second = worker("execute");
        await Promise.all([first.wait("ready"), second.wait("ready")]);
        first.send("start");
        second.send("start");
        const [a, b] = await Promise.all([first.wait("done"), second.wait("done")]);
        await Promise.all([first.exited, second.exited]);
        expect(a.result).toEqual(b.result);
        expect(a.result).toMatchObject({status: "played", version: 2});
        expect(countCalculations()).toBe(1);
        const observed = await run("observe");
        expect(observed.ledger).toHaveLength(2);
        expect(observed.operations).toHaveLength(1);
        expect(observed.requests).toHaveLength(1);
    });

    it("rejects active changed payloads, serializes distinct keys/version races, allows cross-session reuse and omitted-version successive execution", async () => {
        await run("initialize");
        const first = worker("execute", command, "after:debit-balance");
        await first.wait("ready");
        first.send("start");
        await first.wait("boundary");
        const changed = worker("execute", {...command, mode: "double"});
        const distinct = worker("execute", {...command, requestId: "distinct"});
        await Promise.all([changed.wait("ready"), distinct.wait("ready")]);
        changed.send("start");
        distinct.send("start");
        first.send("resume");
        expect((await first.wait("done")).result).toMatchObject({status: "played"});
        expect((await changed.wait("done")).result).toMatchObject({status: "identity-conflict"});
        expect((await distinct.wait("done")).result).toMatchObject({status: "conflict"});
        await Promise.all([first.exited, changed.exited, distinct.exited]);
        const next = {...command, requestId: "next", expectedVersion: undefined} as unknown as typeof command;
        const second = worker("execute", next),
            third = worker("execute", {...next, requestId: "third"});
        await Promise.all([second.wait("ready"), third.wait("ready")]);
        second.send("start");
        third.send("start");
        const successive = await Promise.all([second.wait("done"), third.wait("done")]);
        await Promise.all([second.exited, third.exited]);
        expect(successive.map(value => (value.result as API.SpinCommandResult & {version: number}).version).sort()).toEqual([3, 4]);
        successive.forEach(value => expect(value.result).toMatchObject({status: "played", stake: 0}));
        expect((await run("execute", command)).result).toMatchObject({status: "played", version: 2});
        await run("initialize", {...command, sessionId: "other"});
        expect((await run("execute", {...command, sessionId: "other"})).result).toMatchObject({status: "played", version: 2});
        expect(countCalculations()).toBe(4);
    });

    it.each(["bet", "mode", "expectedVersion"])("rejects conflicting %s from a process while the owner is active", async field => {
        await run("initialize");
        const holder = worker("execute", command, "after:debit-balance");
        await holder.wait("ready");
        holder.send("start");
        await holder.wait("boundary");
        const changed = changedIntent(field);
        const contender = worker("execute", changed);
        await contender.wait("ready");
        contender.send("start");
        holder.send("resume");
        await holder.wait("done");
        expect((await contender.wait("done")).result).toMatchObject({status: "identity-conflict"});
        await Promise.all([holder.exited, contender.exited]);
        expect(countCalculations()).toBe(1);
        expect((await run("observe")).ledger).toHaveLength(2);
    });

    it("serializes different-session processes while allowing the same caller key independently", async () => {
        await run("initialize");
        await run("initialize", {...command, sessionId: "other"});
        const first = worker("execute"),
            second = worker("execute", {...command, sessionId: "other"});
        await Promise.all([first.wait("ready"), second.wait("ready")]);
        first.send("start");
        second.send("start");
        for (const child of [first, second]) expect((await child.wait("done")).result).toMatchObject({status: "played", version: 2});
        await Promise.all([first.exited, second.exited]);
        expect(countCalculations()).toBe(2);
    });

    it("retains primary execution failure when rollback cleanup fails and recovers through a fresh connection", async () => {
        const store = await open();
        await initialize(store);
        const raw = Reflect.get(store, "database") as import("node:sqlite").DatabaseSync;
        const exec = raw.exec.bind(raw);
        raw.exec = sql => {
            if (sql === "ROLLBACK") throw new Error("cleanup failure");
            exec(sql);
        };
        expect(await new api.SpinCommandHandler(gameFactory(() => undefined, "calculation"), store).execute(command)).toMatchObject({status: "execution-error", reason: "calculation failure"});
        const reopened = await open();
        expect(await reopened.readSession("session")).toMatchObject({version: 1});
        expect(await reopened.getBalance("session")).toBe(1000);
        expect(await new api.SpinCommandHandler(gameFactory(), reopened).execute(command)).toMatchObject({status: "played", version: 2});
    });

    it("bounds asynchronous busy waiting, recovers abandoned locks and drains accepted transactions on close", async () => {
        await run("initialize");
        const holder = worker("execute", command, "after:debit-balance");
        await holder.wait("ready");
        holder.send("start");
        await holder.wait("boundary");
        const store = await open(30);
        expect(await new api.SpinCommandHandler(gameFactory(), store).execute(command)).toMatchObject({status: "storage-error", reason: expect.stringContaining("contention timeout")});
        await holder.kill();
        const reopened = await open();
        const handler = new api.SpinCommandHandler(gameFactory(), reopened);
        let release!: () => void;
        let entered!: () => void;
        const held = new Promise<void>(resolve => {
            release = resolve;
        });
        const acknowledged = new Promise<void>(resolve => {
            entered = resolve;
        });
        hook(reopened, async name => {
            if (name === "after:debit-balance") {
                entered();
                await held;
            }
        });
        const result = handler.execute(command);
        try {
            await acknowledged;
            const closed = reopened.close();
            await expect(reopened.readSession("session")).rejects.toThrow("closing");
            release();
            expect(await result).toMatchObject({status: "played"});
            await closed;
        } finally {
            release();
            await result;
        }
        expect((await run("observe")).state).toMatchObject({version: 2});
    });

    it.each(boundaries)("survives external process death at %s and retries from the complete committed tuple", async boundary => {
        await run("initialize");
        const initial = await run("observe");
        const writer = worker(boundary.includes("response") ? "server" : "execute", command, boundary);
        const ready = await writer.wait("ready");
        let request: Promise<unknown> | undefined;
        if (boundary.includes("response")) {
            request = fetch(`http://127.0.0.1:${ready.port}/sessions/session/spin?debug=1`, {method: "POST", body: JSON.stringify({requestId: "request", expectedSessionVersion: 1, bet: 0.05, mode: "base"})}).then(response => response.json()).catch(() => undefined);
        } else writer.send("start");
        await writer.wait("boundary");
        await writer.kill();
        await request;
        const observed = await run("observe");
        const committed = boundary === "after:commit" || boundary.includes("response");
        if (committed) {
            expect(observed.state).toMatchObject({version: 2});
            expect(observed.result).toMatchObject({status: "played", version: 2});
            expect(observed.ledger).toHaveLength(2);
            expect(observed.operations).toHaveLength(1);
            expect(JSON.parse(String((observed.operations as {record: string}[])[0].record)).checkpoint).toBe("committed");
        } else {
            expect(observed.state).toEqual(initial.state);
            expect(observed.result).toBeUndefined();
            expect(observed.balance).toBe(initial.balance);
            expect(observed.ledger).toEqual([]);
            expect(observed.operations).toEqual([]);
            expect(observed.requests).toEqual([]);
        }
        const attempts = countCalculations();
        const constructions = fs.readFileSync(`${calculations}.construction`, "utf8");
        const retry = await run("execute");
        expect(retry.result).toMatchObject({status: "played", version: 2});
        if (committed) {
            expect(retry.result).toEqual(observed.result);
            expect(countCalculations()).toBe(attempts);
            expect(fs.readFileSync(`${calculations}.construction`, "utf8")).toBe(constructions);
        } else expect(countCalculations()).toBe(attempts + 1);
        const final = await run("observe");
        expect(final.state).toMatchObject({version: 2});
        expect(final.balance).toBe((final.state as API.VersionedSessionState).state.credits);
        expect(final.ledger).toHaveLength(2);
        // Rolled-back calculations may be attempted again, but seeded logical round #1
        // must match an uninterrupted control including RNG and free-game state.
        const controlDatabase = path.join(directory, "control.sqlite");
        await run("initialize", command, controlDatabase);
        const control = await run("execute", command, controlDatabase);
        expect(retry.result).toEqual(control.result);
    }, 30000);

    it("initializes/restores through HTTP, commits an accepted disconnected round and drains it before server shutdown", async () => {
        const store = await open();
        const server = new api.PokieDevServer(gameFactory(), {port: 0, transactionalRoundStore: store});
        const address = await server.start();
        const base = `http://127.0.0.1:${address.port}`;
        let release!: () => void;
        let entered!: () => void;
        const held = new Promise<void>(resolve => {
            release = resolve;
        });
        const acknowledged = new Promise<void>(resolve => {
            entered = resolve;
        });
        hook(store, async name => {
            if (name === "after:debit-balance") {
                entered();
                await held;
            }
        });
        try {
            const creation = await fetch(`${base}/sessions?debug=1`, {method: "POST", body: JSON.stringify({seed: 7})});
            expect(creation.status).toBe(201);
            const created = await creation.json() as {sessionId: string; internal: {sessionVersion: number}};
            expect(created.internal.sessionVersion).toBe(1);
            const controller = new AbortController();
            const response = fetch(`${base}/sessions/${created.sessionId}/spin`, {method: "POST", signal: controller.signal,
                body: JSON.stringify({requestId: "disconnect", expectedSessionVersion: 1, bet: 0.05})}).catch(() => undefined);
            await acknowledged;
            controller.abort();
            await response;
            const stop = server.stop();
            release();
            await stop;
            const reopened = await open();
            const saved = await reopened.lookupResult(created.sessionId, "disconnect");
            expect(saved).toMatchObject({status: "played", version: 2});
            const fresh = new api.PokieDevServer(gameFactory(), {port: 0, transactionalRoundStore: reopened});
            try {
                const restarted = await fresh.start();
                const read = await fetch(`http://127.0.0.1:${restarted.port}/sessions/${created.sessionId}?debug=1`);
                expect(read.status).toBe(200);
                expect(await read.json()).toMatchObject({sessionId: created.sessionId, internal: {sessionVersion: 2}});
            } finally {
                await fresh.stop();
            }
        } finally {
            release();
            await server.stop();
        }
    });

    it("closes owned storage on a server listen failure and excludes outcome-source composition", async () => {
        const occupied = new api.PokieDevServer(gameFactory(), {port: 0});
        const address = await occupied.start();
        const store = await open();
        try {
            const failed = new api.PokieDevServer(gameFactory(), {host: address.host, port: address.port, transactionalRoundStore: store});
            await expect(failed.start()).rejects.toThrow();
            await expect(store.readSession("session")).rejects.toThrow("closing");
            expect(() => new api.OutcomeSourceDevServer({} as API.PokieProject, "base", {transactionalRoundStore: store})).toThrow("compensation path");
        } finally {
            await occupied.stop();
        }
    });

    it("projects HTTP conflicts/public/debug results, retains commit after disconnect and drains server ownership", async () => {
        const store = await open();
        await initialize(store);
        expect(() => new api.PokieDevServer(gameFactory(), {transactionalRoundStore: store, wallet: new api.InMemoryWallet()})).toThrow("incompatible");
        expect(() => Reflect.construct(api.SpinCommandHandler, [gameFactory(), store, new api.InMemoryWallet()])).toThrow("owns every participant");
        expect(() => Reflect.construct(api.SpinCommandHandler, [gameFactory(), store, undefined, new api.InMemoryIdempotencyRepository()])).toThrow("owns every participant");
        const server = worker("server");
        const ready = await server.wait("ready");
        const url = `http://127.0.0.1:${ready.port}/sessions/session/spin`;
        const body = {requestId: "request", expectedSessionVersion: 1, bet: 0.05, mode: "base"};
        const result = await fetch(url, {method: "POST", body: JSON.stringify(body)});
        const publicView = await result.json() as Record<string, unknown>;
        expect(result.status).toBe(200);
        expect(publicView.internal).toBeUndefined();
        const conflict = await fetch(url, {method: "POST", body: JSON.stringify({...body, bet: 7.5})});
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toMatchObject({code: "identity-conflict"});
        const retry = await fetch(`${url}?debug=1`, {method: "POST", body: JSON.stringify(body)});
        expect(await retry.json()).toMatchObject({...publicView, internal: {requestId: "request", sessionVersion: 2, debugData: {secret: "debug-only"}}});
        server.send("stop");
        await server.wait("done");
        await server.exited;
        expect(countCalculations()).toBe(1);
    });
});
