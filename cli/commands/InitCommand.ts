import {
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    GamePackageGenerating,
    GamePackageGenerator,
    PokieGamePackageValidating,
    PokieGamePackageValidator,
} from "pokie";
import {applyBlueprintNameOverride} from "../build/applyBlueprintNameOverride.js";
import {createStarterGameBlueprint} from "../build/createStarterGameBlueprint.js";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {GameBlueprintWizard} from "../wizard/GameBlueprintWizard.js";
import {GameBlueprintWizarding} from "../wizard/GameBlueprintWizarding.js";
import {PromptAdapting} from "../wizard/PromptAdapting.js";
import {ReadlinePromptAdapter} from "../wizard/ReadlinePromptAdapter.js";
import {createCommanderCliCommand, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE = "Usage: pokie init [name]";

export class InitCommand implements CliCommandHandling {
    private readonly createStarterBlueprint: () => GameBlueprint;
    private readonly validator: GameBlueprintValidating;
    private readonly generator: GamePackageGenerating;
    private readonly packageValidator: PokieGamePackageValidating;
    private readonly wizard: GameBlueprintWizarding;
    private readonly createPrompt: () => PromptAdapting;

    constructor(
        pokieVersion: string,
        createStarterBlueprint: () => GameBlueprint = createStarterGameBlueprint,
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        generator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
        packageValidator: PokieGamePackageValidating = new PokieGamePackageValidator(),
        wizard: GameBlueprintWizarding = new GameBlueprintWizard(),
        createPrompt: () => PromptAdapting = () => new ReadlinePromptAdapter(),
    ) {
        this.createStarterBlueprint = createStarterBlueprint;
        this.validator = validator;
        this.generator = generator;
        this.packageValidator = packageValidator;
        this.wizard = wizard;
        this.createPrompt = createPrompt;
    }

    public getName(): string {
        return "init";
    }

    public getDescription(): string {
        return (
            'Create a prepared, immediately valid POKIE game package from "<name>": a real, editable ' +
            'src/index.ts a developer owns, generated and verified on the spot, no separate npm install/build ' +
            'step required -- the "programmer-first" package workflow. Run with no name for the same ' +
            'interactive wizard "pokie create" offers. For an editable GameBlueprint JSON file instead, use ' +
            '"pokie create".'
        );
    }

    // A usage failure (parseArgs) throws straight out of this call, synchronously -- but runNamed's own
    // failures (an invalid "<name>", surfaced only once parsing has already succeeded) are caught here
    // and turned into a rejected promise instead, since runNamed itself is now plain synchronous code
    // (no `await` left to do that for free the way an async method would).
    public run(args: string[]): Promise<number> {
        const name = this.parseArgs(args);
        if (name === undefined) {
            return this.runWizard();
        }
        try {
            return this.runNamed(name);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private parseArgs(args: string[]): string | undefined {
        let name: string | undefined;
        const command = createCommanderCliCommand("init")
            .argument("[name]")
            .argument("[excess...]")
            .action((parsedName: string | null, excess: string[]) => {
                if (excess.length > 0) {
                    throw new Error(`Unexpected extra argument "${excess[0]}". ${USAGE}`);
                }
                name = parsedName ?? undefined;
            });

        try {
            command.parse(args, {from: "user"});
        } catch (error) {
            throw translateCommanderError(error, {
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) => `Unknown option "${flag}". ${USAGE}`,
            });
        }
        return name;
    }

    // No name given: launch the interactive wizard (moved here from "pokie build", which no longer
    // offers it -- see BuildCommand's own doc comment) to gather a GameBlueprint's fields one at a
    // time, then run it through the exact same prepare/verify pipeline runNamed's own starter-template
    // path uses below.
    private async runWizard(): Promise<number> {
        const prompt = this.createPrompt();
        try {
            const result = await this.wizard.run(prompt);
            if (result === null) {
                console.log("\nInit cancelled.");
                return 1;
            }
            return await this.buildAndVerify(result.blueprint, result.outDir);
        } finally {
            prompt.close();
        }
    }

    private runNamed(name: string): Promise<number> {
        const blueprint = applyBlueprintNameOverride(this.createStarterBlueprint(), name);
        return this.buildAndVerify(blueprint, name);
    }

    // Validates, generates (the same canonical package contract "pokie build" produces -- package.json,
    // tsconfig.json, README.md, src/index.ts, dist/index.js, immediately loadable with no npm
    // install/build step of its own -- see GamePackageGenerator's own doc comment), then verifies the
    // freshly generated package actually loads (PokieGamePackageValidating, the same check
    // "pokie validate" runs) before ever calling it "prepared" -- satisfying "init produces a prepared,
    // immediately valid package" by construction, not by assertion.
    private async buildAndVerify(blueprint: GameBlueprint, outDir: string | undefined): Promise<number> {
        const issues = this.validator.validate(blueprint);
        const errors = issues.filter((issue) => issue.severity === "error");
        for (const issue of issues.filter((issue) => issue.severity !== "error")) {
            console.log(`  warning  ${issue.code}: ${issue.message}`);
        }
        if (errors.length > 0) {
            console.error(`Blueprint has ${errors.length} error(s):`);
            for (const issue of errors) {
                console.error(`  - ${issue.code}: ${issue.message}`);
            }
            return 1;
        }

        const result = this.generator.generate(blueprint, process.cwd(), outDir);
        for (const file of result.createdFiles) {
            console.log(`  created  ${file}`);
        }

        const report = await this.packageValidator.validate(result.projectRoot);
        if (!report.valid) {
            console.error(`Prepared package "${result.projectRoot}" is not a valid POKIE game:`);
            for (const issue of report.errors) {
                console.error(`  - ${issue.code}: ${issue.message}`);
            }
            return 1;
        }

        console.log(
            `\nGame package "${result.manifest.name}" (id: "${result.manifest.id}") prepared and verified in "${result.projectRoot}".`,
        );
        console.log(`Load it anywhere with: loadPokieGame("${result.projectRoot}") from "pokie".`);
        console.log(`\nNext:`);
        console.log(`  pokie inspect ${result.projectRoot}`);
        console.log(`  pokie sim ${result.projectRoot} --rounds 10000 --seed demo --out sim.json`);
        console.log(`  pokie dev ${result.projectRoot}`);

        return 0;
    }
}
