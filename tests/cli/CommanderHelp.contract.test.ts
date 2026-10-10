import {Command, CommanderError} from "commander";
import {CliCommandHandling} from "../../cli/CliCommandHandling.js";
import {OutcomeLibraryCommand} from "../../cli/commands/OutcomeLibraryCommand.js";
import {OutcomeSourceCommand} from "../../cli/commands/OutcomeSourceCommand.js";
import {StakeEngineCommand} from "../../cli/commands/StakeEngineCommand.js";
import {isCommanderHelpDisplay} from "../../cli/commands/internal/CommanderCliAdapter.js";
import {dispatch} from "../../cli/dispatch.js";
import {registerCliCommands} from "../../cli/registerCliCommands.js";

const commands = [
    ...registerCliCommands({
        version: "1.3.0",
        pokiePackageRoot: "/fake/pokie/root",
        clientRoot: "/fake/pokie/root/dist/cli/client",
        studioRoot: "/fake/pokie/root/dist/cli/studio-client",
    }),
    // Internal handlers consume the same adapter; their noun/verb diagnostics must survive.
    new OutcomeLibraryCommand("1.3.0"),
    new OutcomeSourceCommand(),
    new StakeEngineCommand("1.3.0"),
];

function collectNodes(command: Command, args: string[] = []): {command: Command; args: string[]}[] {
    return [{command, args}, ...command.commands.flatMap((child) => collectNodes(child, [...args, child.name()]))];
}

async function invoke(command: CliCommandHandling, args: string[]): Promise<{exitCode: number; stdout: string; stderr: string}> {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
        const exitCode = await dispatch([command], ["node", "pokie", command.getName(), ...args]);
        return {
            exitCode,
            stdout: logSpy.mock.calls.map((call) => String(call[0])).join("\n"),
            stderr: errorSpy.mock.calls.map((call) => String(call[0])).join("\n"),
        };
    } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    }
}

describe("registered CLI and sibling handler help exits", () => {
    for (const handler of commands) {
        for (const node of collectNodes(handler.getCommanderCommand())) {
            const label = [handler.getName(), ...node.args].join(" ");
            it.each(["--help", "-h"])(`${label} %s renders requested help successfully`, async (flag) => {
                const result = await invoke(handler, [...node.args, flag]);
                expect(result.exitCode).toBe(0);
                expect(result.stderr).toBe("");
                expect(result.stdout).toContain(node.command.helpInformation());
            });

            // The implicit help command is advertised but absent from Commander's `.commands`.
            if (!(/^\s+help \[command\]/m).test(node.command.helpInformation())) continue;
            const helpRequests = [
                ["help"], ["help", "--help"], ["help", "-h"],
                ...node.command.commands.flatMap((child) => [
                    ["help", child.name()], ["help", child.name(), "--help"],
                ]),
            ];
            it.each(helpRequests.map((args) => [args.join(" "), args] as const))(
                `${label} %s renders requested help successfully`,
                async (_label, args) => {
                    const result = await invoke(handler, [...node.args, ...args]);
                    const requested = node.command.commands.find((child) => child.name() === args[1]) ?? node.command;
                    expect(result.exitCode).toBe(0);
                    expect(result.stderr).toBe("");
                    expect(result.stdout).toContain(requested.helpInformation());
                },
            );
            it.each([[], ["unknown-verb"], ["help", "unknown-verb"]])(
                `${label} rejects missing/unknown verbs (%j)`,
                async (...args) => {
                    const result = await invoke(handler, [...node.args, ...args]);
                    expect(result.exitCode).toBe(1);
                    expect(result.stderr).not.toBe("");
                    expect(result.stdout).toBe("");
                },
            );
        }
    }
});

describe("successful Commander help classification", () => {
    it.each(["commander.help", "commander.helpDisplayed"])("accepts %s only with exit code zero", (code) => {
        expect(isCommanderHelpDisplay(new CommanderError(0, code, "(outputHelp)"))).toBe(true);
        expect(isCommanderHelpDisplay(new CommanderError(1, code, "(outputHelp)"))).toBe(false);
    });
    it("preserves non-help failures", () => {
        expect(isCommanderHelpDisplay(new CommanderError(0, "commander.unknownCommand", "unknown command"))).toBe(false);
        expect(isCommanderHelpDisplay(new Error("not a commander error"))).toBe(false);
        expect(isCommanderHelpDisplay(undefined)).toBe(false);
    });
});
