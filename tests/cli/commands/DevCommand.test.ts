import {
    loadPokieGame,
    PokieClientServer,
    PokieClientServerHandling,
    PokieClientServerOptions,
    PokieDevServer,
    PokieDevServerAddress,
    PokieDevServerHandling,
    PokieDevServerOptions,
    PokieGame,
    PokieGameManifest,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {DevCommand} from "../../../cli/commands/DevCommand.js";

function createFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            throw new Error("not used by these tests");
        },
    };
}

function createStubServer<T extends {start(): Promise<PokieDevServerAddress>; stop(): Promise<void>}>(
    address: PokieDevServerAddress,
    onStop: () => Promise<void> = () => Promise.resolve(),
): T & {startCalls: number; stopCalls: number} {
    return {
        startCalls: 0,
        stopCalls: 0,
        start() {
            this.startCalls++;
            return Promise.resolve(address);
        },
        stop() {
            this.stopCalls++;
            return onStop();
        },
    } as T & {startCalls: number; stopCalls: number};
}

type SignalHandler = () => void;

class FakeProcess {
    public readonly exitCalls: number[] = [];
    private readonly handlers = new Map<string, SignalHandler>();

    public once(event: string, handler: SignalHandler): FakeProcess {
        this.handlers.set(event, handler);
        return this;
    }

    public exit(code: number): void {
        this.exitCalls.push(code);
    }

    public trigger(event: string): void {
        this.handlers.get(event)?.();
    }
}

describe("DevCommand", () => {
    const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

    it("has the expected name and description", () => {
        const command = new DevCommand();

        expect(command.getName()).toBe("dev");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a packageRoot", async () => {
        const command = new DevCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie dev <packageRoot>/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new DevCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error for a non-numeric --client-port", async () => {
        const command = new DevCommand(() => Promise.resolve(createFakeGame(manifest)));

        await expect(command.run(["./game", "--client-port", "nope"])).rejects.toThrow(
            /--client-port must be a non-negative integer/,
        );
    });

    it("turns an invalid package load into a validate-and-retry recovery step", async () => {
        const command = new DevCommand(() => Promise.reject(new Error("missing pokie.entry")));

        await expect(command.run(["./broken-game", "--no-open"])).rejects.toThrow(
            /^Could not load a POKIE game package from "\.\/broken-game"\. Run `pokie validate "\.\/broken-game"` to diagnose the package, then retry\.$/,
        );
    });

    it("turns a non-port API listener failure into a scoped recovery step", async () => {
        const command = new DevCommand(
            () => Promise.resolve(createFakeGame(manifest)),
            () => ({start: () => Promise.reject(new Error("bind failed at /private/runtime/socket")), stop: () => Promise.resolve()}),
            {clientRoot: "/fake/client/root", process: new FakeProcess() as unknown as NodeJS.Process},
        );

        await expect(command.run(["./game", "--no-open"])).rejects.toThrow(
            /^POKIE dev API server could not start its local listener\. Check the configured host and port, then retry with --port <number> \(or --port 0 for an available port\)\.$/,
        );
    });

    it("turns a busy API port into a concise recovery step", async () => {
        const portInUse = Object.assign(new Error("listen EADDRINUSE"), {
            code: "EADDRINUSE",
            address: "127.0.0.1",
            port: 3000,
        });
        const command = new DevCommand(
            () => Promise.resolve(createFakeGame(manifest)),
            () => ({start: () => Promise.reject(portInUse), stop: () => Promise.resolve()}),
            {clientRoot: "/fake/client/root", process: new FakeProcess() as unknown as NodeJS.Process},
        );

        await expect(command.run(["./game", "--no-open"])).rejects.toThrow(
            /Stop the process using it, or retry with --port <number> \(or --port 0 for an available port\)/,
        );
    });

    it("stops the API and explains how to recover when the browser UI port is busy", async () => {
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});
        const portInUse = Object.assign(new Error("listen EADDRINUSE"), {
            code: "EADDRINUSE",
            address: "127.0.0.1",
            port: 3100,
        });
        const command = new DevCommand(
            () => Promise.resolve(createFakeGame(manifest)),
            () => apiServer,
            {
                createClientServer: () => ({start: () => Promise.reject(portInUse), stop: () => Promise.resolve()}),
                clientRoot: "/fake/client/root",
                process: new FakeProcess() as unknown as NodeJS.Process,
            },
        );

        await expect(command.run(["./game", "--no-open"])).rejects.toThrow(
            /retry with --client-port <number> \(or --client-port 0 for an available port\)/,
        );
        expect(apiServer.stopCalls).toBe(1);
    });

    it("stops the API and turns a non-port UI listener failure into scoped recovery guidance", async () => {
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});
        const command = new DevCommand(
            () => Promise.resolve(createFakeGame(manifest)),
            () => apiServer,
            {
                createClientServer: () => ({start: () => Promise.reject(new Error("bind failed at /private/runtime/socket")), stop: () => Promise.resolve()}),
                clientRoot: "/fake/client/root",
                process: new FakeProcess() as unknown as NodeJS.Process,
            },
        );

        await expect(command.run(["./game", "--no-open"])).rejects.toThrow(
            /^POKIE client UI could not start its local listener\. Check the configured host and port, then retry with --client-port <number> \(or --client-port 0 for an available port\)\.$/,
        );
        expect(apiServer.stopCalls).toBe(1);
    });

    it("starts both servers, waits for health, and opens the browser by default", async () => {
        const game = createFakeGame(manifest);
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});
        const clientServer = createStubServer<PokieClientServerHandling>({host: "127.0.0.1", port: 3100});
        let receivedApiOptions: PokieDevServerOptions | undefined;
        let receivedClientOptions: PokieClientServerOptions | undefined;
        let receivedClientRoot: string | undefined;
        let healthUrlChecked: string | undefined;
        let openedUrl: string | undefined;
        const fakeProcess = new FakeProcess();

        const command = new DevCommand(
            () => Promise.resolve(game),
            (_game, options) => {
                receivedApiOptions = options;
                return apiServer;
            },
            {
                createClientServer: (clientRoot, options) => {
                    receivedClientRoot = clientRoot;
                    receivedClientOptions = options;
                    return clientServer;
                },
                waitForHealth: (url) => {
                    healthUrlChecked = url;
                    return Promise.resolve();
                },
                openBrowser: (url) => {
                    openedUrl = url;
                },
                clientRoot: "/fake/client/root",
                process: fakeProcess as unknown as NodeJS.Process,
            },
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot", "--port", "3000", "--client-port", "3100"]);

        expect(receivedApiOptions).toEqual({
            host: undefined,
            port: 3000,
            sessionCapturePolicyMode: "full",
            pokieVersion: "unknown",
        });
        expect(receivedClientRoot).toBe("/fake/client/root");
        expect(receivedClientOptions).toEqual({
            host: undefined,
            port: 3100,
            apiAddress: {host: "127.0.0.1", port: 3000},
        });
        expect(apiServer.startCalls).toBe(1);
        expect(clientServer.startCalls).toBe(1);
        expect(healthUrlChecked).toBe("http://127.0.0.1:3000/health");
        expect(openedUrl).toBe("http://127.0.0.1:3100");

        logSpy.mockRestore();
    });

    it("requests full session capture and stamps the configured POKIE version, defaulting to \"unknown\" when none is given", async () => {
        const game = createFakeGame(manifest);
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});
        const clientServer = createStubServer<PokieClientServerHandling>({host: "127.0.0.1", port: 3100});
        let receivedApiOptions: PokieDevServerOptions | undefined;

        const command = new DevCommand(
            () => Promise.resolve(game),
            (_game, options) => {
                receivedApiOptions = options;
                return apiServer;
            },
            {
                createClientServer: () => clientServer,
                waitForHealth: () => Promise.resolve(),
                openBrowser: () => undefined,
                clientRoot: "/fake/client/root",
                pokieVersion: "3.4.5",
                process: new FakeProcess() as unknown as NodeJS.Process,
            },
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot", "--no-open"]);

        expect(receivedApiOptions?.sessionCapturePolicyMode).toBe("full");
        expect(receivedApiOptions?.pokieVersion).toBe("3.4.5");

        logSpy.mockRestore();
    });

    it("does not open the browser when --no-open is given", async () => {
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});
        const clientServer = createStubServer<PokieClientServerHandling>({host: "127.0.0.1", port: 3100});
        let openBrowserCalls = 0;

        const command = new DevCommand(
            () => Promise.resolve(createFakeGame(manifest)),
            () => apiServer,
            {
                createClientServer: () => clientServer,
                waitForHealth: () => Promise.resolve(),
                openBrowser: () => {
                    openBrowserCalls++;
                },
                clientRoot: "/fake/client/root",
                process: new FakeProcess() as unknown as NodeJS.Process,
            },
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot", "--no-open"]);

        expect(openBrowserCalls).toBe(0);

        logSpy.mockRestore();
    });

    it("stops both servers and exits 0 on SIGINT", async () => {
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});
        const clientServer = createStubServer<PokieClientServerHandling>({host: "127.0.0.1", port: 3100});
        const fakeProcess = new FakeProcess();

        const command = new DevCommand(
            () => Promise.resolve(createFakeGame(manifest)),
            () => apiServer,
            {
                createClientServer: () => clientServer,
                waitForHealth: () => Promise.resolve(),
                openBrowser: () => undefined,
                clientRoot: "/fake/client/root",
                process: fakeProcess as unknown as NodeJS.Process,
            },
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot", "--no-open"]);
        fakeProcess.trigger("SIGINT");
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(apiServer.stopCalls).toBe(1);
        expect(clientServer.stopCalls).toBe(1);
        expect(fakeProcess.exitCalls).toEqual([0]);

        logSpy.mockRestore();
    });

    it("exits 1 if stopping either server fails during shutdown", async () => {
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000}, () =>
            Promise.reject(new Error("stop failed")),
        );
        const clientServer = createStubServer<PokieClientServerHandling>({host: "127.0.0.1", port: 3100});
        const fakeProcess = new FakeProcess();

        const command = new DevCommand(
            () => Promise.resolve(createFakeGame(manifest)),
            () => apiServer,
            {
                createClientServer: () => clientServer,
                waitForHealth: () => Promise.resolve(),
                openBrowser: () => undefined,
                clientRoot: "/fake/client/root",
                process: fakeProcess as unknown as NodeJS.Process,
            },
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot", "--no-open"]);
        fakeProcess.trigger("SIGTERM");
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(fakeProcess.exitCalls).toEqual([1]);

        logSpy.mockRestore();
    });

    it("stops the already-started API server if the client server fails to start", async () => {
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});
        const clientServerStartError = new Error("client server failed to bind its port");

        const command = new DevCommand(() => Promise.resolve(createFakeGame(manifest)), () => apiServer, {
            createClientServer: () =>
                ({
                    start: () => Promise.reject(clientServerStartError),
                    stop: () => Promise.resolve(),
                }) as unknown as PokieClientServerHandling,
            waitForHealth: () => Promise.resolve(),
            openBrowser: () => undefined,
            clientRoot: "/fake/client/root",
            process: new FakeProcess() as unknown as NodeJS.Process,
        });

        await expect(command.run(["./sample-slot", "--no-open"])).rejects.toThrow(
            /^POKIE client UI could not start its local listener\. Check the configured host and port, then retry with --client-port <number> \(or --client-port 0 for an available port\)\.$/,
        );

        expect(apiServer.stopCalls).toBe(1);
    });

    it("stops both already-started servers if waitForHealth times out", async () => {
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});
        const clientServer = createStubServer<PokieClientServerHandling>({host: "127.0.0.1", port: 3100});
        const healthTimeoutError = new Error("timed out waiting for health check");

        const command = new DevCommand(() => Promise.resolve(createFakeGame(manifest)), () => apiServer, {
            createClientServer: () => clientServer,
            waitForHealth: () => Promise.reject(healthTimeoutError),
            openBrowser: () => undefined,
            clientRoot: "/fake/client/root",
            process: new FakeProcess() as unknown as NodeJS.Process,
        });

        await expect(command.run(["./sample-slot", "--no-open"])).rejects.toThrow(healthTimeoutError);

        expect(apiServer.stopCalls).toBe(1);
        expect(clientServer.stopCalls).toBe(1);
    });

    it("still propagates the original startup error even if the cleanup stop() calls also fail", async () => {
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000}, () =>
            Promise.reject(new Error("api stop also failed")),
        );
        const healthTimeoutError = new Error("timed out waiting for health check");

        const command = new DevCommand(() => Promise.resolve(createFakeGame(manifest)), () => apiServer, {
            createClientServer: () =>
                createStubServer<PokieClientServerHandling>({host: "127.0.0.1", port: 3100}, () =>
                    Promise.reject(new Error("client stop also failed")),
                ),
            waitForHealth: () => Promise.reject(healthTimeoutError),
            openBrowser: () => undefined,
            clientRoot: "/fake/client/root",
            process: new FakeProcess() as unknown as NodeJS.Process,
        });

        await expect(command.run(["./sample-slot", "--no-open"])).rejects.toThrow(healthTimeoutError);
    });
});

describe("DevCommand (integration, real loadPokieGame + PokieDevServer + PokieClientServer + fixture)", () => {
    const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");
    let clientRoot: string;

    beforeEach(() => {
        clientRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-dev-command-test-"));
        fs.writeFileSync(path.join(clientRoot, "index.html"), "<html>preview</html>");
    });

    afterEach(() => {
        fs.rmSync(clientRoot, {recursive: true, force: true});
    });

    it("runs the API and client together, and a spin through the API works", async () => {
        let apiServer: PokieDevServerHandling | undefined;
        let clientServer: PokieClientServerHandling | undefined;
        const command = new DevCommand(
            loadPokieGame,
            (game, options) => {
                apiServer = new PokieDevServer(game, options);
                return apiServer;
            },
            {
                createClientServer: (root, options) => {
                    clientServer = new PokieClientServer(root, options);
                    return clientServer;
                },
                clientRoot,
                openBrowser: () => undefined,
                process: new FakeProcess() as unknown as NodeJS.Process,
            },
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([fixtureRoot, "--port", "0", "--client-port", "0", "--no-open"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        const apiMatch = printed.match(/POKIE dev server.*http:\/\/127\.0\.0\.1:(\d+)/);
        const clientMatch = printed.match(/POKIE client UI.*http:\/\/127\.0\.0\.1:(\d+)/);
        expect(apiMatch).not.toBeNull();
        expect(clientMatch).not.toBeNull();

        const apiPort = Number(apiMatch![1]);
        const clientPort = Number(clientMatch![1]);

        const health = await fetch(`http://127.0.0.1:${apiPort}/health`);
        expect(health.status).toBe(200);

        const config = await fetch(`http://127.0.0.1:${clientPort}/config`);
        expect(await config.json()).toEqual({apiBaseUrl: `http://127.0.0.1:${apiPort}`});

        const created = await fetch(`http://127.0.0.1:${apiPort}/sessions`, {method: "POST"});
        const createdBody = (await created.json()) as {sessionId: string};
        const spun = await fetch(`http://127.0.0.1:${apiPort}/sessions/${createdBody.sessionId}/spin`, {method: "POST"});
        expect(spun.status).toBe(200);

        await apiServer!.stop();
        await clientServer!.stop();
        logSpy.mockRestore();
    });

    it("persists a full RoundArtifact for a spin through the real dev runtime path, stamped with the configured POKIE version", async () => {
        let apiServer: PokieDevServerHandling | undefined;
        let clientServer: PokieClientServerHandling | undefined;
        const command = new DevCommand(
            loadPokieGame,
            (game, options) => {
                apiServer = new PokieDevServer(game, options);
                return apiServer;
            },
            {
                createClientServer: (root, options) => {
                    clientServer = new PokieClientServer(root, options);
                    return clientServer;
                },
                clientRoot,
                openBrowser: () => undefined,
                pokieVersion: "7.8.9",
                process: new FakeProcess() as unknown as NodeJS.Process,
            },
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([fixtureRoot, "--port", "0", "--client-port", "0", "--no-open"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        const apiMatch = printed.match(/POKIE dev server.*http:\/\/127\.0\.0\.1:(\d+)/);
        const apiPort = Number(apiMatch![1]);

        const created = await fetch(`http://127.0.0.1:${apiPort}/sessions`, {method: "POST"});
        const createdBody = (await created.json()) as {sessionId: string};
        const spun = await fetch(`http://127.0.0.1:${apiPort}/sessions/${createdBody.sessionId}/spin?debug=1`, {method: "POST"});
        expect(spun.status).toBe(200);
        const spunBody = (await spun.json()) as {internal: {stateAfter: Record<string, unknown>}};

        const stateAfter = spunBody.internal.stateAfter;
        expect(stateAfter.capturePolicy).toEqual({version: 1, mode: "full", captureDebugPayloads: true});
        const artifact = stateAfter.roundArtifact as Record<string, unknown>;
        expect(artifact).toBeDefined();
        const provenance = artifact.provenance as Record<string, unknown>;
        expect(provenance.pokieVersion).toBe("7.8.9");

        await apiServer!.stop();
        await clientServer!.stop();
        logSpy.mockRestore();
    });
});

// Proves "pokie dev" crosses the shared runtime-package-materialization boundary (see
// materializeRuntimePackage.ts) exactly once per invocation, and only ever loads against whatever
// runtime path that boundary hands back -- never the caller's own raw packageRoot.
describe("DevCommand runtime package materialization boundary", () => {
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
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});
        const clientServer = createStubServer<PokieClientServerHandling>({host: "127.0.0.1", port: 3100});

        const command = new DevCommand(
            loadGame,
            () => apiServer,
            {
                createClientServer: () => clientServer,
                waitForHealth: () => Promise.resolve(),
                openBrowser: () => undefined,
                clientRoot: "/fake/client/root",
                process: new FakeProcess() as unknown as NodeJS.Process,
            },
            resolveRuntimePackageRoot,
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([rawPackageRoot, "--no-open"]);

        logSpy.mockRestore();
        expect(resolveCalls).toEqual([rawPackageRoot]);
        expect(loadCalls).toEqual([resolvedRuntimePath]);
    });

    it("turns a materialization failure into recovery guidance without loading the game or starting any server", async () => {
        const resolveRuntimePackageRoot = () => Promise.reject(new Error("dependencies phase failed"));
        const loadGame = jest.fn(() => Promise.resolve(createFakeGame(manifest)));
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});

        const command = new DevCommand(loadGame, () => apiServer, {clientRoot: "/fake/client/root"}, resolveRuntimePackageRoot);

        await expect(command.run(["/blueprints/raw-game.json", "--no-open"])).rejects.toThrow(
            /^Could not load a POKIE game package from "\/blueprints\/raw-game\.json"\. Run `pokie validate "\/blueprints\/raw-game\.json"` to diagnose the package, then retry\.$/,
        );
        expect(loadGame).not.toHaveBeenCalled();
        expect(apiServer.startCalls).toBe(0);
    });

    // No shell/path-splitting hazard exists in this boundary (see resolveRuntimePackageRoot/loadGame
    // above -- both plain function calls, never a spawned shell command), but this pins the actual
    // observable behavior: a space-containing packageRoot reaches both the resolver and loadGame byte
    // for byte, exactly as a space-free one would -- closing the "dev" gap the phase 4 CLI-robustness
    // audit named (pokie-phase4-inventory.md §1's "remaining gap" for serve/dev/client).
    it("carries a space-containing packageRoot through resolveRuntimePackageRoot and loadGame unmangled", async () => {
        const spacedPackageRoot = "/my game dir/sample slot";
        const resolveCalls: string[] = [];
        const resolveRuntimePackageRoot = (packageRoot: string) => {
            resolveCalls.push(packageRoot);
            return Promise.resolve({runtimePath: packageRoot, release: () => Promise.resolve()});
        };
        const loadCalls: string[] = [];
        const loadGame = (packageRoot: string) => {
            loadCalls.push(packageRoot);
            return Promise.resolve(createFakeGame(manifest));
        };
        const apiServer = createStubServer<PokieDevServerHandling>({host: "127.0.0.1", port: 3000});
        const clientServer = createStubServer<PokieClientServerHandling>({host: "127.0.0.1", port: 3100});

        const command = new DevCommand(
            loadGame,
            () => apiServer,
            {
                createClientServer: () => clientServer,
                waitForHealth: () => Promise.resolve(),
                openBrowser: () => undefined,
                clientRoot: "/fake/client/root",
                process: new FakeProcess() as unknown as NodeJS.Process,
            },
            resolveRuntimePackageRoot,
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([spacedPackageRoot, "--no-open"]);

        logSpy.mockRestore();
        expect(resolveCalls).toEqual([spacedPackageRoot]);
        expect(loadCalls).toEqual([spacedPackageRoot]);
    });
});
