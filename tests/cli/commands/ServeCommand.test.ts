import {
    loadPokieGame,
    PokieDevServer,
    PokieDevServerAddress,
    PokieDevServerHandling,
    PokieDevServerOptions,
    PokieGame,
    PokieGameManifest,
} from "pokie";
import path from "path";
import {ServeCommand} from "../../../cli/commands/ServeCommand.js";

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
