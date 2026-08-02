import {execFile} from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import {GamePackagePreparationError} from "../../../cli/prepare/GamePackagePreparationError.js";
import {GamePackagePreparer} from "../../../cli/prepare/GamePackagePreparer.js";
import {PackageCommandResult, PackageCommandRunning, runPackageCommand} from "../../../cli/prepare/PackageCommandRunner.js";
import {ensureCompiledTestOutput} from "../../testUtils/ensureCompiledTestOutput.js";

const execFileAsync = util.promisify(execFile);

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");
const COMPILED_CJS_PACKAGE_JSON = path.join(REPO_ROOT, "dist", "cjs", "package.json");
const COMPILED_ESM_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js");

// Every other GamePackagePreparer test injects a fake PackageCommandRunning so it never actually
// shells out. This file is the opposite: it runs the preparer with its real, uninjected
// runPackageCommand (a real spawned "npm"), against this repo's own freshly compiled output --
// resolved via a `file:` dependency, never the published registry version, which can (and does,
// mid-development) lag behind this checkout. Real `npm install`/`npm run build` calls are slow, which
// is exactly why this file -- unlike GamePackagePreparer.test.ts -- is matched into the slower
// "pokie-integration" project (see jest.config.mjs's `*.integration.test.ts` glob) instead of running
// in the default fast lane.
//
// The whole install is kept offline on purpose: pointing "pokie" at this checkout still leaves
// "typescript" (a direct devDependency) and, transitively, this checkout's own "dependencies" --
// plus *their* dependencies, recursively (e.g. "exceljs" alone pulls in dozens of packages like
// "archiver" and "@fast-csv/format") -- as ordinary registry specifiers, exactly the kind of fetch a
// network-restricted CI sandbox can't complete. Redirecting all of them to this checkout's own
// already-installed copies via `file:` (direct deps) and `overrides` (the full transitive closure,
// which this scaffolded package never declares directly) means "npm install" here never needs the
// registry at all.
function collectTransitiveDependencyNames(rootNames: string[]): string[] {
    const collected = new Set<string>();
    const queue = [...rootNames];
    while (queue.length > 0) {
        const name = queue.shift() as string;
        if (collected.has(name)) {
            continue;
        }
        collected.add(name);
        const pkgPath = path.join(REPO_ROOT, "node_modules", name, "package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {dependencies?: Record<string, string>};
        queue.push(...Object.keys(pkg.dependencies ?? {}));
    }
    return [...collected];
}

function localPokieDependencyRunner(realRunCommand: PackageCommandRunning = runPackageCommand): PackageCommandRunning {
    return (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        if (args[0] === "install") {
            const packageJsonPath = path.join(cwd, "package.json");
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
                dependencies?: Record<string, string>;
                devDependencies?: Record<string, string>;
                overrides?: Record<string, string>;
            };
            const repoPackageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as {
                dependencies?: Record<string, string>;
            };
            const localFileSpec = (name: string): string => `file:${path.join(REPO_ROOT, "node_modules", name)}`;
            packageJson.dependencies = {...packageJson.dependencies, pokie: `file:${REPO_ROOT}`};
            packageJson.devDependencies = {...packageJson.devDependencies, typescript: localFileSpec("typescript")};
            const transitiveNames = collectTransitiveDependencyNames(Object.keys(repoPackageJson.dependencies ?? {}));
            packageJson.overrides = {
                ...packageJson.overrides,
                ...Object.fromEntries(transitiveNames.map((name) => [name, localFileSpec(name)])),
            };
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4));
        }
        return realRunCommand(command, args, cwd);
    };
}

describe("GamePackagePreparer (real npm install, real tsc build, real spawned npm)", () => {
    jest.setTimeout(300000);

    let parentDir: string;

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
        // must resolve identically to one that doesn't.
        parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie prepare real "));
    });

    afterEach(() => {
        fs.rmSync(parentDir, {recursive: true, force: true});
    });

    it("runs a real create -> npm install -> npm run build -> verify lifecycle in a path containing spaces, producing package-lock.json and dist/index.js", async () => {
        const preparer = new GamePackagePreparer("1.3.0", undefined, localPokieDependencyRunner());

        const result = await preparer.prepare(parentDir, "sample-slot");

        const projectRoot = path.join(parentDir, "sample-slot");
        expect(result.projectRoot).toBe(projectRoot);
        expect(result.phasesCompleted).toEqual(["create", "dependencies", "build", "verify"]);
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
    });

    it("reports a real unavailable npm manager as an actionable, retryable 'dependencies' failure, then succeeds on retry without redoing 'create'", async () => {
        const emptyPathDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-empty-path-"));
        const runWithoutNpmOnPath: PackageCommandRunning = async (command, args, cwd) => {
            const {stdout, stderr} = await execFileAsync(command, args, {cwd, env: {PATH: emptyPathDir}});
            return {stdout: stdout.toString(), stderr: stderr.toString()};
        };

        const projectRoot = path.join(parentDir, "sample-slot");
        let caught: unknown;
        try {
            await new GamePackagePreparer("1.3.0", undefined, runWithoutNpmOnPath).prepare(parentDir, "sample-slot");
        } catch (error) {
            caught = error;
        } finally {
            fs.rmSync(emptyPathDir, {recursive: true, force: true});
        }

        expect(caught).toBeInstanceOf(GamePackagePreparationError);
        expect((caught as GamePackagePreparationError).phase).toBe("dependencies");
        expect((caught as GamePackagePreparationError).message).toContain("npm install");
        expect((caught as GamePackagePreparationError).message.toLowerCase()).toContain("enoent");
        expect(fs.existsSync(path.join(projectRoot, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "package-lock.json"))).toBe(false);

        const result = await new GamePackagePreparer("1.3.0", undefined, localPokieDependencyRunner()).prepare(parentDir, "sample-slot");

        expect(result.phasesCompleted).toEqual(["create", "dependencies", "build", "verify"]);
        expect(fs.existsSync(path.join(projectRoot, "package-lock.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "dist", "index.js"))).toBe(true);
    });

    it("recovers from a real `npm run build` failure by fixing the broken source and retrying, without ever re-running 'npm install'", async () => {
        const projectRoot = path.join(parentDir, "sample-slot");
        const baseRunner = localPokieDependencyRunner();
        // Simulates a developer hand-editing the scaffold between "pokie create" and their first build,
        // introducing a real TypeScript error -- injected right before the real "npm run build" spawns,
        // so "npm install" (and the package-lock.json it writes) still completes normally first.
        const sabotagingRunner: PackageCommandRunning = (command, args, cwd) => {
            if (args[0] === "run") {
                fs.appendFileSync(path.join(cwd, "src", "index.ts"), "\nconst thisIsNotValidTypeScript: string = 42;\n");
            }
            return baseRunner(command, args, cwd);
        };

        let caught: unknown;
        try {
            await new GamePackagePreparer("1.3.0", undefined, sabotagingRunner).prepare(parentDir, "sample-slot");
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(GamePackagePreparationError);
        expect((caught as GamePackagePreparationError).phase).toBe("build");
        expect(fs.existsSync(path.join(projectRoot, "package-lock.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "dist", "index.js"))).toBe(false);

        const packageLockBeforeRetry = fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf-8");
        const brokenSource = fs.readFileSync(path.join(projectRoot, "src", "index.ts"), "utf-8");
        fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), brokenSource.replace("\nconst thisIsNotValidTypeScript: string = 42;\n", ""));

        const recordedCalls: string[][] = [];
        const recordingRunner: PackageCommandRunning = (command, args, cwd) => {
            recordedCalls.push(args);
            return baseRunner(command, args, cwd);
        };
        const result = await new GamePackagePreparer("1.3.0", undefined, recordingRunner).prepare(parentDir, "sample-slot");

        expect(result.phasesCompleted).toEqual(["create", "dependencies", "build", "verify"]);
        // "install" never re-runs on retry once "dependencies" is already recorded done -- only "build".
        expect(recordedCalls).toEqual([["run", "build"]]);
        expect(fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf-8")).toBe(packageLockBeforeRetry);
        expect(fs.existsSync(path.join(projectRoot, "dist", "index.js"))).toBe(true);
    });
});
