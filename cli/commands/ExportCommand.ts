import path from "path";
import {ArtifactBuilderRegistry, ProjectTargetResolver, type ArtifactTargetType, type ProjectResolving} from "pokie";
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
    private readonly resolveProject: ProjectResolving;

    constructor(pokieVersion: string, resolveProject: ProjectResolving = new ProjectTargetResolver()) {
        this.outcomeLibrary = new OutcomeLibraryCommand(pokieVersion);
        this.par = new ParCommand(pokieVersion);
        this.stake = new StakeEngineCommand(pokieVersion);
        this.registry = new ArtifactBuilderRegistry(pokieVersion);
        this.resolveProject = resolveProject;
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

    public async run(args: string[]): Promise<number> {
        let parsed: ExportArgs;
        try {
            parsed = this.parse(args);
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return Promise.resolve(0);
            }
            throw error;
        }
        const project = await this.resolveProject.resolve(parsed.source);
        if (project !== undefined) {
            return this.runProjectExport(parsed, project);
        }

        if (parsed.dryRun) {
            return this.validateDryRunSource(parsed).then(() => {
                const destination = this.resolveDestination(parsed);
                const destinationCheck = this.registry.checkDestination(this.artifactTarget(parsed.target), destination, parsed.source);
                if (!destinationCheck.available) {
                    throw new Error(this.describeDestinationConflict(parsed.target, destinationCheck.message));
                }
                console.log(`Dry run -- would export target "${parsed.target}" from "${parsed.source}" to "${destination}". No files written.`);
                return 0;
            });
        }
        const destination = this.resolveDestination(parsed);
        const destinationCheck = this.registry.checkDestination(this.artifactTarget(parsed.target), destination, parsed.source);
        if (!destinationCheck.available) {
            return Promise.reject(new Error(this.describeDestinationConflict(parsed.target, destinationCheck.message)));
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

    // The original config-descriptor exports remain available for users who already have standalone
    // Outcome Library/Stake Engine inputs. Resolved POKIE projects, including a Blueprint Project,
    // use the same project-to-artifact registry as `pokie build`, which is the contract this command
    // advertises in its help text.
    private async runProjectExport(args: ExportArgs, project: Awaited<ReturnType<ProjectResolving["resolve"]>> & {}): Promise<number> {
        const target = this.artifactTarget(args.target);
        const destination = this.resolveDestination(args);
        const plan = await this.registry.preparePlan(project, target, {destinationPath: destination});
        if (plan.status === "unavailable") {
            throw new Error(`${plan.diagnostic!.message} Next: ${plan.diagnostic!.recovery}`);
        }
        if (plan.status === "conflict") {
            throw new Error(this.describeDestinationConflict(args.target, plan.diagnostic!.message));
        }
        if (args.dryRun) {
            await this.registry.validate(target, project);
            console.log(`Dry run -- would export target "${args.target}" from "${project.rootPath}" to "${destination}". No files written.`);
            console.log(`Conversion plan: ${plan.steps.map((step) => `${step.choice} ${step.kind}`).join(" → ") || "no executable steps"}.`);
            console.log(`Preflight: ${plan.preflight.estimatedWork} work; ${plan.preflight.destinationKind} destination.`);
            if (plan.preflight.losses.length > 0) console.log(`Data boundary: ${plan.preflight.losses.join(" ")}`);
            return 0;
        }
        try {
            const result = await this.registry.executePlan(plan, project, destination);
            console.log(`Artifact "${args.target}" exported to "${result.outputPath}".`);
            return 0;
        } catch (error) {
            if (error instanceof Error && (/already exists|source itself|destination/i).test(error.message)) {
                throw new Error(this.describeDestinationConflict(args.target, error.message));
            }
            throw error;
        }
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

    private async validateDryRunSource(args: ExportArgs): Promise<void> {
        try {
            if (args.target === "outcomes") {
                await this.outcomeLibrary.validateBuildSource(args.source);
            } else if (args.target === "adapter") {
                await this.stake.validateExportSource(args.source);
            } else {
                this.par.validateExportSource(args.source);
            }
        } catch {
            throw new Error(this.describeSourceFailure(args));
        }
    }

    private describeSourceFailure(args: ExportArgs): string {
        let recovery: string;
        switch (args.target) {
            case "outcomes":
                recovery = "provide an outcome-library config with valid mode sources";
                break;
            case "adapter":
                recovery = "provide a Stake Engine export config with valid mode libraries and costs";
                break;
            case "workbook":
                recovery = "provide a valid GameBlueprint JSON source";
                break;
        }
        return `Cannot export target "${args.target}" because source "${args.source}" is not compatible. Next: ${recovery}, then retry.`;
    }
}
