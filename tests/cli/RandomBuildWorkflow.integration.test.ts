import {ValidationIssue} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";

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
        const exitCode = await new BuildCommand("1.3.0").run(["random", "--seed", "20260721", "--out", outDir]);

        expect(exitCode).toBe(0);
        expect(fs.existsSync(path.join(outDir, "src", "generated", "index.js"))).toBe(true);

        const validateExitCode = await new ValidateCommand().run([outDir]);
        expect(validateExitCode).toBe(0);

        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("from seed 20260721");
        expect(printed).toMatch(/Smoke simulation OK: \d+ rounds, RTP [\d.]+%, hit frequency [\d.]+%\./);
    });

    it('"pokie build random" is deterministic for a fixed seed: rebuilding produces the same generated blueprint hash', async () => {
        const outDirA = path.join(workDir, "built-game-a");
        const outDirB = path.join(workDir, "built-game-b");

        await new BuildCommand("1.3.0").run(["random", "--seed", "777", "--out", outDirA]);
        await new BuildCommand("1.3.0").run(["random", "--seed", "777", "--out", outDirB]);

        const buildInfoA = JSON.parse(fs.readFileSync(path.join(outDirA, "src", "generated", "build-info.json"), "utf-8"));
        const buildInfoB = JSON.parse(fs.readFileSync(path.join(outDirB, "src", "generated", "build-info.json"), "utf-8"));

        expect(buildInfoA.blueprintHash).toBe(buildInfoB.blueprintHash);
        expect(buildInfoA.game.id).toBe(buildInfoB.game.id);
    });

    it('"pokie build --random" (the flag form) behaves identically to "pokie build random"', async () => {
        const outDir = path.join(workDir, "built-game-flag-form");
        const exitCode = await new BuildCommand("1.3.0").run(["--random", "--seed", "42", "--out", outDir]);

        expect(exitCode).toBe(0);
        const validateExitCode = await new ValidateCommand().run([outDir]);
        expect(validateExitCode).toBe(0);
    });

    it('"pokie build random --dry-run" validates and previews without writing anything', async () => {
        const outDir = path.join(workDir, "not-built");
        const exitCode = await new BuildCommand("1.3.0").run(["random", "--seed", "1", "--dry-run", "--out", outDir]);

        expect(exitCode).toBe(0);
        expect(fs.existsSync(outDir)).toBe(false);
        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Dry run");
    });

    it('"pokie create <name> --random" creates a real, playable package named after <name>', async () => {
        const originalCwd = process.cwd();
        process.chdir(workDir);
        try {
            const exitCode = await new CreateCommand("1.3.0").run(["my-random-game", "--random", "--seed", "5"]);

            expect(exitCode).toBe(0);
            const projectRoot = path.join(workDir, "my-random-game");
            expect(fs.existsSync(path.join(projectRoot, "src", "generated", "index.js"))).toBe(true);

            const buildInfo = JSON.parse(fs.readFileSync(path.join(projectRoot, "src", "generated", "build-info.json"), "utf-8"));
            expect(buildInfo.game.name).toBe("my-random-game");

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
            const {blueprint} = generator.generate(seed);
            const issues: ValidationIssue[] = validator.validate(blueprint);
            expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
        }
    });
});
