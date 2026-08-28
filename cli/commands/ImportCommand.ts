import path from "path";
import {Command} from "commander";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {ParCommand} from "./ParCommand.js";
import {StakeEngineCommand} from "./StakeEngineCommand.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE = "Usage: pokie import <source> [--out <path>] [--format json]";
type ImportFormat = "json";
type ImportOptions = {input: string; out?: string; format?: ImportFormat};

// A source's path is the user-facing contract here: a workbook imports as a Blueprint and a
// POKIE-produced Stake Engine export directory imports as reconstructed outcome libraries.
// Standalone analysis/diff accepts a broader, manifest-less foreign Stake directory, but import
// cannot honestly reconstruct the POKIE-only provenance fields that format does not contain.
// Keeping this dispatch in one ordinary verb lets callers move projects without first learning a
// producer-specific command namespace.
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
        return "Import a PAR workbook or POKIE-produced Stake Engine export with pokie-manifest.json into POKIE artifacts.";
    }

    public getCommanderCommand(): Command {
        return this.command();
    }

    public run(args: string[]): Promise<number> {
        let options: ImportOptions;
        try {
            options = this.parse(args);
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return Promise.resolve(0);
            }
            throw error;
        }
        // Filesystems routinely preserve a producer's uppercase `.XLSX` suffix. Extension casing
        // is not a workbook-format distinction, so normalize it before selecting the PAR reader.
        const delegate = path.extname(options.input).toLowerCase() === ".xlsx" ? this.par : this.stake;
        // `import` owns its public options before dispatching to a format-specific command. Rebuild
        // the delegated argv from the parsed public contract so every delegate receives exactly
        // the public options it supports, rather than the original, unvalidated token sequence.
        const delegatedArgs = ["import", options.input, ...(options.out === undefined ? [] : ["--out", options.out])];
        if (options.format !== undefined) delegatedArgs.push("--format", options.format);
        return delegate.run(delegatedArgs);
    }

    private command(): Command {
        return createCommanderCliCommand("import")
            .description(this.getDescription())
            .argument("<source>", "a PAR workbook or POKIE-produced Stake Engine export directory with pokie-manifest.json")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--out <path>", "where to write imported artifacts")
            .option("--format <format>", 'only "json" is supported; it selects JSON output')
            .action(() => undefined);
    }

    private parse(args: string[]): ImportOptions {
        const command = this.command();
        let options: ImportOptions | undefined;
        command.action((source: string, excess: string[], parsedOptions: {out?: string; format?: string}) => {
            if (!source || excess.length > 0) {
                throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
            }
            if (parsedOptions.format !== undefined && parsedOptions.format !== "json") {
                throw new Error(`--format only supports "json". ${USAGE}`);
            }
            options = {input: source, out: parsedOptions.out, format: parsedOptions.format as ImportFormat | undefined};
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
        return options!;
    }
}
