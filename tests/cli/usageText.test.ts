import {Command} from "commander";
import {CliCommandHandling} from "../../cli/CliCommandHandling.js";
import {buildUsageText} from "../../cli/usageText.js";

// A minimal stand-in for a registered command: buildUsageText only ever reads a command's name and
// description, never runs it, so the real command classes (and their constructor dependencies) stay
// out of this test entirely.
class FakeCommand implements CliCommandHandling {
    private readonly name: string;
    private readonly description: string;

    constructor(name: string, description: string) {
        this.name = name;
        this.description = description;
    }

    public getName(): string {
        return this.name;
    }

    public getDescription(): string {
        return this.description;
    }

    public run(): Promise<void | number> {
        throw new Error("FakeCommand.run is never called by buildUsageText.");
    }

    public getCommanderCommand(): Command {
        throw new Error("FakeCommand.getCommanderCommand is never called by buildUsageText.");
    }
}

describe("buildUsageText", () => {
    const commands = [
        new FakeCommand("build", "Generate a package."),
        new FakeCommand("outcomelibrary", "Work with outcome libraries."),
        new FakeCommand("sim", "Simulate rounds."),
    ];

    it("opens with the general usage line", () => {
        expect(buildUsageText(commands)).toContain("Usage: pokie <command>");
    });

    it("lists every registered command with its description", () => {
        const usage = buildUsageText(commands);

        expect(usage).toContain("Commands:");
        for (const command of commands) {
            expect(usage).toContain(command.getName());
            expect(usage).toContain(command.getDescription());
        }
    });

    it("aligns descriptions past the longest command name", () => {
        const descriptionColumns = buildUsageText(commands)
            .split("\n")
            .filter((line) => line.startsWith("  "))
            .map((line) => (/^ {2}\S+ +/).exec(line)![0].length);

        expect(new Set(descriptionColumns).size).toBe(1);
    });

    it("does not lose a command when one name is far longer than the others", () => {
        const usage = buildUsageText(commands);

        expect(usage.split("\n").filter((line) => line.startsWith("  "))).toHaveLength(commands.length);
    });
});
