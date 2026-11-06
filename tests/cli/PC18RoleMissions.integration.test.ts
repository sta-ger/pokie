import {expectInconclusiveArtifactValidation} from "../testUtils/expectInconclusiveArtifactValidation.js";
import {createPackageExtractionTestEnvironment} from "../v2/fixtures/PackageExtractionFixture.js";
import fs from "fs";
import os from "os";
import path from "path";
import {execFileSync} from "child_process";
import {pathToFileURL} from "url";
import {loadPokieGame, releasePokieGame, type ReplayDescriptor, type SimulationReport} from "@fromstan/pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {InitCommand} from "../../cli/commands/InitCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {StakeEngineCommand} from "../../cli/commands/StakeEngineCommand.js";
import {localPokieDependencyRunner, REPO_ROOT} from "../testUtils/offlinePokieDependencyOverride.js";
import {ensureCompiledTestOutput} from "../testUtils/ensureCompiledTestOutput.js";

const POKIE_VERSION = "1.3.0";

it("preserves authenticated candidate pins across the complete role-mission fixture correction", () => {
    const cache = path.resolve(__dirname, "../../node_modules/.cache/pokie-tmp");
    fs.mkdirSync(cache, {recursive: true});
    const directory = fs.mkdtempSync(path.join(cache, "pc18-role-candidate-"));
    try {
        // Synthetic receipts exercise the shared selectors without rebuilding,
        // repackaging or collecting any installed/browser acceptance evidence.
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import {mkdir, readFile, writeFile} from "node:fs/promises";
            import {execFileSync} from "node:child_process";
            import path from "node:path";
            import {candidateFixture, commitP911ToolingDescendant, P911_TOOLING_DESCENDANT_PATHS} from ${JSON.stringify(pathToFileURL(path.resolve("tests/testUtils/createP911CandidateFixture.mjs")).href)};
            import {readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            import {authenticateP805ProductTree} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p8-05-release-handoff.mjs")).href)};
            const fixture = await candidateFixture(${JSON.stringify(directory)});
            const options = {repository: fixture.repository};
            const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256};
            const readers = [readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment];
            const original = await readers[0](environment, options);
            const correctionPaths = ["scripts/p8-05-release-handoff.mjs", "scripts/p9-11-candidate.mjs",
                "tests/cli/PC18RoleMissions.integration.test.ts", "tests/testUtils/createP911CandidateFixture.mjs"];
            for (const file of correctionPaths) {
                assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), "missing correction path: " + file);
                await writeFile(path.join(fixture.repository, file), "// Bounded role-mission test correction.");
            }
            const git = args => execFileSync("git", args, {cwd: fixture.repository, encoding: "utf8"}).trim();
            git(["add", "."]);
            git(["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "bounded role-mission test correction"]);
            const correctedId = git(["rev-parse", "HEAD"]);
            assert.deepEqual(authenticateP805ProductTree(fixture.handoff.candidateId, correctedId, fixture.repository).changedToolingAndEvidencePaths, correctionPaths);
            for (const reader of readers) {
                const selected = await reader({...environment, POKIE_PACK_SMOKE_CANDIDATE_ID: correctedId,
                    POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: original.archiveSha256}, options);
                assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, correctionPaths);
                assert.deepEqual({...selected, equivalence: original.equivalence}, original);
            }
            await commitP911ToolingDescendant(fixture);
            for (const reader of readers) {
                const selected = await reader(environment, options);
                assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, [...P911_TOOLING_DESCENDANT_PATHS].sort());
                assert.deepEqual({...selected, equivalence: original.equivalence}, original);
            }
            for (const reference of [fixture.reference, fixture.handoff.browserDriver, fixture.handoff.buildReceipt, fixture.handoff.installReceipt,
                {path: fixture.handoff.archivePath}, {path: path.join(original.packageRoot, "dist/cli/pokie.js")}]) {
                const bytes = await readFile(reference.path);
                await writeFile(reference.path, "changed pinned input");
                for (const reader of readers) await assert.rejects(reader(environment, options),
                    /authenticated controller browser driver required|receipt digest mismatch|archive digest mismatch|stale installed asset/);
                await writeFile(reference.path, bytes);
            }
            await assert.rejects(readers[1]({...environment, POKIE_PACK_SMOKE_CANDIDATE_ID: correctedId}, options), /smoke reviewed candidate identity mismatch/);
            await assert.rejects(readers[1]({...environment, POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: "0".repeat(64)}, options), /smoke archive digest mismatch/);
            git(["reset", "--hard", correctedId]);
            for (const file of ["tests/cli/PC18RoleMissions.extra.test.ts", "src/index.ts", "package.json", "tsconfig.prod.json"]) {
                const target = path.join(fixture.repository, file);
                await mkdir(path.dirname(target), {recursive: true});
                await writeFile(target, "changed protected input");
                git(["add", "."]);
                git(["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "protected input fixture"]);
                assert.throws(() => authenticateP805ProductTree(fixture.handoff.candidateId, git(["rev-parse", "HEAD"]), fixture.repository), /product or build inputs/);
                for (const reader of readers) await assert.rejects(reader(environment, options), /product\\/build inputs changed/);
                git(["reset", "--hard", correctedId]);
            }
        `], {timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

// These are deliberately small, clean-destination missions.  PC-14/17 cover
// the exhaustive conversion matrix; this file keeps the public role goals
// together so a future change cannot make one persona depend on another one's
// generated state.
describe("PC-18 fresh public CLI role missions", () => {
    let workDir: string;
    let runtimePackageRoot: string;

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

    let restoreTemporaryDirectory: () => void;
    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
        // Native package loads snapshot their dependency. Bind generated packages to
        // the staged compiled runtime, not the checkout's docs/tests/mutable dist.
        runtimePackageRoot = path.join(os.tmpdir(), "node_modules/@fromstan/pokie");
    });
    afterAll(() => {
        restoreTemporaryDirectory();
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
        await expectInconclusiveArtifactValidation([authored]);
        expect(await new ParCommand(POKIE_VERSION).run(["export", authored, "--out", workbook])).toBe(0);
        expect(await new ParCommand(POKIE_VERSION).run(["import", workbook, "--out", imported])).toBe(0);
        expect(JSON.parse(fs.readFileSync(`${imported}.conversion-evidence.json`, "utf8"))).toMatchObject({
            provenance: {blueprintHash: expect.stringMatching(/^sha256:/)}, provenanceHashMatches: true,
        });

        expect(await new BuildCommand(POKIE_VERSION, undefined, undefined, undefined, undefined, undefined, runtimePackageRoot).run([
            imported, "--target", "tsPackage", "--out", packageRoot,
        ])).toBe(0);
        const game = await loadPokieGame(packageRoot);
        try {
            expect(game.getManifest()).toMatchObject({id: expect.any(String)});
        } finally {
            await releasePokieGame(game);
        }
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
        expect(await new BuildCommand(POKIE_VERSION, undefined, undefined, undefined, undefined, undefined, runtimePackageRoot).run([
            blueprint, "--target", "tsPackage", "--out", packageRoot,
        ])).toBe(0);
        expect(fs.realpathSync(path.join(packageRoot, "node_modules/@fromstan/pokie"))).toBe(fs.realpathSync(runtimePackageRoot));

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
        const build = new BuildCommand(POKIE_VERSION, undefined, undefined, undefined, undefined, undefined, runtimePackageRoot);
        expect(await build.run([blueprint, "--target", "outcomeLibrary", "--out", outcomes])).toBe(0);
        expect(await build.run([outcomes, "--target", "stakeAdapter", "--out", stake])).toBe(0);
        expect(await new StakeEngineCommand(POKIE_VERSION).run(["import", stake, "--out", imported])).toBe(0);
        await expectInconclusiveArtifactValidation([imported, "--deep"]);

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
        await expectInconclusiveArtifactValidation([projectRoot]);
    }, 300000);
});
