import path from "path";
import {Command} from "commander";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {ParCommand} from "./ParCommand.js";
import {StakeEngineCommand} from "./StakeEngineCommand.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE = "Usage: pokie import <source> [--out <path>] [--format json]";

// A source's path is the user-facing contract here: a workbook imports as a Blueprint and any
// directory imports as a read-only outcome-source export. Keeping that dispatch in one ordinary
// verb lets callers move projects without first learning a producer-specific command namespace.
export class ImportCommand implements CliCommandHandling {
    private readonly par: ParCommand;
    private readonly stake: StakeEngineCommand;

    constructor(pokieVersion: string) {
        this.par = new ParCommand(pokieVersion);
        this.stake = new StakeEngineCommand(pokieVersion);
    }

    public getName(): string {
        return "import";
    }

    public getDescription(): string {
        return "Import a recognized workbook or outcome directory into POKIE artifacts.";
    }

    public getCommanderCommand(): Command {
        return this.command();
    }

    public run(args: string[]): Promise<number> {
        let input: string;
        try {
            input = this.parse(args);
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return Promise.resolve(0);
            }
            throw error;
        }
        const delegate = path.extname(input) === ".xlsx" ? this.par : this.stake;
        return delegate.run(["import", ...args]);
    }

    private command(): Command {
        return createCommanderCliCommand("import")
            .description(this.getDescription())
            .argument("<source>", "a workbook or an outcome export directory")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--out <path>", "where to write imported artifacts")
            .option("--format <format>", 'only "json" is supported for workbook import')
            .action(() => undefined);
    }

    private parse(args: string[]): string {
        const command = this.command();
        let input: string | undefined;
        command.action((source: string, excess: string[]) => {
            if (!source || excess.length > 0) {
                throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
            }
            input = source;
        });
        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                throw error;
            }
            throw translateCommanderError(error, {
                missingArgument: USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) => `${flag} requires a value. ${USAGE}`,
            });
        }
        return input!;
    }
}
