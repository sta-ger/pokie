import {PokieDevServerAddress} from "pokie";
import {StudioCommand} from "../../../cli/commands/StudioCommand.js";
import {StudioServerOptions} from "../../../cli/studio/StudioServerOptions.js";

function createStubServer(
    address: PokieDevServerAddress,
    onStop: () => Promise<void> = () => Promise.resolve(),
): {startCalls: number; stopCalls: number; start(): Promise<PokieDevServerAddress>; stop(): Promise<void>} {
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
    };
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

describe("StudioCommand", () => {
    it("has the expected name and description", () => {
        const command = new StudioCommand("1.0.0");

        expect(command.getName()).toBe("studio");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new StudioCommand("1.0.0", {createServer: () => createStubServer({host: "127.0.0.1", port: 3200})});

        await expect(command.run(["--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error for a non-numeric --port", async () => {
        const command = new StudioCommand("1.0.0", {createServer: () => createStubServer({host: "127.0.0.1", port: 3200})});

        await expect(command.run(["--port", "nope"])).rejects.toThrow(/--port must be a non-negative integer/);
    });

    it("starts the server in home mode and opens the browser by default", async () => {
        const server = createStubServer({host: "127.0.0.1", port: 3200});
        let receivedOptions: StudioServerOptions | undefined;
        let openedUrl: string | undefined;

        const command = new StudioCommand("1.0.0", {
            createServer: (options) => {
                receivedOptions = options;
                return server;
            },
            openBrowser: (url) => {
                openedUrl = url;
            },
            studioRoot: "/fake/studio/root",
            process: new FakeProcess() as unknown as NodeJS.Process,
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run([]);

        expect(receivedOptions?.studioRoot).toBe("/fake/studio/root");
        expect(receivedOptions?.initialContext).toEqual({mode: "home"});
        expect(server.startCalls).toBe(1);
        expect(openedUrl).toBe("http://127.0.0.1:3200");

        logSpy.mockRestore();
    });

    it("resolves a project context when a projectRoot argument is given", async () => {
        const server = createStubServer({host: "127.0.0.1", port: 3200});
        let receivedOptions: StudioServerOptions | undefined;

        const command = new StudioCommand("1.0.0", {
            createServer: (options) => {
                receivedOptions = options;
                return server;
            },
            openBrowser: () => undefined,
            studioRoot: "/fake/studio/root",
            process: new FakeProcess() as unknown as NodeJS.Process,
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./crazy-fruits"]);

        expect(receivedOptions?.initialContext).toEqual(
            expect.objectContaining({mode: "project", projectRoot: expect.stringContaining("crazy-fruits")}),
        );

        logSpy.mockRestore();
    });

    it("does not open the browser when --no-open is given", async () => {
        const server = createStubServer({host: "127.0.0.1", port: 3200});
        let openBrowserCalls = 0;

        const command = new StudioCommand("1.0.0", {
            createServer: () => server,
            openBrowser: () => {
                openBrowserCalls++;
            },
            studioRoot: "/fake/studio/root",
            process: new FakeProcess() as unknown as NodeJS.Process,
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["--no-open"]);

        expect(openBrowserCalls).toBe(0);

        logSpy.mockRestore();
    });

    it("stops the server and exits 0 on SIGINT", async () => {
        const server = createStubServer({host: "127.0.0.1", port: 3200});
        const fakeProcess = new FakeProcess();

        const command = new StudioCommand("1.0.0", {
            createServer: () => server,
            openBrowser: () => undefined,
            studioRoot: "/fake/studio/root",
            process: fakeProcess as unknown as NodeJS.Process,
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["--no-open"]);
        fakeProcess.trigger("SIGINT");
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(server.stopCalls).toBe(1);
        expect(fakeProcess.exitCalls).toEqual([0]);

        logSpy.mockRestore();
    });

    it("exits 1 if stopping the server fails during shutdown", async () => {
        const server = createStubServer({host: "127.0.0.1", port: 3200}, () => Promise.reject(new Error("stop failed")));
        const fakeProcess = new FakeProcess();

        const command = new StudioCommand("1.0.0", {
            createServer: () => server,
            openBrowser: () => undefined,
            studioRoot: "/fake/studio/root",
            process: fakeProcess as unknown as NodeJS.Process,
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["--no-open"]);
        fakeProcess.trigger("SIGTERM");
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(fakeProcess.exitCalls).toEqual([1]);

        logSpy.mockRestore();
    });
});
