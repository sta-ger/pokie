import {Command} from "commander";
import {
    describeProjectPresentation,
    PokieProject,
    ProjectResolving,
    ProjectTargetAmbiguousError,
    ProjectTargetMalformedError,
    ProjectTargetResolver,
    ProjectTargetUnsupportedError,
    readWasmComponentManifest,
    WASM_PRODUCT_CONTRACT,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE = "Usage: pokie inspect <packageRoot>";

export class InspectCommand implements CliCommandHandling {
    private readonly resolveProject: ProjectResolving;

    constructor(resolveProject: ProjectResolving = new ProjectTargetResolver()) {
        this.resolveProject = resolveProject;
    }

    public getName(): string {
        return "inspect";
    }

    public getDescription(): string {
        return "Identify a POKIE project and show its available next actions without running it.";
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public run(args: string[]): Promise<number> {
        const exitCodeRef = {value: 0};
        const command = this.buildCommand(exitCodeRef);

        return command
            .parseAsync(args, {from: "user"})
            .then(() => exitCodeRef.value)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                throw translateCommanderError(error, {
                    missingArgument: USAGE,
                    unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                });
            });
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `exitCodeRef` is written by the action; run() supplies its own real
    // box and reads it back once parsing resolves, while getCommanderCommand() never parses this tree
    // at all, so its own default box is never read.
    private buildCommand(exitCodeRef: {value: number} = {value: 0}): Command {
        return createCommanderCliCommand("inspect")
            .description(this.getDescription())
            .argument("<packageRoot>", "a POKIE Blueprint, game package, Outcome Library, Stake Engine export, PAR workbook, or compatible WASM component")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .action(async (packageRoot: string, excess: string[]) => {
                // An empty-string positional is "present" as far as Commander's own required-argument
                // check is concerned, but the pre-Commander behavior this preserves treated it the same
                // as an entirely missing one.
                if (!packageRoot || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                }
                exitCodeRef.value = await this.inspect(packageRoot);
            });
    }

    private async inspect(projectPath: string): Promise<number> {
        let project: PokieProject | undefined;
        try {
            project = await this.resolveProject.resolve(projectPath);
        } catch (error) {
            console.error(this.describeInspectionFailure(projectPath, error));
            return 1;
        }

        if (project === undefined) {
            console.error(
                `"${projectPath}" is not a supported POKIE project. Choose a Game Blueprint, POKIE game package, Outcome Library, Stake Engine export, PAR workbook, or compatible WASM component.`,
            );
            return 1;
        }

        try {
            await this.print(project);
            return 0;
        } catch (error) {
            if (project.type === "wasm" && error instanceof Error) {
                console.error(`POKIE could not inspect "${projectPath}". ${error.message}`);
                return 1;
            }
            throw error;
        }
    }

    private async print(project: PokieProject): Promise<void> {
        const presentation = describeProjectPresentation(project);
        console.log(`Inspecting ${presentation.kind} at "${project.rootPath}"\n`);
        console.log(`  kind             ${presentation.kind}`);
        console.log(`  purpose          ${presentation.purpose}`);

        if (project.type === "wasm") {
            await this.printWasmManifest(project);
        }

        if (presentation.nextActions.length > 0) {
            console.log("\nAvailable next actions:");
            for (const action of presentation.nextActions) {
                console.log(`  ${action.label}:\n    ${action.command.replace("<path>", `"${project.rootPath}"`)}`);
            }
        }

        if (presentation.prerequisites.length > 0) {
            console.log("\nBefore you continue:");
            for (const prerequisite of presentation.prerequisites) {
                console.log(`  - ${prerequisite}`);
            }
        }
    }

    private async printWasmManifest(project: PokieProject): Promise<void> {
        const manifestRead = await readWasmComponentManifest(project);
        if (!manifestRead.supported) {
            throw new Error(manifestRead.diagnostic.message);
        }

        const {manifest} = manifestRead;
        console.log("\nDeclared component manifest:");
        console.log(`  component id     ${manifest.component.id}`);
        console.log(`  component version ${manifest.component.version}`);
        console.log(`  schema version   ${manifest.schemaVersion}`);
        console.log(`  serialization    session=${manifest.serialization.session}, play=${manifest.serialization.play}, state=${manifest.serialization.state}`);
        console.log(`  host bindings    rng=${manifest.host.rng}, services=${manifest.host.services.length === 0 ? "none" : manifest.host.services.join(", ")}`);
        console.log(`  capabilities     ${manifest.capabilities.length === 0 ? "none" : manifest.capabilities.join(", ")}`);
    }

    private describeInspectionFailure(projectPath: string, error: unknown): string {
        if (error instanceof ProjectTargetMalformedError) {
            if (error.targetType === "wasm") {
                return `POKIE could not inspect "${projectPath}". ${error.message}`;
            }
            return `POKIE could not inspect "${projectPath}" because its project metadata is malformed. Fix the project metadata, then run "pokie inspect ${projectPath}" again.`;
        }
        if (error instanceof ProjectTargetUnsupportedError) {
            if (error.targetType === "wasm") {
                return `POKIE could not inspect "${projectPath}". ${error.message}`;
            }
            return `POKIE could not inspect "${projectPath}". ${error.message} Repair or add the compatible POKIE sidecar, then inspect it again. ${WASM_PRODUCT_CONTRACT.inspectionBoundary}`;
        }
        if (error instanceof ProjectTargetAmbiguousError) {
            return `POKIE could not identify one project kind for "${projectPath}". Keep one POKIE project format at this location, then inspect it again.`;
        }
        return `POKIE could not inspect "${projectPath}". Check that the path is readable and points to a supported POKIE project.`;
    }
}
