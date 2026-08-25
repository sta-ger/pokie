import path from "path";
import {ArtifactBuilderRegistry, type ArtifactTargetType} from "pokie";
import {Command} from "commander";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {OutcomeLibraryCommand} from "./OutcomeLibraryCommand.js";
import {ParCommand} from "./ParCommand.js";
import {StakeEngineCommand} from "./StakeEngineCommand.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

type ExportTarget = "outcomes" | "adapter" | "workbook";
type ExportArgs = {source: string; target: ExportTarget; out?: string; dryRun: boolean};

const USAGE = "Usage: pokie export <source> --to outcomes|adapter|workbook [--out <path>] [--dry-run]";

// Export is deliberately target-oriented. The source descriptor remains the existing stable JSON
// contract, while the public CLI now names the artifact a project will receive rather than the
// implementation which happens to write it.
export class ExportCommand implements CliCommandHandling {
    private readonly outcomeLibrary: OutcomeLibraryCommand;
    private readonly par: ParCommand;
    private readonly stake: StakeEngineCommand;
    private readonly registry: ArtifactBuilderRegistry;

    constructor(pokieVersion: string) {
        this.outcomeLibrary = new OutcomeLibraryCommand(pokieVersion);
        this.par = new ParCommand(pokieVersion);
        this.stake = new StakeEngineCommand(pokieVersion);
        this.registry = new ArtifactBuilderRegistry(pokieVersion);
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
        const destination = this.resolveDestination(parsed);
        const destinationCheck = this.registry.checkDestination(this.artifactTarget(parsed.target), destination, parsed.source);
        if (!destinationCheck.available) {
            return Promise.reject(new Error(this.describeDestinationConflict(parsed.target, destinationCheck.message)));
        }
        if (parsed.dryRun) {
            console.log(`Dry run -- would export target "${parsed.target}" from "${parsed.source}" to "${destination}". No files written.`);
            return Promise.resolve(0);
        }

        const forwarded = args.filter((value, index) => value !== "--to" && args[index - 1] !== "--to" && value !== "--dry-run");
        let forwardedRun: Promise<number>;
        if (parsed.target === "outcomes") {
            forwardedRun = this.outcomeLibrary.run(["build", ...forwarded]);
        } else if (parsed.target === "adapter") {
            forwardedRun = this.stake.run(["export", ...forwarded]);
        } else {
            forwardedRun = this.par.run(["export", ...forwarded]);
        }
        return forwardedRun.catch((error: unknown) => {
            if (error instanceof Error && (/already exists|source itself|destination/i).test(error.message)) {
                throw new Error(
                    `Cannot export target "${parsed.target}" because its destination is unavailable. ${error.message} ` +
                        "Next: choose a different --out path or remove the existing destination, then retry.",
                );
            }
            throw error;
        });
    }

    private command(): Command {
        return createCommanderCliCommand("export")
            .description(this.getDescription())
            .argument("<source>", "a source descriptor or Blueprint Project")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .requiredOption("--to <artifact>", "outcomes, adapter, or workbook")
            .option("--out <path>", "where to write the exported artifact")
            .option("--dry-run", "preview the resolved export destination without writing anything")
            .action(() => undefined);
    }

    private parse(args: string[]): ExportArgs {
        const command = this.command();
        let parsed: ExportArgs | undefined;
        command.action((source: string, excess: string[], options: {to?: string; out?: string; dryRun?: boolean}) => {
            if (!source || excess.length > 0) {
                throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
            }
            if (options.to !== "outcomes" && options.to !== "adapter" && options.to !== "workbook") {
                throw new Error(`--to must be outcomes, adapter, or workbook. ${USAGE}`);
            }
            parsed = {source, target: options.to, out: options.out, dryRun: options.dryRun ?? false};
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

    private artifactTarget(target: ExportTarget): ArtifactTargetType {
        switch (target) {
            case "outcomes":
                return "outcomeLibrary";
            case "adapter":
                return "stakeAdapter";
            case "workbook":
                return "parWorkbook";
        }
        throw new Error(`Unknown export target "${target}".`);
    }

    private resolveDestination(args: ExportArgs): string {
        if (args.out !== undefined) return args.out;
        switch (args.target) {
            case "outcomes":
                return path.join(path.dirname(args.source), "outcomelibrary");
            case "adapter":
                return path.join(path.dirname(args.source), "stakeengine");
            case "workbook": {
                const basename = path.basename(args.source).replace(/\.blueprint\.json$/i, "").replace(/\.json$/i, "");
                return path.join(path.dirname(args.source), `${basename}.par.xlsx`);
            }
        }
        throw new Error(`Unknown export target "${args.target}".`);
    }

    private describeDestinationConflict(target: ExportTarget, detail: string): string {
        return `Cannot export target "${target}" because its destination is unavailable. ${detail} ` +
            "Next: choose a different --out path or remove the existing destination, then retry.";
    }
}
