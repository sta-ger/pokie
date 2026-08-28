import path from "path";
import {ArtifactBuilderRegistry, ArtifactConversionPlanner, ProjectTargetResolver, type ArtifactConversionExecution, type ArtifactTargetType, type ProjectResolving} from "pokie";
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
    private readonly planner = new ArtifactConversionPlanner();

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

        return this.runDescriptorExport(parsed);
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
            await this.registry.validate(target, project, plan);
            console.log(`Dry run -- would export target "${args.target}" from "${project.rootPath}" to "${destination}". No files written.`);
            console.log(`Conversion plan: ${plan.steps.map((step) => `${step.choice} ${step.kind}`).join(" → ") || "no executable steps"}.`);
            console.log(`Preflight: ${plan.preflight.estimatedWork} work; ${plan.preflight.destinationKind} destination.`);
            console.log(`Final destination: ${plan.target.canonicalLocation ?? destination}.`);
            for (const step of plan.steps) console.log(`Intermediate: ${step.choice} ${step.output.kind}${step.output.canonicalLocation ? ` at ${step.output.canonicalLocation}` : ""}.`);
            if (plan.steps.some((step) => step.kind === "importParWorkbook")) {
                console.log("Evidence eligibility: determined by durable PAR conversion facts and Meta/hash provenance.");
            }
            if (plan.preflight.losses.length > 0) console.log(`Data boundary: ${plan.preflight.losses.join(" ")}`);
            return 0;
        }
        try {
            const result = await this.registry.executePlan(plan, project, destination);
            console.log(`Artifact "${args.target}" exported to "${result.outputPath}".`);
            if (result.importedBlueprintPath !== undefined) console.log(`Imported Blueprint: ${result.importedBlueprintPath}.`);
            if (result.conversionEvidencePath !== undefined) console.log(`Conversion evidence: ${result.conversionEvidencePath}.`);
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

    /**
     * Legacy descriptors retain their documented readers, but no longer take a
     * detour through another public command.  The outer `export` action binds
     * source and destination once; its prepared operation owns validation
     * ordering, destination safety, cancellation, rollback and the terminal
     * diagnostic boundary.
     */
    private async runDescriptorExport(args: ExportArgs): Promise<number> {
        const destination = this.resolveDestination(args);
        const controller = new AbortController();
        const onCancel = () => controller.abort();
        process.once("SIGINT", onCancel);
        try {
            // A descriptor's parser and writer are format adapters only.  The
            // Export command executes their returned hooks through exactly one
            // planner operation; it never dispatches another public command.
            if (args.target === "outcomes") {
                const prepared = this.outcomeLibrary.prepareDescriptorBuildOperation(args.source, destination, controller.signal);
                await this.executeDescriptorOperation(prepared, args.dryRun);
            } else if (args.target === "adapter") {
                const prepared = this.stake.prepareDescriptorExportOperation(args.source, destination, controller.signal);
                await this.executeDescriptorOperation(prepared, args.dryRun);
            } else {
                const prepared = this.par.prepareDescriptorExportOperation(args.source, destination, controller.signal);
                await this.executeDescriptorOperation(prepared, args.dryRun);
            }
        } catch (error) {
            if (error instanceof Error && (/already exists|source itself|destination|occupied/i).test(error.message)) {
                throw new Error(this.describeDestinationConflict(args.target, error.message));
            }
            // A prepared operation has already bound the exact descriptor and
            // its reader inputs.  Preserve a drift or reader diagnostic here:
            // reducing it to the old target-matrix wording loses the failed
            // edge and actionable recovery the prepared operation established.
            throw error;
        } finally {
            process.off("SIGINT", onCancel);
        }
        if (args.dryRun) {
            console.log(`Dry run -- would export target "${args.target}" from "${args.source}" to "${destination}". No files written.`);
        }
        return 0;
    }

    private async executeDescriptorOperation(
        prepared: {readonly plan: import("pokie").ArtifactConversionPlan; readonly validate: () => Promise<void> | void; readonly execution: ArtifactConversionExecution<unknown, unknown>},
        dryRun: boolean,
    ): Promise<void> {
        if (!dryRun) {
            await this.planner.executeConversionPlan(prepared.plan, prepared.execution);
            return;
        }
        await prepared.validate();
        await this.planner.executeConversionPlan(prepared.plan, {
            ...prepared.execution,
            // Keep destination policy and source drift checks active for a
            // preview while making its publisher a no-op.
            publish: () => Promise.resolve(undefined),
            rollback: () => Promise.resolve(undefined),
        });
    }

}
