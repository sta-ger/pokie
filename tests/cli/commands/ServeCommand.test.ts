import {
    loadPokieGame,
    OutcomeLibraryBundleWriter,
    OutcomeSourceDevServer,
    InMemoryWallet,
    PokieDevServer,
    PokieDevServerAddress,
    PokieDevServerHandling,
    PokieDevServerOptions,
    PokieGame,
    PokieGameManifest,
    PokieProject,
    PreGeneratedRoundRecord,
    PreGeneratedRoundRecording,
    PROJECT_TYPE_CAPABILITIES,
    ProjectResolving,
    ProjectTargetResolver,
    replayOutcomeSourceProject,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {ServeCommand} from "../../../cli/commands/ServeCommand.js";
import {buildOutcomeLibraryBundleModeInput, outcomeLibraryBundleTestProvenance} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

function stubProjectResolver(project: PokieProject | undefined): ProjectResolving & {calls: string[]} {
    const calls: string[] = [];
    return {
        calls,
        resolve(targetPath: string) {
            calls.push(targetPath);
            return Promise.resolve(project);
        },
    };
}

const outcomeLibraryProject: PokieProject = {
    type: "outcomeLibrary",
    rootPath: "/libraries/base",
    capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
    provenance: "test fixture",
};

const stakeAdapterProject: PokieProject = {
    type: "stakeAdapter",
    rootPath: "/stake/base",
    capabilities: PROJECT_TYPE_CAPABILITIES.stakeAdapter,
    provenance: "test fixture",
};

function createFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            throw new Error("not used by these tests");
        },
    };
}

function createStubServer(
    address: PokieDevServerAddress,
): PokieDevServerHandling & {startCalls: number; stopCalls: number; receivedOptions?: PokieDevServerOptions} {
    return {
        startCalls: 0,
        stopCalls: 0,
        start() {
            this.startCalls++;
            return Promise.resolve(address);
        },
        stop() {
            this.stopCalls++;
            return Promise.resolve();
        },
    };
}

describe("ServeCommand", () => {
    const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

    it("has the expected name and description", () => {
        const command = new ServeCommand();

        expect(command.getName()).toBe("serve");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a packageRoot", async () => {
        const command = new ServeCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie serve <packageRoot>/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new ServeCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error for a non-numeric --port", async () => {
        const command = new ServeCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--port", "nope"])).rejects.toThrow(/--port must be a non-negative integer/);
    });

    it("throws a descriptive error when --host has no value", async () => {
        const command = new ServeCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--host"])).rejects.toThrow(/--host requires a value/);
    });

    it("loads the game via the injected loader and starts a server with the parsed host/port", async () => {
        const game = createFakeGame(manifest);
        const stubServer = createStubServer({host: "0.0.0.0", port: 4321});
        let receivedGame: PokieGame | undefined;
        let receivedOptions: PokieDevServerOptions | undefined;
        const command = new ServeCommand(
            () => Promise.resolve(game),
            (createdGame, options) => {
                receivedGame = createdGame;
                receivedOptions = options;
                return stubServer;
            },
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot", "--port", "4321", "--host", "0.0.0.0"]);

        expect(receivedGame).toBe(game);
        expect(receivedOptions).toEqual({host: "0.0.0.0", port: 4321});
        expect(stubServer.startCalls).toBe(1);

        logSpy.mockRestore();
    });

    it("prints the listening address and an experimental/not-an-RGS notice", async () => {
        const stubServer = createStubServer({host: "127.0.0.1", port: 4321});
        const command = new ServeCommand(
            () => Promise.resolve(createFakeGame(manifest)),
            () => stubServer,
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("http://127.0.0.1:4321");
        expect(printed.toLowerCase()).toContain("not a casino backend");

        logSpy.mockRestore();
    });
});

describe("ServeCommand (integration, real loadPokieGame + PokieDevServer + fixture game package)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");

    it("starts a real server on an ephemeral port and serves the fixture game's manifest", async () => {
        let server: PokieDevServerHandling | undefined;
        const command = new ServeCommand(loadPokieGame, (game, options) => {
            server = new PokieDevServer(game, options);
            return server;
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([fixtureRoot, "--port", "0"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        const match = printed.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        expect(match).not.toBeNull();
        const port = Number(match![1]);

        const response = await fetch(`http://127.0.0.1:${port}/game`);
        const body = (await response.json()) as unknown;

        expect(body).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});

        await server!.stop();
        logSpy.mockRestore();
    });
});

// Proves "pokie serve" crosses the shared runtime-package-materialization boundary (see
// materializeRuntimePackage.ts) exactly once per invocation, and only ever loads against whatever
// runtime path that boundary hands back -- never the caller's own raw packageRoot.
describe("ServeCommand runtime package materialization boundary", () => {
    const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

    it("resolves the raw packageRoot once and loads the resolved runtime path instead", async () => {
        const rawPackageRoot = "/blueprints/raw-game.json";
        const resolvedRuntimePath = "/materialized/raw-game";
        const resolveCalls: string[] = [];
        const resolveRuntimePackageRoot = (packageRoot: string) => {
            resolveCalls.push(packageRoot);
            return Promise.resolve({runtimePath: resolvedRuntimePath, release: () => Promise.resolve()});
        };
        const loadCalls: string[] = [];
        const loadGame = (packageRoot: string) => {
            loadCalls.push(packageRoot);
            return Promise.resolve(createFakeGame(manifest));
        };
        const stubServer = createStubServer({host: "127.0.0.1", port: 4321});
        const command = new ServeCommand(loadGame, () => stubServer, resolveRuntimePackageRoot);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([rawPackageRoot]);

        logSpy.mockRestore();
        expect(resolveCalls).toEqual([rawPackageRoot]);
        expect(loadCalls).toEqual([resolvedRuntimePath]);
    });

    it("propagates a materialization failure without ever loading the game or starting the server", async () => {
        const resolveRuntimePackageRoot = () => Promise.reject(new Error("dependencies phase failed"));
        const loadGame = jest.fn(() => Promise.resolve(createFakeGame(manifest)));
        const stubServer = createStubServer({host: "127.0.0.1", port: 4321});
        const command = new ServeCommand(loadGame, () => stubServer, resolveRuntimePackageRoot);

        await expect(command.run(["/blueprints/raw-game.json"])).rejects.toThrow(/dependencies phase failed/);
        expect(loadGame).not.toHaveBeenCalled();
        expect(stubServer.startCalls).toBe(0);
    });
});

// Proves P3-POLISH-21's own serve-side outcome-source boundary: a resolved "outcomeLibrary" project is routed
// through the canonical outcome-source-backed server (OutcomeSourceDevServer) instead of
// resolveRuntimePackageRoot/loadGame/PokieDevServer, while a resolved "stakeAdapter" project surfaces the same
// structured missing-capability diagnostic every other unsupported-operation attempt does -- before any
// package runtime loading, regardless of whether --mode was even given.
describe("ServeCommand outcome-source routing", () => {
    it("throws the capability diagnostic for a resolved Stake Engine project, never loading the game", async () => {
        const resolveProject = stubProjectResolver(stakeAdapterProject);
        const loadGame = jest.fn();
        const command = new ServeCommand(loadGame, undefined, undefined, resolveProject);

        await expect(command.run(["/stake/base"])).rejects.toThrow(/"outcomeSource\.serve" is not supported for a "stakeAdapter" project/);
        expect(loadGame).not.toHaveBeenCalled();
    });

    it("throws the capability diagnostic for a resolved Stake Engine project even when --mode is given", async () => {
        const resolveProject = stubProjectResolver(stakeAdapterProject);
        const loadGame = jest.fn();
        const command = new ServeCommand(loadGame, undefined, undefined, resolveProject);

        await expect(command.run(["/stake/base", "--mode", "base"])).rejects.toThrow(
            /"outcomeSource\.serve" is not supported for a "stakeAdapter" project/,
        );
        expect(loadGame).not.toHaveBeenCalled();
    });

    it("throws when --mode is omitted for a resolved native outcome-library project", async () => {
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const loadGame = jest.fn();
        const command = new ServeCommand(loadGame, undefined, undefined, resolveProject);

        await expect(command.run(["/libraries/base"])).rejects.toThrow(/--mode <modeName> is required/);
        expect(loadGame).not.toHaveBeenCalled();
    });

    it("serves a resolved native outcome-library project through the injected outcome-source server, never loading the game", async () => {
        const resolveProject = stubProjectResolver(outcomeLibraryProject);
        const stubServer = createStubServer({host: "127.0.0.1", port: 4322});
        let receivedProject: PokieProject | undefined;
        let receivedMode: string | undefined;
        let receivedOptions: PokieDevServerOptions | undefined;
        const loadGame = jest.fn();
        const command = new ServeCommand(loadGame, undefined, undefined, resolveProject, (project, modeName, options) => {
            receivedProject = project;
            receivedMode = modeName;
            receivedOptions = options;
            return stubServer;
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["/libraries/base", "--mode", "base", "--port", "4322"]);

        expect(receivedProject).toBe(outcomeLibraryProject);
        expect(receivedMode).toBe("base");
        expect(receivedOptions).toEqual({host: undefined, port: 4322, sessionCapturePolicyMode: "full"});
        expect(stubServer.startCalls).toBe(1);
        expect(loadGame).not.toHaveBeenCalled();
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("http://127.0.0.1:4322");
        expect(printed.toLowerCase()).toContain("not a casino backend");

        logSpy.mockRestore();
    });
});

// Real, non-stubbed end-to-end coverage: a real, on-disk outcome-library bundle (built by
// OutcomeLibraryBundleWriter, not mocked), resolved and served through the same
// ProjectTargetResolver/OutcomeSourceDevServer path the unit tests above stub out.
describe("ServeCommand outcome-source routing (integration, real outcome-library bundle)", () => {
    let bundleDir: string;

    beforeEach(async () => {
        bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-serve-outcomesource-test-"));
        fs.rmdirSync(bundleDir);
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
    });

    afterEach(() => {
        fs.rmSync(bundleDir, {recursive: true, force: true});
    });

    it("serves draws from a real bundle through the real outcome-source server, never loading a game", async () => {
        const loadGame = jest.fn();
        let server: PokieDevServerHandling | undefined;
        const command = new ServeCommand(loadGame, undefined, undefined, new ProjectTargetResolver(), (project, modeName, options) => {
            server = new OutcomeSourceDevServer(project, modeName, options);
            return server;
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([bundleDir, "--mode", "base", "--port", "0"]);

        expect(loadGame).not.toHaveBeenCalled();
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        const match = printed.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        expect(match).not.toBeNull();
        const port = Number(match![1]);

        const response = await fetch(`http://127.0.0.1:${port}/outcome-source/sample`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({seed: "serve-seed"}),
        });
        const body = (await response.json()) as {supported: boolean; selection: {libraryId: string; outcome: {id: string}}};

        expect(response.status).toBe(200);
        expect(body.supported).toBe(true);
        expect(body.selection.libraryId).toBe("base-lib");

        await server!.stop();
        logSpy.mockRestore();
    });

    it("serves a native bundle through the Player session contract with public-by-default, idempotent pre-generated spins", async () => {
        const loadGame = jest.fn();
        let server: PokieDevServerHandling | undefined;
        const command = new ServeCommand(loadGame, undefined, undefined, new ProjectTargetResolver(), (project, modeName, options) => {
            server = new OutcomeSourceDevServer(project, modeName, options);
            return server;
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([bundleDir, "--mode", "base", "--port", "0"]);

        const port = Number(logSpy.mock.calls.map((call) => call[0]).join("\n").match(/http:\/\/127\.0\.0\.1:(\d+)/)![1]);
        const baseUrl = `http://127.0.0.1:${port}`;
        const created = await fetch(`${baseUrl}/sessions`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({seed: "player-seed", initialBalance: 10}),
        });
        const createdBody = (await created.json()) as {sessionId: string; game: {id: string}; credits: number};

        expect(created.status).toBe(201);
        expect(createdBody.game.id).toBe("sample-slot");
        expect(createdBody.credits).toBe(10);
        expect(loadGame).not.toHaveBeenCalled();

        const spin = async (requestId: string, debug = false) => {
            const response = await fetch(`${baseUrl}/sessions/${createdBody.sessionId}/spin${debug ? "?debug=1" : ""}`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({requestId}),
            });
            return {response, body: (await response.json()) as Record<string, unknown>};
        };
        const first = await spin("round-1");
        const retry = await spin("round-1");
        const debugRetry = await spin("round-1", true);

        expect(first.response.status).toBe(200);
        expect(first.body).toMatchObject({sessionId: createdBody.sessionId, game: {id: "sample-slot"}, requestId: "round-1", bet: 1});
        expect(first.body).not.toHaveProperty("internal");
        expect(retry.body).toEqual(first.body);
        expect(debugRetry.body.credits).toBe(first.body.credits);
        expect(debugRetry.body).toHaveProperty("internal.artifact.provenance", outcomeLibraryBundleTestProvenance);

        const fullRestored = await fetch(`${baseUrl}/sessions/${createdBody.sessionId}?debug=1`);
        expect(await fullRestored.json()).toHaveProperty("internal.artifact.provenance", outcomeLibraryBundleTestProvenance);

        const second = await spin("round-2");
        const staleRetry = await spin("round-1");
        expect(staleRetry.body).toEqual(first.body);

        const restored = await fetch(`${baseUrl}/sessions/${createdBody.sessionId}`);
        const restoredBody = (await restored.json()) as Record<string, unknown>;
        expect(restoredBody).toMatchObject({roundId: second.body.roundId, credits: second.body.credits, bet: 1});
        expect(restoredBody).not.toHaveProperty("internal");

        await server!.stop();
        logSpy.mockRestore();
    });

    it("records one settled native round with a stable replay identity, and honors full versus partial capture", async () => {
        const records = new Map<string, PreGeneratedRoundRecord>();
        const recorder: PreGeneratedRoundRecording = {
            record: jest.fn((record: PreGeneratedRoundRecord) => {
                const key = `${record.sessionId}:${record.roundId}`;
                const existing = records.get(key);
                if (existing !== undefined) {
                    return Promise.resolve(existing);
                }
                records.set(key, record);
                return Promise.resolve(record);
            }),
            load: (sessionId, roundId) => Promise.resolve(records.get(`${sessionId}:${roundId}`)),
            loadLatest: (sessionId) =>
                Promise.resolve([...records.values()].filter((record) => record.sessionId === sessionId).sort((a, b) => b.round - a.round)[0]),
        };
        const wallet = new InMemoryWallet();
        const debit = jest.spyOn(wallet, "debit");
        const project = {...outcomeLibraryProject, rootPath: bundleDir};
        const fullServer = new OutcomeSourceDevServer(project, "base", {
            host: "127.0.0.1",
            port: 0,
            wallet,
            preGeneratedRoundRecorder: recorder,
            sessionCapturePolicyMode: "full",
        });
        const fullAddress = await fullServer.start();
        const fullBaseUrl = `http://${fullAddress.host}:${fullAddress.port}`;

        const created = await fetch(`${fullBaseUrl}/sessions`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({seed: "recorded-seed", initialBalance: 10}),
        });
        const {sessionId} = (await created.json()) as {sessionId: string};
        const spin = async () => {
            const response = await fetch(`${fullBaseUrl}/sessions/${sessionId}/spin`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({requestId: "recorded-round"}),
            });
            return (await response.json()) as {credits: number; replay: Record<string, unknown>};
        };

        const [first, retry] = await Promise.all([spin(), spin()]);
        expect(debit).toHaveBeenCalledTimes(1);
        expect(recorder.record).toHaveBeenCalledTimes(1);
        expect(records.size).toBe(1);
        expect(retry).toEqual(first);

        const recorded = [...records.values()][0];
        expect(recorded.replay).toMatchObject({seed: "recorded-seed", round: 1, outcomeId: first.replay.outcomeId});
        expect(recorded.internal?.artifact.provenance).toEqual(outcomeLibraryBundleTestProvenance);
        const replayed = await replayOutcomeSourceProject(project, "base", recorded.replay.seed, recorded.replay.round);
        expect(replayed).toEqual(expect.objectContaining({supported: true, replay: expect.objectContaining({
            libraryId: recorded.replay.libraryId,
            libraryHash: recorded.replay.libraryHash,
            outcomeId: recorded.replay.outcomeId,
            totalWin: recorded.replay.totalWin,
            payoutMultiplier: recorded.replay.payoutMultiplier,
        })}));
        if (replayed.supported) {
            // The settled server round and the public `pokie replay` workflow now share the canonical
            // ReplayDescriptor contract. The server's record retains its real session/wallet facts;
            // the replay command only reconstructs the deterministic selection, never game math.
            expect(recorded.replayDescriptor).toMatchObject({
                sessionId,
                seed: recorded.replay.seed,
                round: recorded.replay.round,
                totalBet: recorded.stake,
                totalWin: recorded.replay.totalWin,
                outcomeSource: expect.objectContaining({
                    libraryId: replayed.replay.libraryId,
                    libraryHash: replayed.replay.libraryHash,
                    seed: replayed.replay.seed,
                    round: replayed.replay.round,
                    outcomeId: replayed.replay.outcomeId,
                    totalWin: replayed.replay.totalWin,
                    payoutMultiplier: replayed.replay.payoutMultiplier,
                }),
            });
            expect(replayed.descriptor).toMatchObject({
                seed: recorded.replay.seed,
                round: recorded.replay.round,
                totalWin: recorded.replay.totalWin,
                outcomeSource: expect.objectContaining({
                    libraryId: recorded.replay.libraryId,
                    libraryHash: recorded.replay.libraryHash,
                    seed: recorded.replay.seed,
                    round: recorded.replay.round,
                    outcomeId: recorded.replay.outcomeId,
                    totalWin: recorded.replay.totalWin,
                    payoutMultiplier: recorded.replay.payoutMultiplier,
                }),
            });
        }
        const fullRestored = await fetch(`${fullBaseUrl}/sessions/${sessionId}?debug=1`);
        expect(await fullRestored.json()).toHaveProperty("internal.artifact.provenance", outcomeLibraryBundleTestProvenance);
        await fullServer.stop();

        const partialServer = new OutcomeSourceDevServer(project, "base", {host: "127.0.0.1", port: 0, sessionCapturePolicyMode: "partial"});
        const partialAddress = await partialServer.start();
        const partialBaseUrl = `http://${partialAddress.host}:${partialAddress.port}`;
        const partialCreated = await fetch(`${partialBaseUrl}/sessions`, {method: "POST"});
        const {sessionId: partialSessionId} = (await partialCreated.json()) as {sessionId: string};
        await fetch(`${partialBaseUrl}/sessions/${partialSessionId}/spin`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({requestId: "partial-round"}),
        });
        const partialRestored = (await (await fetch(`${partialBaseUrl}/sessions/${partialSessionId}?debug=1`)).json()) as Record<string, unknown>;
        expect(partialRestored).toHaveProperty("internal.capturePolicy", {version: 1, mode: "partial", captureDebugPayloads: true});
        expect(partialRestored).toHaveProperty("internal.replay.seed");
        expect(partialRestored).not.toHaveProperty("internal.artifact");
        await partialServer.stop();
    });
});
