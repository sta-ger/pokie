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
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

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

        await command.run(["./crazy-fruits", "--port", "3000", "--client-port", "3100"]);

        expect(receivedApiOptions).toEqual({host: undefined, port: 3000});
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

        await command.run(["./crazy-fruits", "--no-open"]);

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

        await command.run(["./crazy-fruits", "--no-open"]);
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

        await command.run(["./crazy-fruits", "--no-open"]);
        fakeProcess.trigger("SIGTERM");
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(fakeProcess.exitCalls).toEqual([1]);

        logSpy.mockRestore();
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
        const clientMatch = printed.match(/POKIE client preview.*http:\/\/127\.0\.0\.1:(\d+)/);
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
});
