import {
    buildGameBuildInfo,
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    GamePackageGenerating,
    GamePackageGenerator,
    loadGameBlueprint,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {GameBlueprintWizard} from "../wizard/GameBlueprintWizard.js";
import {GameBlueprintWizarding} from "../wizard/GameBlueprintWizarding.js";
import {PromptAdapting} from "../wizard/PromptAdapting.js";
import {ReadlinePromptAdapter} from "../wizard/ReadlinePromptAdapter.js";

type BuildOptions = {
    configPath: string;
    outDir?: string;
    dryRun: boolean;
};

const USAGE = "Usage: pokie build <config.json> [--out <dir>] [--dry-run]";
const BLUEPRINT_HINT =
    "<config.json> is a GameBlueprint (manifest, reels, rows, symbols, paytable, ...) — see docs/cli.md#pokie-build-configjson for the format.";

export class BuildCommand implements CliCommandHandling {
    private readonly pokieVersion: string;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly validator: GameBlueprintValidating;
    private readonly generator: GamePackageGenerating;
    private readonly wizard: GameBlueprintWizarding;
    private readonly createPrompt: () => PromptAdapting;

    constructor(
        pokieVersion: string,
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        generator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
        wizard: GameBlueprintWizarding = new GameBlueprintWizard(),
        createPrompt: () => PromptAdapting = () => new ReadlinePromptAdapter(),
    ) {
        this.pokieVersion = pokieVersion;
        this.loadBlueprint = loadBlueprint;
        this.validator = validator;
        this.generator = generator;
        this.wizard = wizard;
        this.createPrompt = createPrompt;
    }

    public getName(): string {
        return "build";
    }

    public getDescription(): string {
        return (
            "Generate a POKIE game package from a GameBlueprint JSON config (reels, symbols, paylines, paytable), " +
            "or interactively via a wizard when run with no config path. --dry-run validates and previews without " +
            "writing anything."
        );
    }

    public run(args: string[]): Promise<number> {
        if (args.length === 0) {
            return this.runWizard();
        }

        try {
            const options = this.parseArgs(args);
            const blueprint = this.loadBlueprint(options.configPath);
            return Promise.resolve(this.buildFromBlueprint(blueprint, options.outDir, options.configPath, options.dryRun));
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private async runWizard(): Promise<number> {
        const prompt = this.createPrompt();
        try {
            const result = await this.wizard.run(prompt);
            if (result === null) {
                console.log("\nBuild cancelled.");
                return 1;
            }
            return this.buildFromBlueprint(result.blueprint, result.outDir, undefined, false);
        } finally {
            prompt.close();
        }
    }

    private buildFromBlueprint(blueprint: unknown, outDir: string | undefined, sourcePath: string | undefined, dryRun: boolean): number {
        const issues = this.validator.validate(blueprint);
        const errors = issues.filter((issue) => issue.severity === "error");
        const warnings = issues.filter((issue) => issue.severity !== "error");

        for (const issue of warnings) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }

        if (errors.length > 0) {
            console.error(`Blueprint${sourcePath ? ` "${sourcePath}"` : ""} has ${errors.length} error(s):`);
            for (const issue of errors) {
                console.error(`  - ${issue.code}: ${issue.message}`);
            }
            console.error(`\n${BLUEPRINT_HINT}`);
            return 1;
        }

        if (dryRun) {
            this.printDryRunSummary(blueprint as GameBlueprint, sourcePath);
            return 0;
        }

        const result = this.generator.generate(blueprint as GameBlueprint, process.cwd(), outDir, sourcePath);

        console.log("Build summary:");
        for (const file of result.createdFiles) {
            console.log(`  created          ${file}`);
        }
        console.log(`  package root     ${result.projectRoot}`);
        console.log(`  game             ${result.manifest.name} (id: "${result.manifest.id}", v${result.manifest.version})`);
        console.log(`  blueprint hash   ${result.buildInfo.blueprintHash}`);
        if (result.buildInfo.source) {
            console.log(`  source           ${result.buildInfo.source}`);
        }
        console.log(
            `  status           ${
                result.unchanged
                    ? "unchanged — deterministic rebuild (blueprint, pokie version, and source all match the previous build)"
                    : "generated"
            }`,
        );

        console.log(`\nGame package "${result.manifest.name}" (id: "${result.manifest.id}") built in "${result.projectRoot}".`);
        console.log(`\nNext:`);
        console.log(`  cd ${result.projectRoot} && npm install`);
        console.log(`  pokie validate ${result.projectRoot}`);
        console.log(`  pokie sim ${result.projectRoot} --rounds 10000 --seed demo --out sim.json`);
        console.log(`  pokie report sim.json`);
        console.log(`  pokie replay ${result.projectRoot} --seed demo --round 1`);
        console.log(`  pokie dev ${result.projectRoot}`);

        return 0;
    }

    // Previews what "pokie build" would generate without touching the filesystem: same validation,
    // same blueprintHash computation (buildGameBuildInfo is a pure function — no file I/O), just no
    // GamePackageGenerator.generate() call, so there's no --out directory to reason about at all.
    private printDryRunSummary(blueprint: GameBlueprint, sourcePath: string | undefined): void {
        const buildInfo = buildGameBuildInfo(blueprint, this.pokieVersion, sourcePath);
        const paylines = blueprint.paylines ? String(blueprint.paylines.length) : "default (one horizontal line per row)";
        const bets = blueprint.availableBets ? blueprint.availableBets.join(", ") : "default";

        console.log("Dry run — blueprint is valid, no files written.\n");
        console.log("Blueprint summary:");
        console.log(`  game             ${blueprint.manifest.name} (id: "${blueprint.manifest.id}", v${blueprint.manifest.version})`);
        console.log(`  reels x rows     ${blueprint.reels} x ${blueprint.rows}`);
        console.log(`  symbols          ${blueprint.symbols.length}`);
        console.log(`  paylines         ${paylines}`);
        console.log(`  bets             ${bets}`);
        console.log(`  blueprint hash   ${buildInfo.blueprintHash}`);
        console.log(`  would generate   ${buildInfo.files!.join(", ")}`);
    }

    private parseArgs(args: string[]): BuildOptions {
        const [configPath, ...rest] = args;
        if (!configPath) {
            throw new Error(`${USAGE}\n${BLUEPRINT_HINT}`);
        }

        let outDir: string | undefined;
        let dryRun = false;
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a directory path. ${USAGE}`);
                    }
                    outDir = value;
                    i++;
                    break;
                }
                case "--dry-run": {
                    dryRun = true;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        return {configPath, outDir, dryRun};
    }
}
