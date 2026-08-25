import {GameBlueprint, ValidationIssue} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";

// End-to-end coverage for first-class random game generation (SlotGameNameGenerator +
// RandomGameBlueprintGenerator), now that "pokie build" no longer has a "random"/"--random" entry point
// of its own: "pokie create --random" is the one place a random game is generated (writing a Blueprint
// Project JSON file), and "pokie build <project> --target tsPackage" is the one place any Blueprint
// Project (random or hand-authored) becomes a real, playable package -- proving the written blueprint is
// genuinely a complete, buildable Blueprint Project, not just a shape-valid in-memory value.
describe("CLI workflow (integration): first-class random game generation", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-random-build-test-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    it('"pokie create <name> --random" writes a valid, per-reel-generated Blueprint Project that "pokie build" can turn into a real, playable package', async () => {
        const originalCwd = process.cwd();
        process.chdir(workDir);
        try {
            const exitCode = await new CreateCommand("1.3.0").run(["my-random-game", "--random", "--seed", "5"]);

            expect(exitCode).toBe(0);
            const blueprintPath = path.join(workDir, "my-random-game.blueprint.json");
            expect(fs.existsSync(blueprintPath)).toBe(true);

            const blueprint = JSON.parse(fs.readFileSync(blueprintPath, "utf-8")) as GameBlueprint;
            expect(blueprint.manifest.id).toBe("my-random-game");
            expect(blueprint.manifest.name).toBe("My Random Game");
            expect(blueprint.symbolWeights).toBeUndefined();
            expect(blueprint.reelStripGeneration).toHaveLength(blueprint.reels);

            const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toMatch(/Provenance: generator [\d.]+, strategy "default-line-pay"\./);

            const projectRoot = path.join(workDir, "my-random-game");
            const buildExitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--target", "tsPackage", "--out", projectRoot]);
            expect(buildExitCode).toBe(0);
            expect(fs.existsSync(path.join(projectRoot, "dist", "index.js"))).toBe(true);

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const game = require(path.join(projectRoot, "dist", "index.js")) as {getManifest(): {id: string}};
            expect(game.getManifest().id).toBe("my-random-game");

            const validateExitCode = await new ValidateCommand().run([projectRoot]);
            expect(validateExitCode).toBe(0);
        } finally {
            process.chdir(originalCwd);
        }
    });

    it('"pokie create <name> --random --preset variant" writes a valid Blueprint Project using the richer strategy', async () => {
        const originalCwd = process.cwd();
        process.chdir(workDir);
        try {
            const exitCode = await new CreateCommand("1.3.0").run(["my-variant-game", "--random", "--seed", "99", "--preset", "variant"]);

            expect(exitCode).toBe(0);
            const blueprintPath = path.join(workDir, "my-variant-game.blueprint.json");
            expect(fs.existsSync(blueprintPath)).toBe(true);

            const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toMatch(/Provenance: generator [\d.]+, strategy "random-variant"\./);

            const projectRoot = path.join(workDir, "my-variant-game");
            const buildExitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--target", "tsPackage", "--out", projectRoot]);
            expect(buildExitCode).toBe(0);

            const validateExitCode = await new ValidateCommand().run([projectRoot]);
            expect(validateExitCode).toBe(0);
        } finally {
            process.chdir(originalCwd);
        }
    });

    it("the randomly generated blueprint always passes GameBlueprintValidator with zero errors across many seeds", async () => {
        const {GameBlueprintValidator, RandomGameBlueprintGenerator} = await import("pokie");
        const generator = new RandomGameBlueprintGenerator();
        const validator = new GameBlueprintValidator();

        for (let seed = 1; seed <= 25; seed++) {
            const {blueprint} = generator.generate({seed});
            const issues: ValidationIssue[] = validator.validate(blueprint);
            expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
        }
    });
});
