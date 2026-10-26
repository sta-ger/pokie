import {PokieDevServerAddress} from "@fromstan/pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {InternalStudioCommand, INTERNAL_STUDIO_COMMAND_NAME} from "../../../cli/commands/InternalStudioCommand.js";
import {StudioCommand} from "../../../cli/commands/StudioCommand.js";
import {dispatch} from "../../../cli/dispatch.js";
import {resolveCliInvocation} from "../../../cli/resolveCliInvocation.js";
import {StudioServerOptions} from "../../../cli/studio/StudioServerOptions.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";

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
        const command = new StudioCommand("1.0.0", "/fake/pokie/root");

        expect(command.getName()).toBe("studio");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("supplies its installed runtime to the sibling editor package builder", () => {
        const configure = jest.spyOn(StudioBlueprintService.prototype, "withRuntimePackageRoot");
        try {
            const command = new StudioCommand("2.0.0", "/installed/pokie");
            expect(command.getName()).toBe("studio");
            expect(configure).toHaveBeenCalledWith("/installed/pokie");
        } finally {
            configure.mockRestore();
        }
    });

    it("renders the implicit entry as `pokie`, never as a public studio verb", () => {
        const command = new StudioCommand("1.0.0", "/fake/pokie/root");

        expect(command.getCommanderCommand().helpInformation()).toContain("Usage: pokie [options] [projectRoot] [excess...]");
        expect(command.getCommanderCommand().helpInformation()).not.toContain("Usage: studio");
    });

    it("throws a descriptive error for an unknown option", async () => {
        const command = new StudioCommand("1.0.0", "/fake/pokie/root", {createServer: () => createStubServer({host: "127.0.0.1", port: 3200})});

        await expect(command.run(["--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("throws a descriptive error for a non-numeric --port", async () => {
        const command = new StudioCommand("1.0.0", "/fake/pokie/root", {createServer: () => createStubServer({host: "127.0.0.1", port: 3200})});

        await expect(command.run(["--port", "nope"])).rejects.toThrow(/--port must be a non-negative integer/);
    });

    it("starts the server in home mode and opens the browser by default", async () => {
        const server = createStubServer({host: "127.0.0.1", port: 3200});
        let receivedOptions: StudioServerOptions | undefined;
        let openedUrl: string | undefined;

        const command = new StudioCommand("1.0.0", "/fake/pokie/root", {
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

    it("opens a registered package through Studio's bundled POKIE runtime when the package has no node_modules", async () => {
        const server = createStubServer({host: "127.0.0.1", port: 3200});
        let receivedOptions: StudioServerOptions | undefined;
        const repositoryRoot = path.resolve(__dirname, "../../..");
        const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");
        const command = new StudioCommand("1.0.0", repositoryRoot, {
            createServer: (options) => {
                receivedOptions = options;
                return server;
            },
            openBrowser: () => undefined,
            studioRoot: "/fake/studio/root",
            process: new FakeProcess() as unknown as NodeJS.Process,
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["--no-open"]);

        await expect(receivedOptions!.homeService.openProject(fixtureRoot)).resolves.toMatchObject({
            status: "loaded",
            game: {id: "playable-game", name: "Playable Game", version: "1.0.0"},
        });

        logSpy.mockRestore();
    });

    it("resolves a project context when a projectRoot argument is given", async () => {
        const server = createStubServer({host: "127.0.0.1", port: 3200});
        let receivedOptions: StudioServerOptions | undefined;

        const command = new StudioCommand("1.0.0", "/fake/pokie/root", {
            createServer: (options) => {
                receivedOptions = options;
                return server;
            },
            openBrowser: () => undefined,
            studioRoot: "/fake/studio/root",
            process: new FakeProcess() as unknown as NodeJS.Process,
        });
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./sample-slot"]);

        expect(receivedOptions?.initialContext).toEqual(
            expect.objectContaining({mode: "project", projectRoot: expect.stringContaining("sample-slot")}),
        );

        logSpy.mockRestore();
    });

    it("routes an existing writable Blueprint through public dispatch after an absent-output rejection, without retaining that rejection", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-public-copy-"));
        const destination = path.join(directory, "reviewed-candidate.blueprint.json");
        const fixture = path.resolve(__dirname, "../../v2/fixtures/Valera35FeralBlazingSafari.blueprint.json");
        const bytes = fs.readFileSync(fixture);
        const contexts: StudioServerOptions["initialContext"][] = [];
        const server = createStubServer({host: "127.0.0.1", port: 3200});
        const open = jest.fn();
        const command = new InternalStudioCommand(new StudioCommand("2.0.0", "/fake/pokie/root", {
            createServer: (options) => {
                contexts.push(options.initialContext);
                return server;
            },
            openBrowser: open,
            process: new FakeProcess() as unknown as NodeJS.Process,
        }));
        const argv = ["node", "pokie", destination, "--no-open"];
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
        try {
            // A proposed destination is not a published artifact. Neither the
            // shared resolver nor public dispatch should invent one on disk.
            expect(resolveCliInvocation(argv, [command.getName()])).toBeUndefined();
            expect(await dispatch([command], argv)).toBe(1);
            expect(errorSpy).toHaveBeenLastCalledWith(`Unknown command ${JSON.stringify(destination)}. Run \`pokie --help\` to list commands.`);
            expect(server.startCalls).toBe(0);
            expect(fs.existsSync(destination)).toBe(false);

            // Model the handoff only after a writable copy actually exists.
            // Reuse the same command after rejection and after later removal.
            for (let cycle = 0; cycle < 2; cycle++) {
                fs.writeFileSync(destination, bytes, {flag: "wx"});
                fs.accessSync(destination, fs.constants.R_OK | fs.constants.W_OK);
                expect(resolveCliInvocation(argv, [command.getName()])).toEqual({
                    commandName: INTERNAL_STUDIO_COMMAND_NAME,
                    args: [destination, "--no-open"],
                });
                for (let launch = 0; launch < 2; launch++) {
                    errorSpy.mockClear();
                    expect(await dispatch([command], argv)).toBe(0);
                    expect(contexts.at(-1)).toEqual({mode: "project", projectRoot: destination});
                    expect(errorSpy).not.toHaveBeenCalled();
                    expect(fs.readFileSync(destination)).toEqual(bytes);
                }
                fs.unlinkSync(destination);
                const starts = server.startCalls;
                expect(await dispatch([command], argv)).toBe(1);
                expect(server.startCalls).toBe(starts);
            }
            expect(server.startCalls).toBe(4);
            expect(open).not.toHaveBeenCalled();
            expect(fs.readFileSync(fixture)).toEqual(bytes);
        } finally {
            logSpy.mockRestore();
            errorSpy.mockRestore();
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("does not open the browser when --no-open is given", async () => {
        const server = createStubServer({host: "127.0.0.1", port: 3200});
        let openBrowserCalls = 0;

        const command = new StudioCommand("1.0.0", "/fake/pokie/root", {
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

        const command = new StudioCommand("1.0.0", "/fake/pokie/root", {
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

    it("does not exit while the server is still awaiting executor cleanup", async () => {
        let release!: () => void;
        const drained = new Promise<void>((resolve) => {
            release = resolve;
        });
        const server = createStubServer({host: "127.0.0.1", port: 3200}, () => drained);
        const fakeProcess = new FakeProcess();
        const command = new StudioCommand("1.0.0", "/fake/pokie/root", {createServer: () => server, openBrowser: () => undefined, studioRoot: "/fake/studio/root", process: fakeProcess as unknown as NodeJS.Process});
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            await command.run(["--no-open"]);
            fakeProcess.trigger("SIGINT");
            fakeProcess.trigger("SIGTERM");
            await Promise.resolve();
            expect(server.stopCalls).toBe(1);
            expect(fakeProcess.exitCalls).toEqual([]);
            release();
            await drained;
            await Promise.resolve();
            expect(fakeProcess.exitCalls).toEqual([0]);
        } finally {
            logSpy.mockRestore();
        }
    });

    it("exits 1 if stopping the server fails during shutdown", async () => {
        const server = createStubServer({host: "127.0.0.1", port: 3200}, () => Promise.reject(new Error("stop failed")));
        const fakeProcess = new FakeProcess();

        const command = new StudioCommand("1.0.0", "/fake/pokie/root", {
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
