import {Command} from "commander";
import path from "path";
import {ArtifactBuilderRegistry, ArtifactConversionPlanner, ProjectResolving, ProjectTargetResolver} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {ParCommand} from "./ParCommand.js";
import {StakeEngineCommand} from "./StakeEngineCommand.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE = "Usage: pokie import <source> [--out <path>] [--format json] [--dry-run]";
type ImportFormat = "json";
type ImportOptions = {input: string; out?: string; format?: ImportFormat; dryRun?: boolean};

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
    private readonly registry: ArtifactBuilderRegistry;

    constructor(
        pokieVersion: string,
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        planner: ArtifactConversionPlanner = new ArtifactConversionPlanner(),
    ) {
        this.par = new ParCommand(pokieVersion);
        this.stake = new StakeEngineCommand(pokieVersion);
        this.resolveProject = resolveProject;
        this.planner = planner;
        this.registry = new ArtifactBuilderRegistry(pokieVersion);
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
            const prepared = await this.registry.preparePlan(source, "blueprint", {destinationPath: destination});
            if (prepared.status !== "planned") throw new Error(prepared.diagnostic?.message ?? "PAR import could not be planned.");
            await this.registry.validate("blueprint", source, prepared);
            if (options.dryRun) {
                console.log(`Dry run -- would import PAR workbook "${source.rootPath}" to "${destination}" (file destination). No files written.`);
                console.log(`Conversion plan: ${prepared.steps.map((step) => `${step.choice} ${step.kind}`).join(" → ")}.`);
                console.log(`Final destination: ${prepared.target.canonicalLocation ?? destination} (${prepared.preflight.destinationKind}).`);
                for (const step of prepared.steps) console.log(`Intermediate: ${step.choice} ${step.output.kind}${step.output.canonicalLocation === undefined ? "" : ` at ${step.output.canonicalLocation}`}.`);
                console.log(`Evidence: generated beside the imported Blueprint at "${destination}.conversion-evidence.json"; lossless eligibility is determined from the workbook's Meta/hash and explicit import facts.`);
                if (prepared.preflight.losses.length > 0) console.log(`Data boundary: ${prepared.preflight.losses.join(" ")}`);
                return 0;
            }
            const result = await this.registry.executePlan(prepared, source, destination);
            if (options.format === "json") console.log(JSON.stringify({outputPath: result.outputPath, conversionEvidencePath: result.conversionEvidencePath}, null, 4));
            else console.log(`Imported "${source.rootPath}" to "${result.outputPath}" with conversion evidence "${result.conversionEvidencePath}".`);
            return 0;
        }
        if (options.dryRun) {
            // Stake imports have their own one-way prepared operation, but a
            // preview must remain as non-writing as a PAR/registry preview.
            // Do not delegate to runPreparedImport: that method publishes.
            console.log(`Dry run -- would import Stake Engine export "${source.rootPath}" to "${destination}" (directory destination). No files written.`);
            console.log(`Conversion plan: materialize ${plan.operation}.`);
            console.log(`Final destination: ${plan.output.canonicalLocation ?? destination}.`);
            console.log(`Destination kind: ${plan.preflight.destinationKind}.`);
            if (plan.preflight.losses.length > 0) console.log(`Data boundary: ${plan.preflight.losses.join(" ")}`);
            return 0;
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
            .option("--dry-run", "preview the prepared import without writing anything")
            .action(() => undefined);
    }

    private parse(args: string[]): ImportOptions {
        const command = this.command();
        let options: ImportOptions | undefined;
        command.action((source: string, excess: string[], parsedOptions: {out?: string; format?: string; dryRun?: boolean}) => {
            if (!source || excess.length > 0) {
                throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
            }
            if (parsedOptions.format !== undefined && parsedOptions.format !== "json") {
                throw new Error(`--format only supports "json". ${USAGE}`);
            }
            options = {input: source, out: parsedOptions.out, format: parsedOptions.format as ImportFormat | undefined, dryRun: parsedOptions.dryRun};
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
