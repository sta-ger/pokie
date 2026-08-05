import {GamePackageInspecting, GamePackageInspectionReport, GamePackageInspector} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

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

    public run(args: string[]): Promise<number> {
        let exitCode = 0;
        const command = createCommanderCliCommand("inspect")
            .argument("<packageRoot>")
            .argument("[excess...]")
            .action((packageRoot: string, excess: string[]) => {
                // An empty-string positional is "present" as far as Commander's own required-argument
                // check is concerned, but the pre-Commander behavior this preserves treated it the same
                // as an entirely missing one.
                if (!packageRoot || excess.length > 0) {
                    throw new Error(excess.length > 0 ? `Unknown option "${excess[0]}". ${USAGE}` : USAGE);
                }
                const report = this.inspector.inspect(packageRoot);
                this.print(report);
                exitCode = report.valid ? 0 : 1;
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            return Promise.reject(
                translateCommanderError(error, {
                    missingArgument: USAGE,
                    unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                }),
            );
        }
        return Promise.resolve(exitCode);
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
