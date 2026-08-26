import fs from "fs";
import path from "path";

import {CliCommandHandling} from "../../cli/CliCommandHandling.js";
import {dispatch} from "../../cli/dispatch.js";
import {registerCliCommands} from "../../cli/registerCliCommands.js";

const TEST_VERSION = "1.3.0";
const COVERAGE_MAP_PATH = path.join(__dirname, "..", "..", "docs", "evidence", "p7-01-cli-inventory", "coverage-map.json");
const CLI_DOCS_PATH = path.join(__dirname, "..", "..", "docs", "cli.md");

function registeredCommands(): CliCommandHandling[] {
    return registerCliCommands({
        version: TEST_VERSION,
        pokiePackageRoot: "/fake/pokie/root",
        clientRoot: "/fake/pokie/root/dist/cli/client",
        studioRoot: "/fake/pokie/root/dist/cli/studio-client",
    });
}

async function captureFailure(argv: string[]): Promise<string> {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
        expect(await dispatch(registeredCommands(), ["node", "pokie", ...argv], TEST_VERSION)).toBe(1);
        return errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    } finally {
        errorSpy.mockRestore();
        logSpy.mockRestore();
    }
}

function expectActionable(message: string): void {
    expect(message).not.toMatch(/(?:\bENOENT\b|\bError:\s|\bat\s+.+\.(?:[cm]?[jt]s):\d+:\d+)/);
    expect(message).toMatch(/(?:Usage:|Unknown |not recognized|recognized POKIE|must be|required)/);
}

describe("residual public CLI surface", () => {
    it("keeps the executable inventory, the help tree, and the maintained CLI guide on the same public commands", () => {
        const publicCommands = registeredCommands().filter((command) => !command.getName().startsWith("__"));
        const coverage = JSON.parse(fs.readFileSync(COVERAGE_MAP_PATH, "utf8")) as {
            initialInventory: {rootCommands: string[]; nestedVerbs: string[]};
        };
        const docs = fs.readFileSync(CLI_DOCS_PATH, "utf8");
        const commandNames = publicCommands.map((command) => command.getName()).sort();
        const nestedVerbs = publicCommands
            .flatMap((command) => command.getCommanderCommand().commands.map((verb) => `${command.getName()} ${verb.name()}`))
            .sort();

        expect(coverage.initialInventory.rootCommands).toEqual(commandNames);
        expect(coverage.initialInventory.nestedVerbs).toEqual(nestedVerbs);
        for (const command of publicCommands) {
            expect(command.getCommanderCommand().helpInformation()).toContain(`Usage: ${command.getName()}`);
            expect(docs).toContain(`pokie ${command.getName()}`);
        }
        expect(docs).not.toMatch(/\bpokie (?:outcomelibrary|outcomesource|stakeengine)\b/);
    });

    it.each([
        ["unknown command", ["unknown-residual-command"], /Unknown command .*pokie --help/],
        ["missing argument", ["generate"], /Usage: pokie generate/],
        ["invalid target", ["build", "not-a-project", "--target", "not-a-target"], /Unknown --target .*must be one of/],
        ["invalid format", ["report", "missing-report.json", "--format", "xml"], /--format must be/],
        ["unknown source", ["sample", "missing-outcome-source", "--mode", "base"], /does not resolve to a recognized POKIE project/],
        ["unknown path", ["build", "missing-project", "--target", "tsPackage"], /not recognized as a POKIE project/],
    ])("returns an actionable %s diagnostic without implementation leakage", async (_label, argv, expected) => {
        const message = await captureFailure(argv);

        expect(message).toMatch(expected);
        expectActionable(message);
    });
});
