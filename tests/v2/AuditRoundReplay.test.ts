import {ControllableDurableWallet} from "../server/wallet/fixtures/ControllableDurableWallet.js";
import fs from "node:fs";
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
