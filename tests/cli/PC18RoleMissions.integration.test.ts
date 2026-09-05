import fs from "fs";
import os from "os";
import path from "path";
import {loadPokieGame, type ReplayDescriptor, type SimulationReport} from "pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {InitCommand} from "../../cli/commands/InitCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {StakeEngineCommand} from "../../cli/commands/StakeEngineCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {localPokieDependencyRunner, REPO_ROOT} from "../testUtils/offlinePokieDependencyOverride.js";
import {ensureCompiledTestOutput} from "../testUtils/ensureCompiledTestOutput.js";

const POKIE_VERSION = "1.3.0";

// These are deliberately small, clean-destination missions.  PC-14/17 cover
// the exhaustive conversion matrix; this file keeps the public role goals
// together so a future change cannot make one persona depend on another one's
// generated state.
describe("PC-18 fresh public CLI role missions", () => {
    let workDir: string;

    beforeAll(() => {
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [
                path.join(REPO_ROOT, "dist", "cjs", "index.js"),
                path.join(REPO_ROOT, "dist", "cjs", "package.json"),
                path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js"),
            ],
            lockName: "compiled-runtime",
            command: ["npm", "run", "build-test-runtime"],
        });
    });

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-role-missions-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    it("lets a math designer retain PAR conversion provenance and a game/frontend developer run the resulting package", async () => {
        const authored = path.join(workDir, "math-designer.blueprint.json");
        const workbook = path.join(workDir, "math-designer.par.xlsx");
        const imported = path.join(workDir, "math-designer-imported.blueprint.json");
        const packageRoot = path.join(workDir, "runnable-package");

        expect(await new CreateCommand(POKIE_VERSION).run(["Math designer", "--random", "--seed", "18", "--out", authored])).toBe(0);
        expect(await new ValidateCommand().run([authored])).toBe(0);
        expect(await new ParCommand(POKIE_VERSION).run(["export", authored, "--out", workbook])).toBe(0);
        expect(await new ParCommand(POKIE_VERSION).run(["import", workbook, "--out", imported])).toBe(0);
        expect(JSON.parse(fs.readFileSync(`${imported}.conversion-evidence.json`, "utf8"))).toMatchObject({
            provenance: {blueprintHash: expect.stringMatching(/^sha256:/)}, provenanceHashMatches: true,
        });

        expect(await new BuildCommand(POKIE_VERSION, undefined, undefined, undefined, undefined, undefined, process.cwd()).run([
            imported, "--target", "tsPackage", "--out", packageRoot,
        ])).toBe(0);
        await expect(loadPokieGame(packageRoot)).resolves.toMatchObject({getManifest: expect.any(Function)});
        expect(fs.existsSync(path.join(packageRoot, "dist", "index.js"))).toBe(true);
    });

    it("lets QA produce seeded simulation, report and replay artifacts while invalid input remains actionable", async () => {
        const blueprint = path.join(workDir, "qa.blueprint.json");
        const packageRoot = path.join(workDir, "qa-package");
        const simulation = path.join(workDir, "qa-simulation.json");
        const report = path.join(workDir, "qa-report.md");
        const replay = path.join(workDir, "qa-replay.json");
        fs.writeFileSync(blueprint, JSON.stringify({
            manifest: {id: "pc18-qa", name: "PC-18 QA", version: "1.0.0"}, reels: 2, rows: 1,
            symbols: ["A", "B"], paytable: {A: {2: 2}}, reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
        }));
        expect(await new BuildCommand(POKIE_VERSION, undefined, undefined, undefined, undefined, undefined, process.cwd()).run([
            blueprint, "--target", "tsPackage", "--out", packageRoot,
        ])).toBe(0);

        await new SimCommand().run([packageRoot, "--rounds", "12", "--seed", "pc18", "--out", simulation]);
        expect(JSON.parse(fs.readFileSync(simulation, "utf8")) as SimulationReport).toMatchObject({rounds: 12});
        await new ReportCommand().run([simulation, "--format", "markdown", "--out", report]);
        expect(fs.readFileSync(report, "utf8")).toContain("# Simulation Report:");
        await new ReplayCommand().run([packageRoot, "--seed", "pc18", "--round", "2", "--out", replay]);
        expect(JSON.parse(fs.readFileSync(replay, "utf8")) as ReplayDescriptor).toMatchObject({round: 2});
        await expect(new SimCommand().run([packageRoot, "--rounds", "0"])).rejects.toThrow("--rounds must be a positive integer");
    });

    it("lets an integration developer cross Outcome Library and Stake boundaries, and a new-project developer retry owned preparation", async () => {
        const blueprint = path.join(workDir, "integration.blueprint.json");
        const outcomes = path.join(workDir, "outcomes");
        const stake = path.join(workDir, "stake");
        const imported = path.join(workDir, "imported-outcomes");
        fs.writeFileSync(blueprint, JSON.stringify({
            manifest: {id: "pc18-integration", name: "PC-18 Integration", version: "1.0.0"}, reels: 2, rows: 1,
            symbols: ["A", "B"], paytable: {A: {2: 2}}, reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
        }));
        const build = new BuildCommand(POKIE_VERSION, undefined, undefined, undefined, undefined, undefined, process.cwd());
        expect(await build.run([blueprint, "--target", "outcomeLibrary", "--out", outcomes])).toBe(0);
        expect(await build.run([outcomes, "--target", "stakeAdapter", "--out", stake])).toBe(0);
        expect(await new StakeEngineCommand(POKIE_VERSION).run(["import", stake, "--out", imported])).toBe(0);
        expect(await new ValidateCommand().run([imported, "--deep"])).toBe(0);

        const projectRoot = path.join(workDir, "new-project");
        const runner = localPokieDependencyRunner();
        let failBuild = true;
        const retryingRunner = (command: string, args: string[], cwd: string) => {
            if (failBuild && args[0] === "run") {
                failBuild = false;
                throw new Error("controlled preparation failure");
            }
            return runner(command, args, cwd);
        };
        await expect(new InitCommand(POKIE_VERSION, undefined, retryingRunner).run([projectRoot])).rejects.toThrow("controlled preparation failure");
        expect(fs.existsSync(path.join(projectRoot, "package.json"))).toBe(true);
        expect(await new InitCommand(POKIE_VERSION, undefined, runner).run([projectRoot])).toBe(0);
        expect(await new ValidateCommand().run([projectRoot])).toBe(0);
    }, 300000);
});
