import {
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    GamePackageGenerating,
    GamePackageGenerator,
    loadGameBlueprint,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";

type BuildOptions = {
    configPath: string;
    outDir?: string;
};

const USAGE = "Usage: pokie build <config.json> [--out <dir>]";
const BLUEPRINT_HINT =
    "<config.json> is a GameBlueprint (manifest, reels, rows, symbols, paytable, ...) — see docs/cli.md#pokie-build-configjson for the format.";

export class BuildCommand implements CliCommandHandling {
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly validator: GameBlueprintValidating;
    private readonly generator: GamePackageGenerating;

    constructor(
        pokieVersion: string,
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        generator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
    ) {
        this.loadBlueprint = loadBlueprint;
        this.validator = validator;
        this.generator = generator;
    }

    public getName(): string {
        return "build";
    }

    public getDescription(): string {
        return "Generate a POKIE game package from a GameBlueprint JSON config (reels, symbols, paylines, paytable).";
    }

    public run(args: string[]): Promise<number> {
        try {
            const options = this.parseArgs(args);

            const blueprint = this.loadBlueprint(options.configPath);
            const issues = this.validator.validate(blueprint);
            const errors = issues.filter((issue) => issue.severity === "error");
            const warnings = issues.filter((issue) => issue.severity !== "error");

            for (const issue of warnings) {
                console.log(`  warning  ${issue.code}: ${issue.message}`);
            }

            if (errors.length > 0) {
                console.error(`Blueprint "${options.configPath}" has ${errors.length} error(s):`);
                for (const issue of errors) {
                    console.error(`  - ${issue.code}: ${issue.message}`);
                }
                console.error(`\n${BLUEPRINT_HINT}`);
                return Promise.resolve(1);
            }

            const result = this.generator.generate(blueprint as GameBlueprint, process.cwd(), options.outDir, options.configPath);

            for (const file of result.createdFiles) {
                console.log(`  created  ${file}`);
            }
            console.log(`\nGame package "${result.manifest.name}" (id: "${result.manifest.id}") built in "${result.projectRoot}".`);
            console.log(`\nNext:`);
            console.log(`  cd ${result.projectRoot} && npm install`);
            console.log(`  pokie validate ${result.projectRoot}`);
            console.log(`  pokie sim ${result.projectRoot} --rounds 10000 --seed demo --out sim.json`);
            console.log(`  pokie report sim.json`);
            console.log(`  pokie replay ${result.projectRoot} --seed demo --round 1`);
            console.log(`  pokie dev ${result.projectRoot}`);

            return Promise.resolve(0);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private parseArgs(args: string[]): BuildOptions {
        const [configPath, ...rest] = args;
        if (!configPath) {
            throw new Error(`${USAGE}\n${BLUEPRINT_HINT}`);
        }

        let outDir: string | undefined;
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
                default:
                    throw new Error(`Unknown option "${flag}". ${USAGE}`);
            }
        }

        return {configPath, outDir};
    }
}
