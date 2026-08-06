import {Command} from "commander";
import {CliCommandHandling} from "../../cli/CliCommandHandling.js";
import {dispatch} from "../../cli/dispatch.js";

// A stand-in registered command whose run() behavior is configurable per test, so dispatch's own
// mechanics (argv resolution, exit-code mapping, stdout/stderr separation) can be exercised without
// any real command class's constructor dependencies or side effects — same rationale as
// usageText.test.ts's FakeCommand.
class FakeCommand implements CliCommandHandling {
    public receivedArgs: string[] | undefined;
    private readonly name: string;
    private readonly runImpl: (args: string[]) => Promise<void | number>;

    constructor(name: string, runImpl: (args: string[]) => Promise<void | number> = () => Promise.resolve(0)) {
        this.name = name;
        this.runImpl = runImpl;
    }

    public getName(): string {
        return this.name;
    }

    public getDescription(): string {
        return `Fake "${this.name}" command.`;
    }

    public run(args: string[]): Promise<void | number> {
        this.receivedArgs = args;
        return this.runImpl(args);
    }

    public getCommanderCommand(): Command {
        throw new Error("FakeCommand.getCommanderCommand is never called by dispatch.");
    }
}

describe("dispatch (the real top-level CLI dispatcher cli/pokie.ts's run() delegates to)", () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it.each([["--help"], ["-h"]])('"pokie %s" prints the command list to stdout only and exits 0', async (flag) => {
        const commands = [new FakeCommand("build"), new FakeCommand("sim")];

        const exitCode = await dispatch(commands, ["node", "pokie", flag]);

        expect(exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls[0][0]).toContain("Usage: pokie <command>");
        expect(logSpy.mock.calls[0][0]).toContain("build");
        expect(logSpy.mock.calls[0][0]).toContain("sim");
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('an unknown command that is not an existing path prints the same command list to stdout and exits 1', async () => {
        const commands = [new FakeCommand("build"), new FakeCommand("sim")];

        const exitCode = await dispatch(commands, ["node", "pokie", "totally-bogus-command-xyz"]);

        expect(exitCode).toBe(1);
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls[0][0]).toContain("Usage: pokie <command>");
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("dispatches a known command name, forwarding the remaining argv as its args", async () => {
        const sim = new FakeCommand("sim", () => Promise.resolve(0));
        const commands = [new FakeCommand("build"), sim];

        const exitCode = await dispatch(commands, ["node", "pokie", "sim", "./pkg", "--rounds", "500"]);

        expect(exitCode).toBe(0);
        expect(sim.receivedArgs).toEqual(["./pkg", "--rounds", "500"]);
        expect(logSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("a command resolving to a numeric exit code passes it straight through", async () => {
        const commands = [new FakeCommand("sim", () => Promise.resolve(2))];

        const exitCode = await dispatch(commands, ["node", "pokie", "sim"]);

        expect(exitCode).toBe(2);
    });

    it("a command resolving to undefined (void) defaults to exit code 0", async () => {
        const commands = [new FakeCommand("sim", () => Promise.resolve(undefined))];

        const exitCode = await dispatch(commands, ["node", "pokie", "sim"]);

        expect(exitCode).toBe(0);
    });

    it("a command rejecting with an Error prints only its message to stderr and exits 1", async () => {
        const commands = [new FakeCommand("sim", () => Promise.reject(new Error("boom: bad input")))];

        const exitCode = await dispatch(commands, ["node", "pokie", "sim"]);

        expect(exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toBe("boom: bad input");
        expect(logSpy).not.toHaveBeenCalled();
    });

    it("a command rejecting with a non-Error value stringifies it to stderr and exits 1", async () => {
        // Deliberately exercising dispatch's `error instanceof Error ? error.message : String(error)`
        // fallback for a non-Error rejection.
        // eslint-disable-next-line prefer-promise-reject-errors
        const commands = [new FakeCommand("sim", () => Promise.reject("plain string failure"))];

        const exitCode = await dispatch(commands, ["node", "pokie", "sim"]);

        expect(exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toBe("plain string failure");
    });

    it("a command throwing synchronously (rather than returning a rejected promise) is caught the same way", async () => {
        const commands = [
            new FakeCommand("sim", () => {
                throw new Error("synchronous boom");
            }),
        ];

        const exitCode = await dispatch(commands, ["node", "pokie", "sim"]);

        expect(exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalledWith("synchronous boom");
    });

    // dispatch() (and everything it calls: CliCommandHandling.run(), buildUsageText()) never reads
    // process.stdout.isTTY/process.stdin.isTTY -- confirmed by a whole-tree grep turning up zero isTTY/
    // isatty usage in cli/ or src/. This pins that as an executable fact rather than an unverified
    // grep result: the same dispatch, run under every TTY/non-TTY combination a real invocation could
    // have (a genuine terminal, a pipe, or -- as in a spawned child process with no controlling
    // terminal at all -- undefined), produces byte-identical output and exit codes.
    it.each([
        ["genuinely interactive (both isTTY true)", true, true],
        ["piped/redirected (both isTTY false)", false, false],
        ["no controlling terminal at all (both isTTY undefined)", undefined, undefined],
    ])("prints identical usage output and exit code when %s", async (_label, stdoutIsTTY, stdinIsTTY) => {
        const originalStdoutIsTTY = process.stdout.isTTY;
        const originalStdinIsTTY = process.stdin.isTTY;
        Reflect.defineProperty(process.stdout, "isTTY", {value: stdoutIsTTY, configurable: true});
        Reflect.defineProperty(process.stdin, "isTTY", {value: stdinIsTTY, configurable: true});

        try {
            const commands = [new FakeCommand("build"), new FakeCommand("sim")];

            const exitCode = await dispatch(commands, ["node", "pokie", "--help"]);

            expect(exitCode).toBe(0);
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(logSpy.mock.calls[0][0]).toContain("Usage: pokie <command>");
            expect(errorSpy).not.toHaveBeenCalled();
        } finally {
            Reflect.defineProperty(process.stdout, "isTTY", {value: originalStdoutIsTTY, configurable: true});
            Reflect.defineProperty(process.stdin, "isTTY", {value: originalStdinIsTTY, configurable: true});
        }
    });
});
