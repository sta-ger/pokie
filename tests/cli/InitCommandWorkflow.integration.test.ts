import fs from "fs";
import os from "os";
import path from "path";
import {SimulationReport} from "pokie";
import {InitCommand} from "../../cli/commands/InitCommand.js";
import {GamePackagePreparationError} from "../../cli/prepare/GamePackagePreparationError.js";
import {PackageCommandRunning} from "../../cli/prepare/PackageCommandRunner.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {localPokieDependencyRunner, REPO_ROOT} from "../testUtils/offlinePokieDependencyOverride.js";
import {ensureCompiledTestOutput} from "../testUtils/ensureCompiledTestOutput.js";

const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");
const COMPILED_CJS_PACKAGE_JSON = path.join(REPO_ROOT, "dist", "cjs", "package.json");
const COMPILED_ESM_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js");

// End-to-end proof that "pokie init [directory]" -- the in-place, non-interactive package workflow --
// really does produce an immediately usable package with a real "npm install"/"npm run build", not
// just against injected fakes (see InitCommand.test.ts for the fast, fully-injected coverage of every
// flag/branch). Real npm calls are slow, which is why this lives in the "pokie-integration" project
// (see jest.config.mjs's `*.integration.test.ts` glob) rather than the default fast lane, and why the
// whole install is kept offline via localPokieDependencyRunner -- see
// tests/testUtils/offlinePokieDependencyOverride.ts's own doc comment for why that's necessary.
describe("CLI workflow (integration): pokie init (in-place, non-interactive) produces a package that validates/sims/reports", () => {
    jest.setTimeout(300000);

    let workDir: string;

    beforeAll(() => {
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [COMPILED_CJS_ENTRY, COMPILED_CJS_PACKAGE_JSON, COMPILED_ESM_WORKER_ENTRY],
            lockName: "compiled-runtime",
            command: ["npm", "run", "build-test-runtime"],
        });
    });

    beforeEach(() => {
        // The space is deliberate: PackageCommandRunning always passes args as an array straight to
        // execFile, never through a shell, so a project root that itself needs shell-unsafe quoting
        // must resolve identically to one that doesn't -- see "space directories" in the acceptance
        // criteria this file backs.
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie init workflow "));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    it("merges/installs/builds/verifies an empty directory (with a space in its path) into a ready package.json/package-lock.json/tsconfig.json/README.md/src/index.ts/dist/index.js, then validates, simulates, and reports on it", async () => {
        const projectRoot = path.join(workDir, "sample slot");
        fs.mkdirSync(projectRoot);

        const initCommand = new InitCommand("1.3.0", undefined, localPokieDependencyRunner());
        const initExitCode = await initCommand.run([projectRoot, "--game-id", "sample-slot"]);

        expect(initExitCode).toBe(0);
        for (const relativeFile of [
            "package.json",
            "package-lock.json",
            "tsconfig.json",
            "README.md",
            path.join("src", "index.ts"),
            path.join("dist", "index.js"),
        ]) {
            expect(fs.existsSync(path.join(projectRoot, relativeFile))).toBe(true);
        }

        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8")) as {scripts?: {start?: string}};
        expect(pkg.scripts?.start).toBe("pokie dev .");

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const game = require(path.join(projectRoot, "dist", "index.js")) as {getManifest(): {id: string}};
        expect(game.getManifest().id).toBe("sample-slot");

        expect(await new ValidateCommand().run([projectRoot])).toBe(0);

        const simFile = path.join(workDir, "sim.json");
        await new SimCommand().run([projectRoot, "--rounds", "300", "--seed", "demo", "--out", simFile]);
        const report = JSON.parse(fs.readFileSync(simFile, "utf-8")) as SimulationReport;
        expect(report.game.id).toBe("sample-slot");
        expect(report.rounds).toBe(300);

        const reportFile = path.join(workDir, "sim.md");
        await new ReportCommand().run([simFile, "--format", "markdown", "--out", reportFile]);
        expect(fs.readFileSync(reportFile, "utf-8")).toContain("# Simulation Report:");
    });

    it("merges into an existing, non-empty npm project only with --yes, preserving its own unrelated package.json fields", async () => {
        const projectRoot = path.join(workDir, "existing-project");
        fs.mkdirSync(projectRoot);
        fs.writeFileSync(
            path.join(projectRoot, "package.json"),
            JSON.stringify({name: "existing-project", version: "1.0.0", description: "a project that predates pokie init"}),
        );
        fs.writeFileSync(path.join(projectRoot, "notes.txt"), "hand-written notes\n");

        const refused = await new InitCommand("1.3.0", undefined, localPokieDependencyRunner()).run([projectRoot]);
        expect(refused).toBe(1);
        expect(fs.existsSync(path.join(projectRoot, "src", "index.ts"))).toBe(false);

        const accepted = await new InitCommand("1.3.0", undefined, localPokieDependencyRunner()).run([projectRoot, "--yes"]);
        expect(accepted).toBe(0);

        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8")) as {
            name: string;
            description: string;
            dependencies?: Record<string, string>;
        };
        expect(pkg.name).toBe("existing-project");
        expect(pkg.description).toBe("a project that predates pokie init");
        expect(pkg.dependencies?.pokie).toBeDefined();
        expect(fs.readFileSync(path.join(projectRoot, "notes.txt"), "utf-8")).toBe("hand-written notes\n");
        expect(fs.existsSync(path.join(projectRoot, "dist", "index.js"))).toBe(true);
    });

    it("reports a real `npm run build` failure as an actionable, retryable 'build' error, then succeeds on retry once the source is fixed", async () => {
        const projectRoot = path.join(workDir, "sample-slot");
        fs.mkdirSync(projectRoot);
        const baseRunner = localPokieDependencyRunner();
        // Simulates a developer hand-editing src/index.ts between merging and their first build,
        // introducing a real TypeScript error -- injected right before "npm run build" spawns, so
        // "npm install" (and the package-lock.json it writes) still completes normally first.
        const sabotagingRunner: PackageCommandRunning = (command, args, cwd) => {
            if (args[0] === "run") {
                fs.appendFileSync(path.join(cwd, "src", "index.ts"), "\nconst thisIsNotValidTypeScript: string = 42;\n");
            }
            return baseRunner(command, args, cwd);
        };

        let caught: unknown;
        try {
            await new InitCommand("1.3.0", undefined, sabotagingRunner).run([projectRoot]);
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(GamePackagePreparationError);
        expect((caught as GamePackagePreparationError).phase).toBe("build");
        expect(fs.existsSync(path.join(projectRoot, "package-lock.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "dist", "index.js"))).toBe(false);

        const brokenSource = fs.readFileSync(path.join(projectRoot, "src", "index.ts"), "utf-8");
        fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), brokenSource.replace("\nconst thisIsNotValidTypeScript: string = 42;\n", ""));

        const retryExitCode = await new InitCommand("1.3.0", undefined, baseRunner).run([projectRoot]);

        expect(retryExitCode).toBe(0);
        expect(fs.existsSync(path.join(projectRoot, "dist", "index.js"))).toBe(true);
        expect(await new ValidateCommand().run([projectRoot])).toBe(0);
    });
});
