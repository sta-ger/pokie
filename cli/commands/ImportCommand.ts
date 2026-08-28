import {Command} from "commander";
import path from "path";
import {ArtifactConversionPlanner, ProjectResolving, ProjectTargetResolver} from "pokie";
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
    private readonly resolveProject: ProjectResolving;
    private readonly planner: ArtifactConversionPlanner;

    constructor(
        pokieVersion: string,
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        planner: ArtifactConversionPlanner = new ArtifactConversionPlanner(),
    ) {
        this.par = new ParCommand(pokieVersion);
        this.stake = new StakeEngineCommand(pokieVersion);
        this.resolveProject = resolveProject;
        this.planner = planner;
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
        return this.delegate(options);
    }

    private async delegate(options: ImportOptions): Promise<number> {
        const source = await this.resolveProject.resolve(options.input);
        if (source === undefined || (source.type !== "parWorkbook" && source.type !== "stakeAdapter")) {
            throw new Error(`"${options.input}" is not a recognized PAR workbook or POKIE-produced Stake Engine export. ${USAGE}`);
        }
        // Import owns an explicit planner operation rather than reusing a
        // same-kind build plan as a guard.  PAR creates a Blueprint and Stake
        // creates an Outcome Library; neither operation advertises a reverse
        // or lossless conversion edge.
        const outputKind = source.type === "parWorkbook" ? "blueprint" : "outcomeLibrary";
        const destination = options.out ?? this.defaultDestination(options.input, outputKind);
        const plan = this.planner.planImportOutput(source, outputKind, destination);
        if (plan.status !== "planned") {
            throw new Error(`${plan.diagnostic?.message ?? "This import source is unavailable."} Next: ${plan.diagnostic?.recovery ?? "resolve a supported exchange source and retry."}`);
        }
        if (source.type === "parWorkbook") {
            return this.par.runPreparedImport(source, plan, options.input, destination, options.format === "json" ? "json" : "summary");
        }
        return this.stake.runPreparedImport(source, plan, options.input, destination, options.format === "json" ? "json" : "summary");
    }

    private defaultDestination(input: string, outputKind: "blueprint" | "outcomeLibrary"): string {
        if (outputKind === "outcomeLibrary") {
            return path.join(path.dirname(input), `${path.basename(input)}-imported`);
        }
        return path.join(path.dirname(input), `${path.basename(input, path.extname(input))}.blueprint.json`);
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
