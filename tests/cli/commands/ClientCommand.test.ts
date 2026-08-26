import {PokieClientServer, PokieClientServerHandling, PokieClientServerOptions, PokieDevServerAddress} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {ClientCommand} from "../../../cli/commands/ClientCommand.js";

function createStubServer(
    address: PokieDevServerAddress,
): PokieClientServerHandling & {startCalls: number; stopCalls: number} {
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

describe("ClientCommand", () => {
    it("has the expected name and description", () => {
        const command = new ClientCommand();

        expect(command.getName()).toBe("client");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a packageRoot", async () => {
        const command = new ClientCommand();

        await expect(command.run([])).rejects.toThrow(/Usage: pokie client <packageRoot>/);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new ClientCommand();

        await expect(command.run(["./game", "--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error for a non-numeric --port", async () => {
        const command = new ClientCommand();

        await expect(command.run(["./game", "--port", "nope"])).rejects.toThrow(/--port must be a non-negative integer/);
    });

    it("throws a descriptive error for a non-numeric --api-port", async () => {
        const command = new ClientCommand();

        await expect(command.run(["./game", "--api-port", "nope"])).rejects.toThrow(
            /--api-port must be a non-negative integer/,
        );
    });

    it("turns a busy browser UI port into a concise recovery step", async () => {
        const portInUse = Object.assign(new Error("listen EADDRINUSE"), {
            code: "EADDRINUSE",
            address: "127.0.0.1",
            port: 3100,
        });
        const command = new ClientCommand(
            () => ({start: () => Promise.reject(portInUse), stop: () => Promise.resolve()}),
            "/fake/client/root",
        );

        await expect(command.run(["./game", "--no-open"])).rejects.toThrow(
            /Stop the process using it, or retry with --port <number> \(or --port 0 for an available port\)/,
        );
    });

    it("throws a descriptive error when --host has no value", async () => {
        const command = new ClientCommand();

        await expect(command.run(["./game", "--host"])).rejects.toThrow(/--host requires a value/);
    });

    it("starts the client server with the given clientRoot, host/port, and defaulted api address", async () => {
        const stubServer = createStubServer({host: "127.0.0.1", port: 3100});
        let receivedClientRoot: string | undefined;
        let receivedOptions: PokieClientServerOptions | undefined;
        const command = new ClientCommand((clientRoot, options) => {
            receivedClientRoot = clientRoot;
            receivedOptions = options;
            return stubServer;
        }, "/fake/client/root");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot"]);

        expect(receivedClientRoot).toBe("/fake/client/root");
        expect(receivedOptions).toEqual({host: undefined, port: undefined, apiAddress: {host: "127.0.0.1", port: 3000}});
        expect(stubServer.startCalls).toBe(1);

        logSpy.mockRestore();
    });

    it("forwards --port/--host/--api-host/--api-port", async () => {
        const stubServer = createStubServer({host: "0.0.0.0", port: 4444});
        let receivedOptions: PokieClientServerOptions | undefined;
        const command = new ClientCommand((_clientRoot, options) => {
            receivedOptions = options;
            return stubServer;
        }, "/fake/client/root");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([
            "./sample-slot",
            "--port",
            "4444",
            "--host",
            "0.0.0.0",
            "--api-host",
            "192.168.1.5",
            "--api-port",
            "9000",
        ]);

        expect(receivedOptions).toEqual({host: "0.0.0.0", port: 4444, apiAddress: {host: "192.168.1.5", port: 9000}});

        logSpy.mockRestore();
    });

    it("prints the listening address and the expected api address, without loading the game package", async () => {
        const stubServer = createStubServer({host: "127.0.0.1", port: 3100});
        const command = new ClientCommand(() => stubServer, "/fake/client/root");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./does-not-need-to-exist"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("http://127.0.0.1:3100");
        expect(printed).toContain("http://127.0.0.1:3000");
        expect(printed).toContain('start it separately (e.g. "pokie serve") or use "pokie dev"');
        expect(printed).toContain("not a casino backend or RGS");

        logSpy.mockRestore();
    });

    it("opens a browser pointed at the client UI by default, same as pokie dev/pokie studio", async () => {
        const stubServer = createStubServer({host: "127.0.0.1", port: 3100});
        let openedUrl: string | undefined;
        const command = new ClientCommand(() => stubServer, "/fake/client/root", (url) => {
            openedUrl = url;
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot"]);

        expect(openedUrl).toBe("http://127.0.0.1:3100");

        logSpy.mockRestore();
    });

    it("does not open a browser when --no-open is given", async () => {
        const stubServer = createStubServer({host: "127.0.0.1", port: 3100});
        let openBrowserCalls = 0;
        const command = new ClientCommand(() => stubServer, "/fake/client/root", () => {
            openBrowserCalls++;
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot", "--no-open"]);

        expect(openBrowserCalls).toBe(0);

        logSpy.mockRestore();
    });

    it("accepts a packageRoot containing spaces without touching the game package itself", async () => {
        const stubServer = createStubServer({host: "127.0.0.1", port: 3100});
        const command = new ClientCommand(() => stubServer, "/fake/client/root", () => undefined);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await expect(command.run(["./my game/sample slot", "--no-open"])).resolves.toBeUndefined();
        expect(stubServer.startCalls).toBe(1);

        logSpy.mockRestore();
    });
});

describe("ClientCommand (integration, real PokieClientServer)", () => {
    // A hand-written stand-in for the compiled cli/client output — PokieClientServer.test.ts
    // already covers static-file-serving correctness in detail; this integration test is only
    // about ClientCommand correctly wiring a real PokieClientServer/port/printed addresses
    // together, so it doesn't need this repo's own dist/cli/client to have been built first.
    let clientRoot: string;

    beforeEach(() => {
        clientRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-client-command-test-"));
        fs.writeFileSync(path.join(clientRoot, "index.html"), "<html>preview</html>");
    });

    afterEach(() => {
        fs.rmSync(clientRoot, {recursive: true, force: true});
    });

    it("starts a real server on an ephemeral port and serves the client's index.html", async () => {
        let server: PokieClientServerHandling | undefined;
        const command = new ClientCommand(
            (root, options) => {
                server = new PokieClientServer(root, options);
                return server;
            },
            clientRoot,
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot", "--port", "0"]);

        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        const match = printed.match(/POKIE client UI.*http:\/\/127\.0\.0\.1:(\d+)/);
        expect(match).not.toBeNull();
        const port = Number(match![1]);

        const response = await fetch(`http://127.0.0.1:${port}/`);
        expect(response.status).toBe(200);

        await server!.stop();
        logSpy.mockRestore();
    });
});
