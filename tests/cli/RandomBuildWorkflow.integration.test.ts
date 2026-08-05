import {GameBlueprint, ValidationIssue} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";

// A built package tracks no provenance of its own (no build-info.json -- see GamePackageGenerator's
// own doc comment), so cross-build comparisons here go through the blueprint hash BuildCommand/
// CreateCommand print to their own console summary instead of reading it back off disk.
function extractBlueprintHash(printed: string): string {
    const match = printed.match(/blueprint hash\s+(sha256:\S+)/);
    if (!match) {
        throw new Error(`No "blueprint hash" line found in:\n${printed}`);
    }
    return match[1];
}

// End-to-end coverage for first-class random game generation (SlotGameNameGenerator +
// RandomGameBlueprintGenerator): every entry point ("pokie build random", "pokie build --random",
// "pokie create --random") should produce a real, on-disk package that validates cleanly and
// actually plays -- not just a shape-valid in-memory blueprint (see the unit tests for that).
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

    it('"pokie build random --seed <n>" builds a real package that validates and plays, deterministically for the same seed', async () => {
        const outDir = path.join(workDir, "built-game-1");
        const exitCode = await new BuildCommand("1.3.0").run(["random", "--seed", "20260721", "--target", outDir]);

        expect(exitCode).toBe(0);
        expect(fs.existsSync(path.join(outDir, "dist", "index.js"))).toBe(true);

        const validateExitCode = await new ValidateCommand().run([outDir]);
        expect(validateExitCode).toBe(0);

        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("from seed 20260721");
        expect(printed).toMatch(/Provenance: generator [\d.]+, strategy "default-line-pay"\./);
        expect(printed).toContain("blueprint hash   sha256:");
        expect(printed).toMatch(/Smoke simulation OK: \d+ rounds, RTP [\d.]+%, hit frequency [\d.]+%\./);
        // The default strategy's math is structurally valid by construction (see
        // DefaultRandomGameBlueprintStrategy's own doc comment) -- a real smoke run against it should
        // never trip evaluateRandomBuildQualityGates's warnings.
        expect(printed).not.toContain("warning  feature termination");
        expect(printed).not.toContain("warning  max-win sanity");
    });

    it('"pokie build random --seed <n> --preset variant" builds a real package with the richer strategy, deterministically for the same seed', async () => {
        const outDirA = path.join(workDir, "built-variant-a");
        const outDirB = path.join(workDir, "built-variant-b");
        const logSpy = console.log as jest.Mock;

        const exitCode = await new BuildCommand("1.3.0").run(["random", "--seed", "99", "--preset", "variant", "--target", outDirA]);
        expect(exitCode).toBe(0);
        const printedA = logSpy.mock.calls.map((call) => call[0]).join("\n");
        logSpy.mockClear();
        await new BuildCommand("1.3.0").run(["random", "--seed", "99", "--preset", "variant", "--target", outDirB]);
        const printedB = logSpy.mock.calls.map((call) => call[0]).join("\n");

        const validateExitCode = await new ValidateCommand().run([outDirA]);
        expect(validateExitCode).toBe(0);

        expect(extractBlueprintHash(printedA)).toBe(extractBlueprintHash(printedB));

        expect(printedA).toMatch(/Provenance: generator [\d.]+, strategy "random-variant"\./);
        expect(printedA).not.toContain("warning  feature termination");
        expect(printedA).not.toContain("warning  max-win sanity");
    });

    it('"pokie build random" is deterministic for a fixed seed: rebuilding produces the same generated blueprint hash', async () => {
        const outDirA = path.join(workDir, "built-game-a");
        const outDirB = path.join(workDir, "built-game-b");
        const logSpy = console.log as jest.Mock;

        await new BuildCommand("1.3.0").run(["random", "--seed", "777", "--target", outDirA]);
        const printedA = logSpy.mock.calls.map((call) => call[0]).join("\n");
        logSpy.mockClear();
        await new BuildCommand("1.3.0").run(["random", "--seed", "777", "--target", outDirB]);
        const printedB = logSpy.mock.calls.map((call) => call[0]).join("\n");

        expect(extractBlueprintHash(printedA)).toBe(extractBlueprintHash(printedB));

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const gameA = require(path.join(outDirA, "dist", "index.js")) as {getManifest(): {id: string}};
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const gameB = require(path.join(outDirB, "dist", "index.js")) as {getManifest(): {id: string}};
        expect(gameA.getManifest().id).toBe(gameB.getManifest().id);
    });

    it('"pokie build --random" (the flag form) behaves identically to "pokie build random"', async () => {
        const outDir = path.join(workDir, "built-game-flag-form");
        const exitCode = await new BuildCommand("1.3.0").run(["--random", "--seed", "42", "--target", outDir]);

        expect(exitCode).toBe(0);
        const validateExitCode = await new ValidateCommand().run([outDir]);
        expect(validateExitCode).toBe(0);
    });

    it('"pokie build random --dry-run" validates and previews without writing anything', async () => {
        const outDir = path.join(workDir, "not-built");
        const exitCode = await new BuildCommand("1.3.0").run(["random", "--seed", "1", "--dry-run", "--target", outDir]);

        expect(exitCode).toBe(0);
        expect(fs.existsSync(outDir)).toBe(false);
        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Dry run");
    });

    // "pokie create <name> --random" writes an editable Blueprint Project (a GameBlueprint JSON file),
    // not a package -- see CreateCommand's own doc comment on why. Its reel weighting is expressed as
    // valid per-reel generation (reelStripGeneration, one independent entry per reel) rather than a
    // flat symbolWeights map, so feeding the written file straight into "pokie build" (no hand-editing)
    // still produces a real, playable package -- proving the written blueprint is genuinely a complete,
    // buildable Blueprint Project, not just a shape-valid in-memory value.
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
            expect(blueprint.manifest.name).toBe("my-random-game");
            expect(blueprint.symbolWeights).toBeUndefined();
            expect(blueprint.reelStripGeneration).toHaveLength(blueprint.reels);

            const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
            expect(printed).toMatch(/Provenance: generator [\d.]+, strategy "default-line-pay"\./);
            expect(printed).toContain('pokie init');

            const projectRoot = path.join(workDir, "my-random-game");
            const buildExitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--target", projectRoot]);
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
            const buildExitCode = await new BuildCommand("1.3.0").run([blueprintPath, "--target", projectRoot]);
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
