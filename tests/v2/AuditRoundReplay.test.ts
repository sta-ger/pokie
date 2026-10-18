import {weightedBlueprint} from "./fixtures/WeightedWholeSequenceGame.js";
import {renderBuiltGameModule} from "../../src/generated/renderBuiltGameModule.js";
import {ControllableDurableWallet} from "../server/wallet/fixtures/ControllableDurableWallet.js";
import fs from "node:fs";
import {EventEmitter} from "node:events";
import {Readable} from "node:stream";
import type {IncomingMessage, ServerResponse} from "node:http";
import path from "node:path";
import {execFileSync} from "node:child_process";
import ts from "typescript";
import crypto from "node:crypto";
import * as api from "@fromstan/pokie";
import {createOverscanGame, overscanBlueprint} from "./fixtures/OverscanGame.js";
import {transactionalRoundGame} from "./fixtures/TransactionalRoundGame.js";
import {auditCascadeGame} from "./fixtures/AuditCascadeGame.js";
import {emitPublicRuntime} from "./helpers/publicRuntime.js";
import {setTransactionBoundaryHook} from "../../src/server/storage/internal/transactionBoundary.js";
import {validateOperationRecord, validateRetryResult} from "../../src/runtime/internal/validateRecoveryData.js";

const feature: api.GameBlueprint = {
    manifest: {id: "audit-feature", name: "Audit feature", version: "1"}, reels: 3, rows: 1,
    availableBets: [0.05, 7.5, 1e-7], symbols: ["A", "S"], wilds: [], scatters: ["S"],
    paylines: [[0, 0, 0]], paytable: {A: {"3": 2}, S: {"1": 0}},
    reelStrips: Array.from({length: 3}, () => ["A", "A", "S", "A"]),
    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"1": 1, "2": 0, "3": 0}}},
    betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 5, forcedFreeGames: 3}],
};
const detached: api.AuditDisposition = {status: "calculated", sessionId: "original", durability: "detached"};
function recorded(game = createOverscanGame(), command: api.SessionCommand = {kind: "spin", roundId: "round", delivery: "composite"}, credits = 1000) {
    const session = game.createSession({seed: "7"});
    session.setCreditsAmount(credits);
    const descriptor = new api.ReplayRecorder().recordAudit(game, session, [command], detached, {seed: "7"});
    return {descriptor, session, game, audit: descriptor.audit!};
}
function rehash(recording: api.AuditRoundRecording): api.AuditRoundRecording {
    const {hash: _hash, ...body} = recording;
    return {...body, hash: api.computeAuditRoundHash(body)};
}
function played(result: api.SpinCommandResult) {
    if (result.status !== "played") throw new Error(`${result.status}: ${"reason" in result ? result.reason : "no result"}`);
    return result;
}

describe("canonical audited logical-round replay", () => {
    let runtime: ReturnType<typeof emitPublicRuntime>;
    beforeAll(() => {
        runtime = emitPublicRuntime();
        for (const name of ["AuditCascadeGame", "AuditRoundReplayProcess"]) {
            const source = fs.readFileSync(path.join(process.cwd(), `tests/v2/fixtures/${name}.ts`), "utf-8");
            for (const extension of ["mjs", "cjs"]) {
                fs.writeFileSync(path.join(runtime.directory, `${name}.${extension}`), ts.transpileModule(source, {
                    fileName: extension === "mjs" ? "fixture.mts" : "fixture.cts",
                    compilerOptions: {module: ts.ModuleKind.NodeNext, target: ts.ScriptTarget.ES2022},
                }).outputText.replace("./AuditCascadeGame.js", `./AuditCascadeGame.${extension}`));
            }
        }
    }, 60000);
    afterAll(() => runtime?.dispose());

    it("retains weighted variants in the actual CJS package and enumerates them from an ESM consumer", () => {
        fs.writeFileSync(path.join(runtime.directory, "weighted.cjs"), renderBuiltGameModule(weightedBlueprint, "2.0.0"));
        fs.writeFileSync(path.join(runtime.directory, "weighted-consumer.mjs"), `
import {generateExactWeightedOutcomeLibrary, WeightedOutcomeLibraryAnalyzer, ReplayRecorder, AuditRoundReplay} from "@fromstan/pokie";
import {createRequire} from "node:module";
const game = createRequire(import.meta.url)("./weighted.cjs");
const session = game.createSession({seed: 3});
const descriptor = new ReplayRecorder().recordAudit(game, session, [{kind: "spin", roundId: "formats", delivery: "stepwise"}], {status: "calculated", sessionId: "formats", durability: "detached"}, {seed: 3});
const {library} = await generateExactWeightedOutcomeLibrary({libraryId: "formats", game, pokieVersion: "2.0.0"});
console.log(JSON.stringify({rtp: new WeightedOutcomeLibraryAnalyzer().analyze(library).rtp, selections: descriptor.artifact.sequenceSelections, verification: new AuditRoundReplay().replay(game, descriptor.audit).verification}));
`);
        const output = execFileSync(process.execPath, [path.join(runtime.directory, "weighted-consumer.mjs")], {encoding: "utf8"});
        expect(JSON.parse(output)).toMatchObject({rtp: 1, verification: "verified", selections: [{reelIndex: 0, context: "logical:formats"}]});
    });

    it.each([0.05, 7.5, 1e-7])("JSON exports reproduce base/generated/visible/evaluated screens and next RNG operation in ESM/CJS processes at %s", bet => {
        const current = recorded(createOverscanGame(), {kind: "spin", delivery: "composite", roundId: "base", bet});
        const next = new api.ReplayRecorder().recordAudit(current.game, current.session, [{kind: "spin", delivery: "composite", roundId: "next", bet}], detached, {seed: "7"});
        for (const extension of ["mjs", "cjs"]) {
            const file = path.join(runtime.directory, "input.json");
            fs.writeFileSync(file, JSON.stringify({recording: current.audit, blueprint: overscanBlueprint, next: next.audit}));
            const result = JSON.parse(execFileSync(process.execPath, [path.join(runtime.directory, `AuditRoundReplayProcess.${extension}`), file], {encoding: "utf-8", timeout: 10000}));
            expect(result.pid).not.toBe(process.pid);
            expect(result).toMatchObject({status: "verified", completion: "completed", originalSessionId: "original", audit: JSON.parse(JSON.stringify(current.audit))});
        }
        expect(current.audit.deliveries[0].artifact?.generatedScreen?.[0]).toHaveLength(7);
        expect(current.audit.deliveries[0].artifact?.screen[0]).toHaveLength(3);
        expect(current.audit.deliveries[0].artifact?.provenance.pokieVersion).toBe("2.0.0");
        expect(new api.AuditRoundReplay().replay(current.game, current.audit).deliveries[0].artifact?.provenance.pokieVersion).toBe("2.0.0");
    });

    it.each([0.05, 7.5, 1e-7].flatMap(bet => ["independent", "atomic", "external"].map(composition => ({bet, composition}))))("exports generated losing settlement without rounding stakes ($composition, $bet)", async ({bet, composition}) => {
        const blueprint = {...overscanBlueprint, paytable: {A: {"5": 0}, B: {"5": 0}, W: {"5": 0}, S: {"2": 0, "3": 0, "5": 0}}};
        const game = createOverscanGame(blueprint),
            context = {seed: "7"};
        const session = game.createSession(context);
        session.setCreditsAmount(25);
        const initial = api.captureInitialPokieSessionState(context, session, undefined, false, game);
        const command: api.RepositoryCommand = {kind: "spin", sessionId: "losing", requestId: "loss", bet};
        let store: api.SqliteTransactionalRoundStore | api.SqliteExternalRoundStore | undefined;
        let provider: ControllableDurableWallet | undefined;
        try {
            let result: ReturnType<typeof played>;
            if (composition === "independent") {
                const sessions = new api.InMemorySessionRepository();
                await sessions.save("losing", initial);
                const wallet = new api.InMemoryWallet(25);
                result = played(await new api.SpinCommandHandler(game, sessions, wallet).execute(command));
                expect(await wallet.getBalance("losing")).toBe(25 - bet);
            } else {
                const filename = path.join(runtime.directory, `losing-${composition}-${bet}.sqlite`);
                if (composition === "external") {
                    provider = await ControllableDurableWallet.open(`${filename}-provider`);
                    await provider.setBalance("losing", 25);
                    store = await api.SqliteExternalRoundStore.open(filename, provider);
                } else store = await api.SqliteTransactionalRoundStore.open(filename);
                await store.initialize("losing", initial, game);
                result = played(await new api.SpinCommandHandler(game, store).execute(command));
            }
            expect(result).toMatchObject({win: 0, stake: bet, credits: 25 - bet});
            const delivery = result.audit!.deliveries[0];
            expect(delivery.result.stake).toBe(bet);
            expect(delivery.disposition.walletPayout).toBe(delivery.after.credits - delivery.before.credits + bet);
            expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(result.audit))).verification).toBe("verified");
        } finally {
            await store?.close();
            provider?.close();
        }
    });

    it.each(["createSession", "fromSessionState", "setBet", "setCreditsAmount"] as const)("wraps throwing reconstruction hook %s with its delivery path", hook => {
        const current = recorded(createOverscanGame(feature), {kind: "spin", roundId: "hooks", mode: "buy", delivery: "composite"});
        const create = current.game.createSession.bind(current.game);
        let index = 0;
        const game = {...current.game, createSession(context?: api.PokieGameContext) {
            const session = create(context);
            if (index++ === 1) {
                if (hook === "createSession") throw new Error("reconstruction failed");
                Object.assign(session, {[hook]: () => {
                    throw new Error("reconstruction failed");
                }});
            }
            return session;
        }};
        expect(() => new api.AuditRoundReplay().replay(game, current.audit)).toThrow("audit-execution-mismatch at deliveries[1]: reconstruction failed");
    });

    it.each([false, true])("retains actual compensated/recovered audit and rejects original corruption (recovery=%s)", async recover => {
        const game = createOverscanGame(),
            context = {seed: "7"};
        const sessions = new api.InMemorySessionRepository(),
            wallet = new api.InMemoryWallet(25),
            history = new api.InMemoryIdempotencyRepository<api.SpinCommandResult>(),
            log = new api.InMemorySpinOperationLog();
        const session = game.createSession(context);
        session.setCreditsAmount(25);
        await sessions.save("lifecycle", api.captureInitialPokieSessionState(context, session, undefined, false, game));
        jest.spyOn(history, "save").mockRejectedValueOnce(new Error("result-save failed"));
        if (recover) {
            jest.spyOn(wallet, "reverse").mockRejectedValue(new Error("reversal failed"));
            jest.spyOn(sessions, "save").mockRejectedValueOnce(new Error("state restore failed"));
        }
        const command: api.RepositoryCommand = {kind: "spin", sessionId: "lifecycle", requestId: "request"};
        const handler = new api.SpinCommandHandler(game, sessions, wallet, history, log, true);
        expect(await handler.execute(command)).toMatchObject({status: "storage-error"});
        const record = (await log.load("lifecycle", "request"))!;
        expect(record.checkpoint).toBe(recover ? "session-saved" : "compensated");
        expect(record.capturedResult!.audit!.deliveries[0].disposition.status).toBe(recover ? "pending" : "compensated");
        expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(record.capturedResult!.audit))).verification).toBe("verified");
        if (!recover) {
            expect(await wallet.getBalance("lifecycle")).toBeCloseTo(25, 12);
            const service = new api.SpinReconciliationService(wallet, sessions, history, log, true, false, 0, undefined, undefined, game);
            expect(await service.reconcileOne("lifecycle", "request")).toMatchObject({status: "no-action-needed"});
            expect(await log.load("lifecycle", "request")).toEqual(record);
            return;
        }
        const reconcile = new api.SpinReconciliationService(wallet, sessions, history, log, true, false, 0, undefined, undefined, game);
        const corrupt = JSON.parse(JSON.stringify(record)) as api.SpinOperationRecord;
        (corrupt.capturedResult!.audit!.deliveries[0].disposition as {requestId: string}).requestId = "forged";
        await log.record(corrupt);
        const save = jest.spyOn(history, "save"),
            state = await sessions.load("lifecycle"),
            balance = await wallet.getBalance("lifecycle");
        save.mockClear();
        expect(await reconcile.reconcileOne("lifecycle", "request")).toMatchObject({status: "manual-recovery-required", reason: expect.stringContaining("audit-hash")});
        expect(save).not.toHaveBeenCalled();
        expect(await log.load("lifecycle", "request")).toEqual(corrupt);
        expect(await sessions.load("lifecycle")).toEqual(state);
        expect(await wallet.getBalance("lifecycle")).toBe(balance);
        const substituted = {...corrupt, capturedResult: {...corrupt.capturedResult!, audit: rehash(corrupt.capturedResult!.audit!)}};
        await log.record(substituted);
        expect(await reconcile.reconcileOne("lifecycle", "request")).toMatchObject({status: "manual-recovery-required", reason: expect.stringContaining("audit-identity")});
        const foreignAttempt = JSON.parse(JSON.stringify(record)) as api.SpinOperationRecord;
        (foreignAttempt.capturedResult!.audit!.deliveries[0].disposition as {attemptId: string}).attemptId = "other-attempt";
        await log.record({...foreignAttempt, capturedResult: {...foreignAttempt.capturedResult!, audit: rehash(foreignAttempt.capturedResult!.audit!)}});
        expect(await reconcile.reconcileOne("lifecycle", "request")).toMatchObject({status: "manual-recovery-required", reason: expect.stringContaining("Captured audit identity")});
        expect(save).not.toHaveBeenCalled();
        await log.record(record);
        const resumed = await reconcile.reconcileOne("lifecycle", "request");
        expect(resumed.status).toBe("resumed");
        const retained = (await log.load("lifecycle", "request"))!;
        const result = played((await history.load("lifecycle", "request"))!);
        expect(retained.checkpoint).toBe("committed");
        expect(retained.capturedResult!.audit).toEqual(result.audit);
        expect(result.audit!.deliveries[0].disposition.status).toBe("committed");
        expect(new api.AuditRoundReplay().replay(game, result.audit!).verification).toBe("verified");
    });

    it.each([
        {failure: "execution-error", audit: true}, {failure: "blocked", audit: true},
        {failure: "execution-error", audit: false}, {failure: "blocked", audit: false},
    ])("translates an authentic $failure prefix with internal evidence only on opt-in (audit=$audit, no listener)", async ({failure, audit}) => {
        let fail = true;
        let calculations = 0;
        const fixture = transactionalRoundGame(() => {
            calculations++;
            if (failure === "execution-error" && fail && calculations > 1) throw new Error("successor failed");
        });
        const game: api.PokieGame = {...fixture, ...(audit ? {getConfigHash: () => "adapter-prefix-model"} : {}),
            createSession: context => {
                const session = fixture.createSession(context);
                const canPlay = session.canPlayNextGame.bind(session);
                session.canPlayNextGame = () => !(failure === "blocked" && fail && calculations >= 1) && canPlay();
                return session;
            }};
        const sessions = new api.InMemorySessionRepository();
        const wallet = new api.InMemoryWallet(25);
        const session = game.createSession({seed: "7"});
        session.setCreditsAmount(25);
        await sessions.save("adapter", api.captureInitialPokieSessionState({seed: "7"}, session, undefined, true, game));
        const server = new api.PokieDevServer(game, {sessionRepository: sessions, wallet});
        const handler = Reflect.get(server, "spinCommandHandler") as api.SpinCommandHandler;
        const execute = jest.spyOn(handler, "execute");
        const command = {requestId: "entry", roundId: "round", delivery: "composite"};
        // Exercise the actual adapter, body parser and serializer without opening an HTTP listener.
        const translate = async (includeInternal: boolean) => {
            const request = Readable.from([Buffer.from(JSON.stringify(command))]) as unknown as IncomingMessage;
            const response = Object.assign(new EventEmitter(), {writeHead: jest.fn(), end: jest.fn()});
            await Reflect.apply(Reflect.get(server, "handleSpin"), server, ["adapter", request, response as unknown as ServerResponse, includeInternal]);
            return {status: response.writeHead.mock.calls[0][0], body: JSON.parse(response.end.mock.calls[0][0])};
        };
        try {
            const publicResponse = await translate(false);
            expect(publicResponse).toMatchObject({status: failure === "blocked" ? 400 : 500, body: {code: failure,
                committedProgress: {roundId: "round", cursor: 1, requestId: "entry", nextRequestId: "entry:subround:1"}, committedSession: {logicalRound: {status: "pending", cursor: 1}}}});
            const prefix = (await execute.mock.results[0].value).committedResult!;
            expect(publicResponse.body.committedSession).not.toHaveProperty("internal");
            for (const hidden of ["audit", "auditUnavailableReason", "stateBefore", "stateAfter", "featureState", "executable", "context", "rng", "debugData"]) {
                expect(publicResponse.body.committedSession).not.toHaveProperty(hidden);
            }
            const debugResponse = await translate(true);
            expect(debugResponse.body.committedSession.internal).toEqual(expect.objectContaining({stateBefore: prefix.previousState, stateAfter: prefix.state, requestId: "entry", sessionVersion: prefix.version,
                ...(audit ? {audit: prefix.audit} : {auditUnavailableReason: prefix.auditUnavailableReason})}));
            if (audit) {
                expect(prefix.audit!.deliveries).toHaveLength(1);
                expect(debugResponse.body.committedSession.internal.audit).toEqual(prefix.audit);
                expect(new api.ReplayRecorder().replay({...transactionalRoundGame(), getConfigHash: game.getConfigHash}, debugResponse.body.committedSession.internal.audit)).toMatchObject({auditStatus: "verified", auditCompletion: "pending", audit: prefix.audit});
            } else {
                expect(prefix.auditUnavailableReason).toContain("Exact audit requires");
                expect(debugResponse.body.committedSession.internal).not.toHaveProperty("audit");
            }
            fail = false;
            const resumed = await translate(true);
            expect(resumed).toMatchObject({status: 200, body: {logicalRound: {status: "completed", cursor: 3}}});
            if (audit) expect(resumed.body.internal.audit.deliveries[0]).toEqual(prefix.audit!.deliveries[0]);
            const beforeRetry = calculations;
            const beforeState = await sessions.loadVersioned("adapter");
            const beforeBalance = await wallet.getBalance("adapter");
            expect((await translate(true)).body).toEqual(resumed.body);
            expect(calculations).toBe(beforeRetry);
            expect(await sessions.loadVersioned("adapter")).toEqual(beforeState);
            expect(await wallet.getBalance("adapter")).toBe(beforeBalance);
            expect((await translate(false)).body).not.toHaveProperty("internal");
        } finally {
            execute.mockRestore();
            await server.stop();
        }
    });

    it("rejects a corrupted retained prefix before continuation execution or rehashing", async () => {
        const calculate = jest.fn();
        const game = {...transactionalRoundGame(calculate), getConfigHash: () => "prefix-model"};
        const sessions = new api.InMemorySessionRepository(),
            history = new api.InMemoryIdempotencyRepository<api.SpinCommandResult>(),
            wallet = new api.InMemoryWallet(25);
        const session = game.createSession({seed: "7"});
        session.setCreditsAmount(25);
        await sessions.save("prefix", api.captureInitialPokieSessionState({seed: "7"}, session, undefined, false, game));
        const handler = new api.SpinCommandHandler(game, sessions, wallet, history);
        const first = played(await handler.execute({kind: "spin", sessionId: "prefix", requestId: "entry", roundId: "round", delivery: "stepwise"}));
        const state = await sessions.load("prefix"),
            balance = await wallet.getBalance("prefix");
        calculate.mockClear();
        jest.spyOn(history, "loadRound").mockResolvedValue({...first, audit: {...first.audit!, hash: "sha256:" + "0".repeat(64)}});
        expect(await handler.execute({kind: "spin", sessionId: "prefix", requestId: "next", continuation: {roundId: "round", cursor: 1}, delivery: "stepwise"})).toMatchObject({status: "corrupt-state", reason: expect.stringContaining("audit-hash")});
        expect(calculate).not.toHaveBeenCalled();
        expect(await history.load("prefix", "next")).toBeUndefined();
        expect(await sessions.load("prefix")).toEqual(state);
        expect(await wallet.getBalance("prefix")).toBe(balance);
    });

    it.each([false, true])("binds cached and captured assigned revisions before historical delivery/reconciliation (saved stage=%s)", async savedStage => {
        const calculate = jest.fn();
        const game = savedStage ? auditCascadeGame(calculate) : createOverscanGame();
        const sessions = new api.InMemorySessionRepository(),
            history = new api.InMemoryIdempotencyRepository<api.SpinCommandResult>(),
            log = new api.InMemorySpinOperationLog(),
            wallet = new api.InMemoryWallet(25);
        const session = game.createSession({seed: "7"});
        session.setCreditsAmount(25);
        await sessions.save("revision", api.captureInitialPokieSessionState({seed: "7"}, session, undefined, false, game));
        const handler = new api.SpinCommandHandler(game, sessions, wallet, history, log);
        let command: api.RepositoryCommand = {kind: "spin", sessionId: "revision", requestId: "entry", roundId: "revision-round", delivery: "stepwise"};
        let result = played(await handler.execute(command));
        if (savedStage) {
            command = {kind: "spin", sessionId: "revision", requestId: "stage", delivery: "stepwise", continuation: {roundId: "revision-round", cursor: result.state.logicalRound!.deliveryCursor}};
            result = played(await handler.execute(command));
            expect(result.deliveryOnly).toBe(true);
        }
        const record = (await log.load("revision", command.requestId!))!;
        expect(validateRetryResult(result, game, "revision", command.requestId!)).toBeUndefined();
        expect(validateOperationRecord(record, game, "revision", command.requestId!)).toBeUndefined();
        const pendingAudit = api.updateAuditDisposition(record.capturedResult!.audit!, {status: "pending"});
        const presave = {...record, checkpoint: "settled" as const, capturedResult: {...record.capturedResult!, newVersion: undefined, audit: pendingAudit}};
        expect(validateOperationRecord(presave, game, "revision", command.requestId!)).toBeUndefined();
        expect(validateOperationRecord({...presave, capturedResult: {...presave.capturedResult, newVersion: 999}}, game, "revision", command.requestId!)).toMatchObject({status: "corrupt-state", reason: "Audit and retained result revision disagree."});
        const compensated = {...presave, checkpoint: "compensated" as const, capturedResult: {...presave.capturedResult, audit: api.updateAuditDisposition(pendingAudit, {status: "compensated"})}};
        expect(validateOperationRecord(compensated, game, "revision", command.requestId!)).toBeUndefined();
        let progress = result;
        while (progress.state.logicalRound?.status === "pending") progress = played(await handler.execute({kind: "spin", sessionId: "revision", requestId: `finish:${progress.version}`, delivery: "stepwise", continuation: {roundId: "revision-round", cursor: progress.state.logicalRound.deliveryCursor}}));
        played(await handler.execute({kind: "spin", sessionId: "revision", requestId: "later", roundId: "later", delivery: "composite"}));
        expect(await handler.execute(command)).toEqual(result);
        const before = await sessions.loadVersioned("revision"),
            balance = await wallet.getBalance("revision"),
            mutations = [jest.spyOn(wallet, "debit"), jest.spyOn(wallet, "credit"), jest.spyOn(wallet, "reverse")],
            save = jest.spyOn(history, "save");
        calculate.mockClear();
        for (const version of [999, undefined]) {
            await history.save("revision", command.requestId!, {...result, version});
            save.mockClear();
            expect(await handler.execute(command)).toMatchObject({status: "corrupt-state", reason: "Audit and retained result revision disagree."});
            expect(save).not.toHaveBeenCalled();
        }
        await history.save("revision", command.requestId!, result);
        const reconcile = new api.SpinReconciliationService(wallet, sessions, history, log, true, false, 0, undefined, undefined, game);
        for (const checkpoint of ["session-saved", "committed", "compensated"] as const) {
            for (const newVersion of [999, undefined]) {
                // Compensation may legitimately preserve an unassigned pre-save revision.
                if (checkpoint === "compensated" && newVersion === undefined) continue;
                const audit = api.updateAuditDisposition(record.capturedResult!.audit!, {status: checkpoint === "session-saved" ? "pending" : checkpoint});
                const corrupt = {...record, checkpoint, capturedResult: {...record.capturedResult!, newVersion, audit}};
                await log.record(corrupt);
                save.mockClear();
                expect(await reconcile.reconcileOne("revision", command.requestId!)).toMatchObject({status: "manual-recovery-required", reason: "Audit and retained result revision disagree."});
                expect(await log.load("revision", command.requestId!)).toEqual(corrupt);
                expect(save).not.toHaveBeenCalled();
            }
        }
        expect(calculate).not.toHaveBeenCalled();
        expect(await sessions.loadVersioned("revision")).toEqual(before);
        expect(await wallet.getBalance("revision")).toBe(balance);
        for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
        await log.record(record);
        expect(await handler.execute(command)).toEqual(result);
    });

    it.each([false, true])("recovers an authentic pre-save capture without an assigned newVersion (saved stage=%s)", async savedStage => {
        const calculate = jest.fn();
        const game = savedStage ? auditCascadeGame(calculate) : createOverscanGame();
        const sessions = new api.InMemorySessionRepository(),
            history = new api.InMemoryIdempotencyRepository<api.SpinCommandResult>(),
            log = new api.InMemorySpinOperationLog(),
            wallet = new api.InMemoryWallet(25);
        const session = game.createSession({seed: "7"});
        session.setCreditsAmount(25);
        await sessions.save("presave", api.captureInitialPokieSessionState({seed: "7"}, session, undefined, false, game));
        const handler = new api.SpinCommandHandler(game, sessions, wallet, history, log, true);
        let command: api.RepositoryCommand = {kind: "spin", sessionId: "presave", requestId: "entry", roundId: "presave-round", delivery: "stepwise"};
        if (savedStage) {
            const entry = played(await handler.execute(command));
            command = {kind: "spin", sessionId: "presave", requestId: "stage", delivery: "stepwise", continuation: {roundId: "presave-round", cursor: entry.state.logicalRound!.deliveryCursor}};
        }
        jest.spyOn(sessions, "saveVersioned").mockRejectedValueOnce(new Error("save failed"));
        if (!savedStage) jest.spyOn(wallet, "reverse").mockRejectedValue(new Error("reverse failed"));
        expect(await handler.execute(command)).toMatchObject({status: "storage-error"});
        const record = (await log.load("presave", command.requestId!))!;
        expect(record.checkpoint).toBe("settled");
        expect(record.capturedResult!.newVersion).toBeUndefined();
        const deliveries = record.capturedResult!.audit!.deliveries;
        expect(deliveries[deliveries.length - 1].disposition.version).toBe(record.expectedVersion! + 1);
        expect(validateOperationRecord(record, game, "presave", command.requestId!)).toBeUndefined();
        calculate.mockClear();
        const reconcile = new api.SpinReconciliationService(wallet, sessions, history, log, true, false, 0, undefined, undefined, game);
        expect(await reconcile.reconcileOne("presave", command.requestId!)).toMatchObject({status: "resumed"});
        const result = played((await history.load("presave", command.requestId!))!);
        expect(result.version).toBe(record.expectedVersion! + 1);
        expect(validateRetryResult(result, game, "presave", command.requestId!)).toBeUndefined();
        expect((await log.load("presave", command.requestId!))!.capturedResult!.audit).toEqual(result.audit);
        expect(calculate).not.toHaveBeenCalled();
        expect(await handler.execute(command)).toEqual(result);
    });

    it("preserves revision-free audit results from an unversioned repository", async () => {
        const game = createOverscanGame(),
            sessions = new api.InMemorySessionRepository(),
            wallet = new api.InMemoryWallet(25),
            history = new api.InMemoryIdempotencyRepository<api.SpinCommandResult>(),
            log = new api.InMemorySpinOperationLog();
        const session = game.createSession({seed: "7"});
        session.setCreditsAmount(25);
        await sessions.save("unversioned", api.captureInitialPokieSessionState({seed: "7"}, session, undefined, false, game));
        const repository = {load: sessions.load.bind(sessions), save: sessions.save.bind(sessions)};
        const handler = new api.SpinCommandHandler(game, repository, wallet, history, log);
        const command: api.RepositoryCommand = {kind: "spin", sessionId: "unversioned", requestId: "request"};
        const result = played(await handler.execute(command));
        const record = (await log.load("unversioned", "request"))!;
        expect(result.version).toBeUndefined();
        expect(result.audit!.deliveries[0].disposition.version).toBeUndefined();
        expect(record.capturedResult!.newVersion).toBeUndefined();
        expect(validateRetryResult(result, game, "unversioned", "request")).toBeUndefined();
        expect(validateOperationRecord(record, game, "unversioned", "request")).toBeUndefined();
        expect(await handler.execute(command)).toEqual(result);
        const reconcile = new api.SpinReconciliationService(wallet, repository, history, log, true, false, 0, undefined, undefined, game);
        expect(await reconcile.reconcileOne("unversioned", "request")).toMatchObject({status: "already-committed"});
        expect(await history.load("unversioned", "request")).toEqual(result);
    });

    it("refuses to rehash corrupted evidence when changing disposition", () => {
        const current = recorded();
        expect(() => api.updateAuditDisposition({...current.audit, hash: "sha256:" + "0".repeat(64)}, {status: "committed"})).toThrow("audit-hash");
    });

    it("records free-game entry, continuations, retriggers and deferred bank without synthetic funding", () => {
        const current = recorded(createOverscanGame(feature), {kind: "spin", mode: "buy", bet: 0.05, delivery: "composite", roundId: "free"}, 25);
        expect(current.audit.deliveries[0].before.credits).toBe(25);
        const round = current.descriptor.logicalRound!;
        expect(round.cursor).toBeGreaterThanOrEqual(3);
        expect(round.subrounds.slice(0, -1).every(step => step.payout === 0)).toBe(true);
        const file = path.join(runtime.directory, "feature.json");
        fs.writeFileSync(file, JSON.stringify({recording: current.audit, blueprint: feature}));
        expect(JSON.parse(execFileSync(process.execPath, [path.join(runtime.directory, "AuditRoundReplayProcess.mjs"), file], {encoding: "utf-8", timeout: 10000}))).toMatchObject({status: "verified", completion: "completed"});
    });

    it.each([{}, {maxCascadeSteps: 1, onMaxCascadeStepsExceeded: "stop" as const}])("reproduces cascade mathematical steps and exhausted refill in a fresh process (%j)", options => {
        const current = recorded(auditCascadeGame(() => undefined, options));
        const file = path.join(runtime.directory, "cascade.json");
        fs.writeFileSync(file, JSON.stringify({recording: current.audit, cascadeOptions: options}));
        const result = JSON.parse(execFileSync(process.execPath, [path.join(runtime.directory, "AuditRoundReplayProcess.cjs"), file], {encoding: "utf-8", timeout: 10000}));
        expect(result).toMatchObject({status: "verified", completion: options.maxCascadeSteps ? "exhausted" : "completed"});
        if (options.maxCascadeSteps) expect(current.descriptor.logicalRound!.subrounds[0].finalScreen).toBeDefined();
    });

    it("restores between durable steps, retains historical retries after later rounds, and exports after closing the live store", async () => {
        const filename = path.join(runtime.directory, "audit.sqlite");
        const game = createOverscanGame(feature);
        let store = await api.SqliteTransactionalRoundStore.open(filename);
        const context = {seed: "7"};
        const commands: api.RepositoryCommand[] = [];
        const results: api.SpinCommandResult[] = [];
        try {
            await store.initialize("session", api.captureInitialPokieSessionState(context, game.createSession(context), undefined, false, game), game);
            let command: api.RepositoryCommand = {kind: "spin", sessionId: "session", requestId: "entry", roundId: "durable", delivery: "stepwise", mode: "buy", bet: 7.5, expectedVersion: 1};
            let result = played(await new api.SpinCommandHandler(game, store).execute(command));
            for (;;) {
                commands.push(command);
                results.push(result);
                expect(result.audit).toBeDefined();
                expect(new api.AuditRoundReplay().replay(game, JSON.parse(JSON.stringify(result.audit))).verification).toBe("verified");
                if (result.state.logicalRound?.status !== "pending") break;
                await store.close();
                store = await api.SqliteTransactionalRoundStore.open(filename);
                command = {kind: "spin", sessionId: "session", requestId: `next:${result.version}`, expectedVersion: result.version, delivery: "stepwise", continuation: {roundId: "durable", cursor: result.state.logicalRound.deliveryCursor}};
                result = played(await new api.SpinCommandHandler(game, store).execute(command));
            }
            expect(result.audit!.deliveries).toHaveLength(results.length);
            expect(result.audit!.deliveries[result.audit!.deliveries.length - 1].disposition).toMatchObject({status: "committed", durability: "atomic-local", requestId: result.requestId, version: result.version});
            const later = played(await new api.SpinCommandHandler(game, store).execute({kind: "spin", sessionId: "session", requestId: "later", delivery: "composite", roundId: "later"}));
            const balance = await store.getBalance("session"),
                state = await store.readSession("session");
            for (const [index, saved] of commands.entries()) expect(await new api.SpinCommandHandler(game, store).execute(saved)).toEqual(results[index]);
            expect(await new api.SpinCommandHandler(game, store).execute({...commands[0], requestId: "foreign", expectedVersion: undefined})).toMatchObject({status: "identity-conflict"});
            new api.AuditRoundReplay().replay(game, result.audit!);
            expect(await store.getBalance("session")).toBe(balance);
            expect(await store.readSession("session")).toEqual(state);
            expect(later.state.logicalRoundIds).toBeUndefined();
            await store.close();
            const file = path.join(runtime.directory, "durable.json");
            fs.writeFileSync(file, JSON.stringify({recording: result.audit, blueprint: feature}));
            expect(JSON.parse(execFileSync(process.execPath, [path.join(runtime.directory, "AuditRoundReplayProcess.mjs"), file], {encoding: "utf-8", timeout: 10000})).status).toBe("verified");
        } finally {
            await store.close();
        }
    });

    it("exports external-provider response-loss recovery with its original transactions; replay leaves both stores unchanged", async () => {
        const provider = await ControllableDurableWallet.open(path.join(runtime.directory, "audit-provider.sqlite"));
        const filename = path.join(runtime.directory, "audit-external.sqlite");
        let store = await api.SqliteExternalRoundStore.open(filename, provider);
        const game = createOverscanGame(feature),
            context = {seed: "7"};
        const command: api.RepositoryCommand = {kind: "spin", sessionId: "external", requestId: "entry", delivery: "stepwise", roundId: "external-round", mode: "buy"};
        try {
            const initial = api.captureInitialPokieSessionState(context, game.createSession(context), undefined, false, game);
            await provider.setBalance("external", initial.credits!);
            await store.initialize("external", initial, game);
            provider.fault = "after-debit";
            expect(await new api.SpinCommandHandler(game, store).execute(command)).toMatchObject({status: "recovery-required"});
            provider.fault = undefined;
            await store.close();
            store = await api.SqliteExternalRoundStore.open(filename, provider);
            let result = played(await new api.SpinCommandHandler(game, store).execute(command));
            while (result.state.logicalRound?.status === "pending") {
                result = played(await new api.SpinCommandHandler(game, store).execute({kind: "spin", sessionId: "external", requestId: `next:${result.version}`, expectedVersion: result.version,
                    delivery: "stepwise", continuation: {roundId: "external-round", cursor: result.state.logicalRound.deliveryCursor}}));
            }
            const before = await store.readSession("external"),
                transactions = provider.transactions("external"),
                balance = await provider.getBalance("external");
            const first = result.audit!.deliveries[0];
            expect(first.disposition).toMatchObject({status: "committed", durability: "external-provider", requestId: "entry"});
            expect(transactions.map(transaction => transaction.id)).toEqual(expect.arrayContaining([first.disposition.debitTransactionId, first.disposition.creditTransactionId]));
            new api.AuditRoundReplay().replay(game, result.audit!);
            expect(await store.readSession("external")).toEqual(before);
            expect(await provider.getBalance("external")).toBe(balance);
            expect(provider.transactions("external")).toEqual(transactions);
            const historical = played(await new api.SpinCommandHandler(game, store).execute(command));
            expect(historical.audit).toEqual(api.buildAuditRoundRecording(game, context, [first]));
            expect(result.state.logicalRoundIds).toBeUndefined();
            for (const status of ["pending", "compensated", "rejected", "recovery-required"] as const) {
                const evidence = api.updateAuditDisposition(result.audit!, {status});
                expect(new api.AuditRoundReplay().replay(game, evidence).recording.deliveries[evidence.deliveries.length - 1].disposition.status).toBe(status);
            }
            expect(provider.transactions("external")).toEqual(transactions);
        } finally {
            await store.close();
            provider.close();
        }
    });

    it("failed atomic publication leaves no retained audit or wallet mutation", async () => {
        const store = await api.SqliteTransactionalRoundStore.open(path.join(runtime.directory, "failed.sqlite"));
        const game = createOverscanGame(feature);
        try {
            await store.initialize("failure", api.captureInitialPokieSessionState({seed: "7"}, game.createSession({seed: "7"}), undefined, false, game), game);
            const before = await store.readSession("failure"),
                balance = await store.getBalance("failure");
            setTransactionBoundaryHook(store, boundary => {
                if (boundary === "before:commit") throw new Error("publication failure");
                return Promise.resolve();
            });
            expect(await new api.SpinCommandHandler(game, store).execute({kind: "spin", sessionId: "failure", requestId: "failed", delivery: "stepwise", roundId: "failed"})).toMatchObject({status: "storage-error"});
            expect(await store.lookupResult("failure", "failed")).toBeUndefined();
            expect(await store.readSession("failure")).toEqual(before);
            expect(await store.getBalance("failure")).toBe(balance);
        } finally {
            setTransactionBoundaryHook(store, () => Promise.resolve());
            await store.close();
        }
    });

    it.each([
        ["command", "audit-command", (r: api.AuditRoundRecording) => {
            (r.deliveries[0].command as {kind: string}).kind = "credit";
        }],
        ["model", "audit-identity", (r: api.AuditRoundRecording) => {
            (r.identity as {modelHash: string}).modelHash = "other";
        }],
        ["schema", "audit-version", (r: api.AuditRoundRecording) => {
            (r as {stateSchema: unknown}).stateSchema = {kind: "base"};
        }],
        ["version", "audit-version", (r: api.AuditRoundRecording) => {
            (r as {schemaVersion: string}).schemaVersion = "future";
        }],
        ["runtime", "audit-version", (r: api.AuditRoundRecording) => {
            (r as {runtimeVersion: string}).runtimeVersion = "future";
        }],
        ["RNG profile", "audit-version", (r: api.AuditRoundRecording) => {
            (r as {rngProfile: string}).rngProfile = "other";
        }],
        ["RNG state", "audit-state", (r: api.AuditRoundRecording) => {
            (r.deliveries[0].before.state as {rngState: number}).rngState = -1;
        }],
        ["duplicated delivery", "audit-order", (r: api.AuditRoundRecording) => {
            (r.deliveries as api.AuditDelivery[]).push(r.deliveries[0]);
        }],
        ["request identity", "audit-identity", (r: api.AuditRoundRecording) => {
            (r.deliveries[0].command as api.SessionCommand & {sessionId: string}).sessionId = "foreign";
        }],
        ["result", "audit-state", (r: api.AuditRoundRecording) => {
            (r.deliveries[0].result as {credits: number}).credits += 1;
        }],
        ["evaluated screen", "audit-artifact", (r: api.AuditRoundRecording) => {
            (r.deliveries[0].artifact!.steps[0].screen[0] as string[])[0] = "forged";
        }],
    ] as const)("rejects independently rehashed corruption of %s (%s)", (_dimension, code, mutate) => {
        const current = recorded();
        const corrupt = JSON.parse(JSON.stringify(current.audit)) as api.AuditRoundRecording;
        mutate(corrupt);
        expect(() => new api.AuditRoundReplay().replay(current.game, rehash(corrupt))).toThrow(code);
    });

    it("rejects hash-valid altered inputs/output through reproduction, identifies field locations and validates outer descriptor", () => {
        const current = recorded();
        const mutate = JSON.parse(JSON.stringify(current.audit)) as api.AuditRoundRecording;
        (mutate.deliveries[0].before.state as {rngState: number}).rngState = 123;
        expect(() => new api.AuditRoundReplay().replay(current.game, rehash(mutate))).toThrow(/audit-execution-mismatch at deliveries\[0\]/);
        expect(() => api.validateAuditReplayDescriptor({...current.descriptor, totalWin: 123})).toThrow(/totalWin/);
        expect(() => api.validateAuditRoundRecording({...current.audit, hash: "bad"})).toThrow("audit-hash");
        expect(() => api.validateAuditRoundRecording({...current.audit, hash: undefined})).toThrow("audit-structure");
        const {hash, ...body} = current.audit;
        expect(hash).toBe(`sha256:${crypto.createHash("sha256").update(JSON.stringify(api.toCanonicalJson(body))).digest("hex")}`);
        expect(api.computeAuditRoundHash({...body, identity: {...body.identity}})).toBe(hash);
    });

    it("requires custom model authority and complete codecs, rejects throwing/nonserializable codecs", () => {
        const game = transactionalRoundGame();
        expect(() => recorded(game)).toThrow("audit-codec-unsupported");
        const supported = {...game, getConfigHash: () => "custom-model-v1"};
        const current = recorded(supported);
        expect(new api.AuditRoundReplay().replay(supported, current.audit).verification).toBe("verified");
        const session = supported.createSession({seed: 7});
        const codec = session as api.GameSessionHandling & api.ConvertableToSessionState;
        jest.spyOn(codec, "toSessionState").mockImplementation(() => {
            throw new Error("codec failure");
        });
        expect(() => api.captureAuditBoundary(session)).toThrow("codec failure");
        jest.spyOn(codec, "toSessionState").mockReturnValue({invalid: NaN});
        expect(() => api.captureAuditBoundary(session)).toThrow(/finite/);
        jest.spyOn(codec, "toSessionState").mockReturnValue({invalid: () => 1});
        expect(() => api.captureAuditBoundary(session)).toThrow(/function/);
    });

    it("captures direct composite boundaries and returns the original audit after later rounds without drawing again", () => {
        const game = createOverscanGame(feature),
            session = game.createSession({seed: "7"}),
            recorder = new api.ReplayRecorder();
        const entry: api.SessionCommand = {kind: "spin", delivery: "composite", roundId: "retained", mode: "buy"};
        const original = recorder.recordAudit(game, session, [entry], detached, {seed: "7"});
        expect(original.audit!.deliveries.length).toBeGreaterThanOrEqual(3);
        expect(original.audit!.deliveries[0].command).toEqual(entry);
        expect(original.audit!.deliveries.every(delivery => delivery.execution === "accepted-boundary")).toBe(true);
        recorder.recordAudit(game, session, [{kind: "spin", delivery: "composite", roundId: "later"}], detached, {seed: "7"});
        const state = api.captureAuditBoundary(session),
            play = jest.spyOn(session, "play");
        expect(recorder.recordAudit(game, session, [entry], detached, {seed: "7"})).toEqual(original);
        expect(play).not.toHaveBeenCalled();
        expect(api.captureAuditBoundary(session)).toEqual(state);
        expect(new api.AuditRoundReplay().replay(game, original.audit!).verification).toBe("verified");
        recorder.releaseAuditSession(session);
    });

    it.each([1, 2])("recovers generated evidence after transient capture failure at delivery %s for fresh ESM/CJS replay", failedDelivery => {
        const blueprint = {...feature, reelStrips: Array.from({length: 3}, () => ["A"])},
            game = createOverscanGame(blueprint),
            context = {seed: "7"},
            command: api.SessionCommand = {kind: "spin", delivery: "composite", roundId: "capture", mode: "buy", maxSubrounds: 5},
            reference = recorded(game, command),
            session = game.createSession(context),
            codec = session as api.GameSessionHandling & api.ConvertableToSessionState,
            capture = codec.toSessionState.bind(codec),
            play = jest.spyOn(session, "play"),
            recorder = new api.ReplayRecorder(5);
        session.setCreditsAmount(1000);
        let failed = false;
        jest.spyOn(codec, "toSessionState").mockImplementation(() => {
            if (play.mock.calls.length === failedDelivery && !failed) {
                failed = true;
                throw new Error("post-acceptance capture failure");
            }
            return capture();
        });
        const descriptor = recorder.recordAudit(game, session, [command], detached, context);
        expect(failed).toBe(true);
        expect(descriptor.audit!.deliveries).toHaveLength(reference.audit.deliveries.length);
        expect(play).toHaveBeenCalledTimes(reference.audit.deliveries.length);
        expect(descriptor.audit!.deliveries.map(({command, before, after, result, artifact}) => ({command, before, after, result, artifact}))).toEqual(
            reference.audit.deliveries.map(({command, before, after, result, artifact}) => ({command, before, after, result, artifact})));
        expect(recorder.recordAudit(game, session, [command], detached, context)).toBe(descriptor);
        recorder.releaseAuditSession(session);
        for (const extension of ["mjs", "cjs"]) {
            const file = path.join(runtime.directory, "capture-input.json");
            fs.writeFileSync(file, JSON.stringify({recording: descriptor.audit, blueprint}));
            const result = JSON.parse(execFileSync(process.execPath, [path.join(runtime.directory, `AuditRoundReplayProcess.${extension}`), file], {encoding: "utf-8", timeout: 10000}));
            expect(result.pid).not.toBe(process.pid);
            expect(result).toMatchObject({status: "verified", completion: "completed", audit: JSON.parse(JSON.stringify(descriptor.audit))});
        }
    });

    it("keeps unavailable capture evidence pending across export, descriptor validation and fresh process verification", () => {
        const blueprint = {...feature, reelStrips: Array.from({length: 3}, () => ["A"])},
            game = createOverscanGame(blueprint),
            session = game.createSession({seed: "7"}),
            codec = session as api.GameSessionHandling & api.ConvertableToSessionState,
            capture = codec.toSessionState.bind(codec),
            play = jest.spyOn(session, "play"),
            recorder = new api.ReplayRecorder(10);
        session.setCreditsAmount(1000);
        // Complete one command, then accept the next entry without capturing its boundary.
        jest.spyOn(codec, "toSessionState").mockImplementation(() => {
            if (new api.SessionRuntime(session).getLogicalRound()?.id === "unavailable") throw new Error("persistent capture failure");
            return capture();
        });
        let prefix: api.ReplayDescriptor | undefined;
        try {
            recorder.recordAudit(game, session, [
                {kind: "spin", delivery: "composite", roundId: "complete", mode: "buy", maxSubrounds: 5},
                {kind: "spin", delivery: "composite", roundId: "unavailable", maxSubrounds: 5},
            ], detached, {seed: "7"});
        } catch (error) {
            expect(error).toMatchObject({code: "audit-capture-unavailable"});
            prefix = (error as Error & {committedRecording: api.ReplayDescriptor}).committedRecording;
        }
        expect(prefix).toMatchObject({auditCompletion: "pending", logicalRound: {status: "completed"}});
        expect(prefix!.audit!.captureUnavailable).toEqual({acceptedDeliveries: play.mock.calls.length});
        expect(() => api.validateAuditReplayDescriptor(JSON.parse(JSON.stringify(prefix)), game)).not.toThrow();
        expect(() => api.validateAuditReplayDescriptor({...prefix, auditCompletion: "completed"}, game)).toThrow("auditCompletion");
        expect(() => api.validateAuditRoundRecording({...prefix!.audit, captureUnavailable: undefined}, game)).toThrow("audit-structure");
        expect(() => api.validateAuditRoundRecording(rehash({...prefix!.audit!, captureUnavailable: {acceptedDeliveries: 10001}}), game)).toThrow("captureUnavailable");
        expect(() => api.validateAuditRoundRecording(rehash({...prefix!.audit!, captureUnavailable: {acceptedDeliveries: prefix!.audit!.deliveries.length}}), game)).toThrow("captureUnavailable");
        // Studio stores partially verified prefixes with the same original accepted count.
        const partial = rehash({...prefix!.audit!, deliveries: prefix!.audit!.deliveries.slice(0, 1)});
        expect(new api.ReplayRecorder().replay(game, partial)).toMatchObject({auditStatus: "verified", auditCompletion: "pending"});
        // Removing the incompleteness marker changes the canonical digest.
        const {captureUnavailable: _captureUnavailable, ...withoutMarker} = prefix!.audit!;
        expect(() => api.validateAuditRoundRecording(withoutMarker, game)).toThrow("audit-hash");
        recorder.releaseAuditSession(session);
        for (const extension of ["mjs", "cjs"]) {
            const file = path.join(runtime.directory, "unavailable-input.json");
            fs.writeFileSync(file, JSON.stringify({recording: prefix!.audit, blueprint}));
            const result = JSON.parse(execFileSync(process.execPath, [path.join(runtime.directory, `AuditRoundReplayProcess.${extension}`), file], {encoding: "utf-8", timeout: 10000}));
            expect(result.pid).not.toBe(process.pid);
            expect(result).toMatchObject({status: "verified", completion: "pending", audit: JSON.parse(JSON.stringify(prefix!.audit))});
        }
    });

    it("rejects malformed contexts and codecs with stable diagnostics before constructing a session", () => {
        const current = recorded(),
            create = jest.spyOn(current.game, "createSession");
        const context = rehash({...current.audit, context: [] as unknown as api.PokieGameContext});
        expect(() => new api.AuditRoundReplay().replay(current.game, context)).toThrow("audit-structure at context");
        const schema = rehash({...current.audit, stateSchema: "bad" as unknown as api.SessionStateSchema});
        expect(() => api.validateAuditRoundRecording(schema)).toThrow("audit-structure");
        expect(create).not.toHaveBeenCalled();
    });

    it("detaches immutable evidence, projects sentinels away and bounds session retention without losing retries", () => {
        const game = {...transactionalRoundGame(), getConfigHash: () => "custom-model-v1"};
        const session = game.createSession({seed: "7"}),
            runtimeSession = new api.SessionRuntime(session);
        const command: api.SessionCommand = {kind: "spin", roundId: "first", delivery: "composite"};
        const first = runtimeSession.execute(command);
        const sizes: number[] = [];
        for (let index = 0; index < 50; index++) {
            runtimeSession.execute({kind: "spin", roundId: `round:${index}`, delivery: "composite"});
            sizes.push(JSON.stringify(api.captureAuditBoundary(session)).length);
        }
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThan(1000);
        expect(runtimeSession.execute(command)).toEqual(first);
        expect(runtimeSession.getRetainedDeliveryCount()).toBeLessThan(200);
        runtimeSession.release();
        expect(runtimeSession.getRetainedDeliveryCount()).toBe(0);
        expect(runtimeSession.execute(command)).toMatchObject({status: "blocked"});
        const current = recorded();
        const {hash: _hash, ...artifact} = current.descriptor.artifact!;
        const publicArtifact = new api.PublicRoundArtifactProjector().project(new api.PokieJsonRoundArtifactProjector().project({...artifact, debug: {seed: "PRIVATE-SEED"}}));
        expect(JSON.stringify(publicArtifact)).not.toContain("PRIVATE-SEED");
        expect(publicArtifact).not.toHaveProperty("generatedScreen");
        expect(publicArtifact).not.toHaveProperty("hash");
        expect(Object.isFrozen(current.audit.deliveries[0].after.state)).toBe(true);
        const abort = new AbortController();
        abort.abort();
        expect(() => new api.AuditRoundReplay().replay(current.game, current.audit, abort.signal)).toThrow("audit-cancelled");
    });
});
