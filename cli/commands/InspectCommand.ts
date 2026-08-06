import {Command} from "commander";
import {GamePackageInspecting, GamePackageInspectionReport, GamePackageInspector} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE = "Usage: pokie inspect <packageRoot>";

export class InspectCommand implements CliCommandHandling {
    private readonly inspector: GamePackageInspecting;

    constructor(inspector: GamePackageInspecting = new GamePackageInspector()) {
        this.inspector = inspector;
    }

    public getName(): string {
        return "inspect";
    }

    public getDescription(): string {
        return "Print a package's package.json (name, version, description) without running it.";
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public run(args: string[]): Promise<number> {
        const exitCodeRef = {value: 0};
        const command = this.buildCommand(exitCodeRef);

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            if (isCommanderHelpDisplay(error)) {
                return Promise.resolve(0);
            }
            return Promise.reject(
                translateCommanderError(error, {
                    missingArgument: USAGE,
                    unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                }),
            );
        }
        return Promise.resolve(exitCodeRef.value);
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `exitCodeRef` is written by the action; run() supplies its own real
    // box and reads it back once parsing resolves, while getCommanderCommand() never parses this tree
    // at all, so its own default box is never read.
    private buildCommand(exitCodeRef: {value: number} = {value: 0}): Command {
        return createCommanderCliCommand("inspect")
            .description(this.getDescription())
            .argument("<packageRoot>", "an existing POKIE game package")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .action((packageRoot: string, excess: string[]) => {
                // An empty-string positional is "present" as far as Commander's own required-argument
                // check is concerned, but the pre-Commander behavior this preserves treated it the same
                // as an entirely missing one.
                if (!packageRoot || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                }
                const report = this.inspector.inspect(packageRoot);
                this.print(report);
                exitCodeRef.value = report.valid ? 0 : 1;
            });
    }

    private print(report: GamePackageInspectionReport): void {
        if (!report.valid) {
            console.error(report.error);
            return;
        }

        console.log(`Inspecting package at "${report.packageRoot}"\n`);
        console.log(`  package.json     name: "${report.packageJson?.name ?? "(unknown)"}", version: "${report.packageJson?.version ?? "(unknown)"}"`);
    }
}
