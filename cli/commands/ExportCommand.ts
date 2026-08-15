import {Command} from "commander";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {OutcomeLibraryCommand} from "./OutcomeLibraryCommand.js";
import {ParCommand} from "./ParCommand.js";
import {StakeEngineCommand} from "./StakeEngineCommand.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type ExportTarget = "outcomes" | "adapter" | "workbook";
type ExportArgs = {source: string; target: ExportTarget};

const USAGE = "Usage: pokie export <source> --to outcomes|adapter|workbook [--out <path>]";

// Export is deliberately target-oriented. The source descriptor remains the existing stable JSON
// contract, while the public CLI now names the artifact a project will receive rather than the
// implementation which happens to write it.
export class ExportCommand implements CliCommandHandling {
    private readonly outcomeLibrary: OutcomeLibraryCommand;
    private readonly par: ParCommand;
    private readonly stake: StakeEngineCommand;

    constructor(pokieVersion: string) {
        this.outcomeLibrary = new OutcomeLibraryCommand(pokieVersion);
        this.par = new ParCommand(pokieVersion);
        this.stake = new StakeEngineCommand(pokieVersion);
    }

    public getName(): string {
        return "export";
    }

    public getDescription(): string {
        return "Export a source descriptor to a selected POKIE artifact type.";
    }

    public getCommanderCommand(): Command {
        return this.command();
    }

    public run(args: string[]): Promise<number> {
        let parsed: ExportArgs;
        try {
            parsed = this.parse(args);
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return Promise.resolve(0);
            }
            throw error;
        }
        const forwarded = args.filter((value, index) => value !== "--to" && args[index - 1] !== "--to");
        if (parsed.target === "outcomes") {
            return this.outcomeLibrary.run(["build", ...forwarded]);
        }
        if (parsed.target === "adapter") {
            return this.stake.run(["export", ...forwarded]);
        }
        return this.par.run(["export", ...forwarded]);
    }

    private command(): Command {
        return createCommanderCliCommand("export")
            .description(this.getDescription())
            .argument("<source>", "a source descriptor or Blueprint Project")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .requiredOption("--to <artifact>", "outcomes, adapter, or workbook")
            .option("--out <path>", "where to write the exported artifact")
            .action(() => undefined);
    }

    private parse(args: string[]): ExportArgs {
        const command = this.command();
        let parsed: ExportArgs | undefined;
        command.action((source: string, excess: string[], options: {to?: string}) => {
            if (!source || excess.length > 0) {
                throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
            }
            if (options.to !== "outcomes" && options.to !== "adapter" && options.to !== "workbook") {
                throw new Error(`--to must be outcomes, adapter, or workbook. ${USAGE}`);
            }
            parsed = {source, target: options.to};
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
        return parsed!;
    }
}
