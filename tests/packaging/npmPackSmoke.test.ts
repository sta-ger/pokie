import {ChildProcessWithoutNullStreams, execFileSync, spawn, spawnSync} from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {BUILT_PACKAGE_FILES} from "pokie";
import {ensureFixturesCanRequirePokie} from "../cli/fixtures/ensureFixturesCanRequirePokie.js";
import {localPokieDependencyRunner} from "../testUtils/offlinePokieDependencyOverride.js";

const REPO_ROOT = path.join(__dirname, "..", "..");

// One of two places in the suite where a CLI command is legitimately spawned as a real subprocess (see
// the project's own "never spawn a CLI command as a subprocess" convention for Studio's in-process
// features) — this test isn't exercising Studio internals, it's exercising *packaging*: whether the
// tarball `npm publish` would actually ship contains everything the installed `pokie` binary needs to
// run standalone, outside this repo's own dev tree (studioRoot resolution via import.meta.url, the
// dual CJS/ESM dist layout, etc.). The other is
// tests/cli/materialize/BlueprintProjectMaterializer.offline.integration.test.ts's own CLI command
// coverage describe block, which spawns the built (not packed/installed) executable to prove
// running-installation-root discovery against a spaced path, not packaging.
function waitForListeningPort(child: ChildProcessWithoutNullStreams, timeoutMs = 60000): Promise<number> {
    return new Promise((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => {
            reject(new Error(`Timed out waiting for "pokie" to report its listening port. Output so far:\n${output}`));
        }, timeoutMs);
        const onData = (chunk: Buffer): void => {
            output += chunk.toString();
            const match = (/listening on http:\/\/[^:]+:(\d+)/).exec(output);
            if (match) {
                clearTimeout(timer);
                child.stdout.off("data", onData);
                resolve(Number(match[1]));
            }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", (chunk: Buffer) => {
            output += chunk.toString();
        });
        child.once("exit", (code) => {
            clearTimeout(timer);
            reject(new Error(`"pokie" exited early (code ${code}). Output so far:\n${output}`));
        });
    });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null) {
        return;
    }
    child.kill();
    await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
    });
}

describe("npm pack smoke test (real tarball, real npm install, real spawned pokie binary)", () => {
    // Real `npm pack` (which runs the full `prepack` -> `npm run build` lifecycle) plus a real
    // `npm install` are both genuinely slow — far outside the rest of the suite's normal budget.
    jest.setTimeout(300000);

    let packDir: string | undefined;
    let tarballPath: string | undefined;
    let installDir: string | undefined;
    let pokieBinPath: string;

    beforeAll(() => {
        // Build explicitly, then keep the real tarball and npm's output outside the candidate tree.
        // `npm pack --json` includes one record per shipped file; once the package exceeded 8,000
        // files that output crossed execFileSync's default 1 MiB buffer and failed with ENOBUFS.
        // Silent non-JSON mode emits only the tarball filename and remains bounded as the package grows.
        execFileSync("npm", ["run", "build"], {cwd: REPO_ROOT, stdio: "inherit"});
        packDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-npm-pack-output-"));
        const filename = execFileSync(
            "npm",
            ["pack", "--ignore-scripts", "--silent", "--pack-destination", packDir],
            {cwd: REPO_ROOT, encoding: "utf-8"},
        ).trim();
        expect(filename).toBe(path.basename(filename));
        tarballPath = path.join(packDir, filename);
        expect(fs.existsSync(tarballPath)).toBe(true);

        installDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-npm-pack-smoke-"));
        fs.writeFileSync(
            path.join(installDir, "package.json"),
            JSON.stringify({name: "pokie-smoke-test", version: "0.0.0", private: true}),
        );
        execFileSync("npm", ["install", tarballPath, "--no-audit", "--no-fund"], {cwd: installDir, encoding: "utf-8"});

        pokieBinPath = path.join(installDir, "node_modules", ".bin", "pokie");
        expect(fs.existsSync(pokieBinPath)).toBe(true);

        // The third test below runs a real worker-thread simulation against
        // tests/cli/fixtures/playable-game via the *installed* package's own default worker
        // resolution -- that fixture does a bare require("pokie") of its own, which needs the same
        // resolvable node_modules/pokie as the real-worker unit tests (see
        // ensureFixturesCanRequirePokie.ts).
        ensureFixturesCanRequirePokie();
    });

    afterAll(() => {
        if (installDir !== undefined) {
            fs.rmSync(installDir, {recursive: true, force: true});
        }
        if (packDir !== undefined) {
            fs.rmSync(packDir, {recursive: true, force: true});
        }
    });

    it("runs `pokie --no-open` (Home mode): serves the app shell/assets and a healthy API", async () => {
        const child = spawn(pokieBinPath, ["--no-open", "--port", "0"], {cwd: installDir}) as ChildProcessWithoutNullStreams;
        try {
            const port = await waitForListeningPort(child);
            const baseUrl = `http://127.0.0.1:${port}`;

            const health = await fetch(`${baseUrl}/api/health`);
            expect(health.status).toBe(200);
            expect(await health.json()).toEqual({status: "ok"});

            const context = await fetch(`${baseUrl}/api/context`);
            expect(await context.json()).toEqual({mode: "home"});

            const diagnostics = await fetch(`${baseUrl}/api/studio/diagnostics`);
            expect(diagnostics.status).toBe(200);
            expect((await diagnostics.json()) as {mode: string}).toMatchObject({mode: "home"});

            // Proves the tarball's compiled/copied studio-client assets are actually served from the
            // installed location, not just present on disk in this dev repo. The Studio frontend is a
            // real Vite build with content-hashed asset filenames (no fixed /main.js or /style.css) —
            // discover the real paths from the served index.html itself rather than hardcoding them.
            const index = await fetch(`${baseUrl}/`);
            expect(index.status).toBe(200);
            expect(index.headers.get("content-type")).toContain("text/html");
            const indexHtml = await index.text();

            const scriptSrc = (/<script[^>]+src="([^"]+)"/).exec(indexHtml)?.[1];
            const stylesheetHref = (/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/).exec(indexHtml)?.[1];
            expect(scriptSrc).toBeDefined();
            expect(stylesheetHref).toBeDefined();

            const mainJs = await fetch(`${baseUrl}${scriptSrc}`);
            expect(mainJs.status).toBe(200);
            expect(mainJs.headers.get("content-type")).toContain("javascript");

            const styleCss = await fetch(`${baseUrl}${stylesheetHref}`);
            expect(styleCss.status).toBe(200);
            expect(styleCss.headers.get("content-type")).toContain("css");
        } finally {
            await stopChild(child);
        }
    });

    it("runs `pokie . --no-open` (Project mode) against a non-package directory: starts cleanly, reports an error dashboard, never crashes", async () => {
        const child = spawn(pokieBinPath, [".", "--no-open", "--port", "0"], {cwd: installDir}) as ChildProcessWithoutNullStreams;
        try {
            const port = await waitForListeningPort(child);
            const baseUrl = `http://127.0.0.1:${port}`;

            const context = await fetch(`${baseUrl}/api/context`);
            expect(await context.json()).toEqual({mode: "project", projectRoot: installDir});

            let dashboard: {status: string} = {status: "loading"};
            for (let i = 0; i < 200 && dashboard.status === "loading"; i++) {
                const response = await fetch(`${baseUrl}/api/project/context`);
                dashboard = (await response.json()) as {status: string};
                if (dashboard.status === "loading") {
                    await new Promise((resolve) => {
                        setTimeout(resolve, 50);
                    });
                }
            }
            expect(dashboard.status).toBe("error");

            // Still running — a failed project load reports an error dashboard, it never crashes Studio.
            expect(child.exitCode).toBeNull();
        } finally {
            await stopChild(child);
        }
    });

    it("imports ParallelSimulationRunner from the installed \"pokie\" package and runs a workers=2 simulation, exiting cleanly with no lingering worker threads", () => {
        const fixtureRoot = path.join(REPO_ROOT, "tests", "cli", "fixtures", "playable-game");
        const scriptPath = path.join(installDir!, "run-parallel-simulation.mjs");
        // Deliberately not importing anything from this repo's own src/cli — this script only ever
        // sees what npm actually installed from the tarball, exactly as a real third-party consumer
        // embedding parallel simulation programmatically would write it.
        fs.writeFileSync(
            scriptPath,
            `
            import {ParallelSimulationRunner} from "pokie";

            const runner = new ParallelSimulationRunner(${JSON.stringify(fixtureRoot)}, 20000, {seed: "demo", workers: 2});
            const result = await runner.run();

            if (result.workers !== 2) {
                throw new Error("expected workers to be 2, got " + result.workers);
            }
            if (result.statistics.rounds !== 20000) {
                throw new Error("expected 20000 rounds, got " + result.statistics.rounds);
            }
            if (!Number.isFinite(result.statistics.rtp)) {
                throw new Error("expected a finite rtp");
            }
            if (result.manifest.id !== "playable-game") {
                throw new Error("expected the fixture game's manifest, got " + JSON.stringify(result.manifest));
            }
            if (!result.workerSeedStrategy || typeof result.workerSeedStrategy !== "string") {
                throw new Error("expected a workerSeedStrategy description");
            }

            console.log("PARALLEL_SIMULATION_SMOKE_OK " + JSON.stringify({workers: result.workers, rounds: result.statistics.rounds}));
            `,
        );

        // execFileSync only returns once the child process has actually exited on its own — if a
        // worker thread were left running (not terminated after run() resolves), Node's event loop
        // would never drain and this would hang until Jest's own timeout killed it, failing the test.
        const output = execFileSync("node", [scriptPath], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(output).toContain('PARALLEL_SIMULATION_SMOKE_OK {"workers":2,"rounds":20000}');
    });

    // Studio startup targeting, against the real installed binary: which of Home / a project dashboard
    // each launch form actually ends up serving. The mode is read from /api/context, i.e. the same
    // thing the app's own landing route asks before it picks its opening screen.
    describe("Studio startup target", () => {
        let projectRoot: string;

        beforeAll(() => {
            const create = spawnSync(
                pokieBinPath,
                ["create", "--random", "--seed", "4242", "--out", "./startup-project.blueprint.json"],
                {cwd: installDir, encoding: "utf-8", timeout: 120000},
            );
            expect(create.status).toBe(0);

            const build = spawnSync(
                pokieBinPath,
                ["build", "./startup-project.blueprint.json", "--target", "tsPackage", "--out", "./startup-project"],
                {cwd: installDir, encoding: "utf-8", timeout: 120000},
            );
            expect(build.status).toBe(0);
            projectRoot = fs.realpathSync(path.join(installDir!, "startup-project"));
        });

        async function contextOf(args: string[], cwd: string): Promise<unknown> {
            const child = spawn(pokieBinPath, [...args, "--no-open", "--port", "0"], {cwd}) as ChildProcessWithoutNullStreams;
            try {
                const port = await waitForListeningPort(child);
                return await (await fetch(`http://127.0.0.1:${port}/api/context`)).json();
            } finally {
                await stopChild(child);
            }
        }

        it("`pokie` inside a project opens that project", async () => {
            expect(await contextOf([], projectRoot)).toEqual({mode: "project", projectRoot});
        });

        it("`pokie` from a nested directory inside a project still opens that project", async () => {
            const nested = path.join(projectRoot, "dist");
            expect(fs.existsSync(nested)).toBe(true);

            expect(await contextOf([], nested)).toEqual({mode: "project", projectRoot});
        });

        it("`pokie` outside any project opens Home", async () => {
            // installDir has a package.json of its own, but no "pokie.entry" — not a game package.
            expect(await contextOf([], installDir!)).toEqual({mode: "home"});
        });

        it("`pokie .` opens the project it was pointed at", async () => {
            expect(await contextOf(["."], projectRoot)).toEqual({mode: "project", projectRoot});
        });
    });

    // spawnSync (rather than execFileSync) so a non-zero exit is asserted on directly instead of
    // surfacing as a thrown error, and so a "pokie --help" that wrongly reached the implicit Studio entry — which
    // would sit there serving instead of exiting — fails on the timeout rather than hanging the suite.
    it.each([["--help"], ["-h"]])("prints the general usage and the full command list for `pokie %s`, exiting 0", (flag) => {
        const result = spawnSync(pokieBinPath, [flag], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Usage: pokie <command>");
        expect(result.stdout).toContain("Commands:");
        // A representative spread of registered commands, including the longest name, so a truncated
        // or partially-rendered list is caught rather than just "some text was printed".
        for (const commandName of ["build", "create", "diff", "export", "generate", "inspect", "sample", "validate"]) {
            expect(result.stdout).toMatch(new RegExp(`^ {2}${commandName} `, "m"));
        }
        expect(result.stdout).not.toMatch(/^ {2}(name|outcomelibrary|outcomesource|par|stakeengine|studio)\b/m);
    });

    // Mirrors tests/cli/cliCommandInventory.contract.test.ts's own frozen "CLI top-level dispatch
    // contract" case for "--version" (see CLI_TOP_LEVEL_DISPATCH_CASES) against the real, installed
    // binary rather than an in-process dispatch() call: there is no dedicated top-level --version flag
    // today, so it falls through resolveCliInvocation's own "-"-prefixed-token step and reaches the
    // implicit Studio entry as an unrecognized option, exiting 1 without ever starting a server. Proves the
    // packaged dist behaves identically to the source under test, not just that the source does.
    it("`pokie --version` has no dedicated top-level flag today: falls through to the implicit Studio entry's unknown-option error, exiting 1", () => {
        const result = spawnSync(pokieBinPath, ["--version"], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr.trim()).toBe(
            'Unknown option "--version". Usage: pokie [projectRoot] [--port <number>] [--host <string>] [--no-open]',
        );
    });

    it("`pokie <unrecognized command>` prints the same usage/command list as --help, but exits 1", () => {
        const result = spawnSync(pokieBinPath, ["totally-bogus-pokie-command-xyz-12345"], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("Usage: pokie <command>");
        expect(result.stdout).toContain("Commands:");
    });

    it("scaffolds a package in place via a fully non-interactive `pokie init <directory>`, installing/building it entirely on its own -- its scaffolded \"pokie\" dependency resolves against this exact installed binary's own root during install (never the registry, never a manual rewrite), then is left with a portable version range, and it validates and simulates", () => {
        const projectRoot = path.join(installDir!, "sample-slot");
        // No --no-prepare, no --no-install, no manual package.json rewrite: "pokie init" now resolves its
        // own scaffolded "pokie" dependency against the running installation's own root (readOwnPackageRoot()
        // -- here, installDir/node_modules/pokie, exactly what the outer `npm install tarballPath` above
        // already installed) via the same withLocalPokieInstall mechanism Blueprint materialization uses --
        // see registerCliCommands.ts's own InitCommand wiring. Proves this works even though this dev
        // version was never published: only "pokie" itself needs that local resolution, "typescript" (a
        // real, always-available registry package) installs normally alongside it.
        const init = spawnSync(pokieBinPath, ["init", projectRoot], {cwd: installDir, encoding: "utf-8", timeout: 120000});

        expect(init.status).toBe(0);
        expect(fs.existsSync(path.join(projectRoot, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "src", "index.ts"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "dist", "index.js"))).toBe(true);

        // The transient local resolution already ran and settled by the time "pokie init" exits (this is
        // a real spawned binary, not an injected runCommand -- there's no in-process hook to observe the
        // package.json PackageCommandRunner.ts's withLocalPokieInstall writes for the duration of "npm
        // install" itself; see PackageCommandRunner.test.ts and InitCommandWorkflow.integration.test.ts
        // for that half of the contract, captured via an injected recording runCommand). What's left on
        // disk here is only ever the *persisted* half: a portable version range, never the absolute,
        // host-specific `file:` path "npm install" actually resolved against.
        const packageJsonPath = path.join(projectRoot, "package.json");
        const scaffoldedPkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {dependencies?: Record<string, string>};
        const {version: ownVersion} = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as {version: string};
        expect(scaffoldedPkg.dependencies?.pokie).toBe(`^${ownVersion}`);
        expect(fs.existsSync(path.join(projectRoot, "node_modules", "pokie", "package.json"))).toBe(true);

        const validate = spawnSync(pokieBinPath, ["validate", projectRoot], {cwd: installDir, encoding: "utf-8", timeout: 60000});
        expect(validate.status).toBe(0);

        const simFile = path.join(installDir!, "init-sim.json");
        const sim = spawnSync(pokieBinPath, ["sim", projectRoot, "--rounds", "200", "--seed", "demo", "--out", simFile], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 120000,
        });
        expect(sim.status).toBe(0);

        const report = JSON.parse(fs.readFileSync(simFile, "utf-8")) as {rounds: number};
        expect(report.rounds).toBe(200);
    });

    function readPackageLockPackages(packageRoot: string): Record<string, unknown> {
        const lock = JSON.parse(fs.readFileSync(path.join(packageRoot, "package-lock.json"), "utf-8")) as {
            packages?: Record<string, unknown>;
        };
        return lock.packages ?? {};
    }

    // The rename-based move test below proves a package moved with its already-resolved node_modules
    // never needs npm again. This proves the stronger claim P5PA-06 actually requires: the *persisted*
    // package.json/package-lock.json pair -- copied without node_modules, i.e. with none of the
    // resolution "pokie init" itself already did -- is on its own enough for a genuinely independent,
    // later "npm install" to resolve "pokie" again. Real npm calls can't reach the public registry for
    // this repo's own never-published "pokie" (or reliably for "typescript" in a network-restricted
    // sandbox), so this reinstall is routed offline through localPokieDependencyRunner -- the same real,
    // uninjected `npm install` GamePackagePreparer.integration.test.ts and
    // BlueprintProjectMaterializer.integration.test.ts already rely on (see
    // tests/testUtils/offlinePokieDependencyOverride.ts's own doc comment) -- rather than skipped
    // outright, so this still exercises a real spawned npm wherever that offline substitution is itself
    // runnable. Runs before the rename-based move test below, which consumes "sample-slot" in place.
    it("copies the initialized package -- without node_modules, without any of 'npm install's own resolution -- to a new location, and a real, independent 'npm install' there resolves \"pokie\" fresh from only the portable persisted package.json/package-lock.json", async () => {
        const sourceRoot = path.join(installDir!, "sample-slot");
        const reinstalledRoot = path.join(installDir!, "sample-slot-reinstalled");
        for (const relativeFile of [
            "package.json",
            "package-lock.json",
            "tsconfig.json",
            path.join("src", "index.ts"),
            path.join("dist", "index.js"),
        ]) {
            const destination = path.join(reinstalledRoot, relativeFile);
            fs.mkdirSync(path.dirname(destination), {recursive: true});
            fs.copyFileSync(path.join(sourceRoot, relativeFile), destination);
        }
        expect(fs.existsSync(path.join(reinstalledRoot, "node_modules"))).toBe(false);

        const lockPackagesBeforeReinstall = readPackageLockPackages(reinstalledRoot);
        expect(lockPackagesBeforeReinstall["node_modules/pokie"]).toBeUndefined();
        for (const key of Object.keys(lockPackagesBeforeReinstall)) {
            expect(key).not.toContain(installDir!);
        }

        await localPokieDependencyRunner()("npm", ["install"], reinstalledRoot);

        expect(fs.existsSync(path.join(reinstalledRoot, "node_modules", "pokie", "package.json"))).toBe(true);

        const pkgAfterReinstall = JSON.parse(fs.readFileSync(path.join(reinstalledRoot, "package.json"), "utf-8")) as {
            dependencies?: Record<string, string>;
        };
        expect(pkgAfterReinstall.dependencies?.pokie).not.toMatch(/^file:/);
        expect(pkgAfterReinstall.dependencies?.pokie).not.toContain(installDir!);

        const lockPackagesAfterReinstall = readPackageLockPackages(reinstalledRoot);
        expect(lockPackagesAfterReinstall["node_modules/pokie"]).toBeUndefined();
        for (const key of Object.keys(lockPackagesAfterReinstall)) {
            expect(key).not.toContain(installDir!);
        }

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const game = require(path.join(reinstalledRoot, "dist", "index.js")) as {getManifest(): {id: string}};
        expect(game.getManifest().id).toBeDefined();

        const validate = spawnSync(pokieBinPath, ["validate", reinstalledRoot], {cwd: installDir, encoding: "utf-8", timeout: 60000});
        expect(validate.status).toBe(0);
    });

    // Real "npm install" resolves a `file:` spec as a symlink, recording it in package-lock.json as its
    // own absolute-host-tied "link": true entry (see PackageCommandRunner.ts's own doc comment on
    // stripLocalPokieLockEntries) -- checked here against the real lockfile a real spawned "pokie init"
    // (above) actually wrote, not just the hand-reproduced shape PackageCommandRunner.test.ts's own unit
    // coverage exercises.
    it("moves the initialized package (with its already-resolved node_modules) to a new location and still loads/validates there without ever running npm install again -- proving the persisted package.json AND package-lock.json carry no absolute path back to where it was installed", () => {
        const sourceRoot = path.join(installDir!, "sample-slot");
        const movedRoot = path.join(installDir!, "sample-slot-moved");
        fs.renameSync(sourceRoot, movedRoot);

        const movedPkg = JSON.parse(fs.readFileSync(path.join(movedRoot, "package.json"), "utf-8")) as {
            dependencies?: Record<string, string>;
        };
        expect(movedPkg.dependencies?.pokie).not.toMatch(/^file:/);
        expect(movedPkg.dependencies?.pokie).not.toContain(installDir!);

        const movedLockPackages = readPackageLockPackages(movedRoot);
        expect(movedLockPackages["node_modules/pokie"]).toBeUndefined();
        for (const key of Object.keys(movedLockPackages)) {
            expect(key).not.toContain(installDir!);
        }

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const game = require(path.join(movedRoot, "dist", "index.js")) as {getManifest(): {id: string}};
        expect(game.getManifest().id).toBeDefined();

        const validate = spawnSync(pokieBinPath, ["validate", movedRoot], {cwd: installDir, encoding: "utf-8", timeout: 60000});
        expect(validate.status).toBe(0);
    });

    it("runs `pokie generate` against a package built by the installed binary itself, then exports and validates the result", () => {
        // Same small, hand-computable, exactly-enumerable blueprint as
        // tests/cli/OutcomeLibraryGenerateWorkflow.integration.test.ts's own finiteBlueprint(): 2 reels of
        // 3/2 stops, no stateful mechanics, so "generate" resolves the exact strategy without --bounded.
        const blueprintPath = path.join(installDir!, "outcomelibrary-blueprint.json");
        fs.writeFileSync(
            blueprintPath,
            JSON.stringify({
                manifest: {id: "packed-outcomelibrary-slot", name: "Packed Outcomelibrary Slot", version: "1.0.0"},
                reels: 2,
                rows: 1,
                symbols: ["A", "B"],
                paytable: {A: {2: 5}},
                reelStrips: [
                    ["A", "A", "B"],
                    ["A", "B"],
                ],
            }),
        );
        const packageRoot = path.join(installDir!, "outcomelibrary-pkg");
        const build = spawnSync(pokieBinPath, ["build", blueprintPath, "--target", "tsPackage", "--out", packageRoot], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(build.status).toBe(0);

        const libraryFile = path.join(installDir!, "outcomelibrary-base.json");
        const generate = spawnSync(
            pokieBinPath,
            ["generate", packageRoot, "--stake", "1", "--out", libraryFile, "--format", "json"],
            {cwd: installDir, encoding: "utf-8", timeout: 60000},
        );
        expect(generate.status).toBe(0);

        const library = JSON.parse(fs.readFileSync(libraryFile, "utf-8")) as {outcomes: Array<{weight: number}>};
        expect(library.outcomes).toHaveLength(4);
        expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(6);

        const bundleConfigPath = path.join(installDir!, "outcomelibrary-bundle-config.json");
        fs.writeFileSync(bundleConfigPath, JSON.stringify({modes: [{modeName: "base", libraryPath: "outcomelibrary-base.json"}]}));
        const bundleDir = path.join(installDir!, "outcomelibrary-bundle");
        const bundleBuild = spawnSync(pokieBinPath, ["export", bundleConfigPath, "--to", "outcomes", "--out", bundleDir], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(bundleBuild.status).toBe(0);

        const bundleValidate = spawnSync(pokieBinPath, ["validate", bundleDir, "--deep"], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(bundleValidate.status).toBe(0);
    });

    // A "pokie build" package (GamePackageGenerator's canonical output) carries none of the
    // pre-migration provenance (embedded blueprint, build-info.json, src/generated nesting -- see
    // GamePackageGenerator's own doc comment) that the older format used to write directly into the
    // package. Running a real `npm pack` against one proves that contract at the one boundary that
    // actually matters to a consumer: what a real `npm publish` would ship, not just what's on disk.
    it("`npm pack`s a package built by the installed binary itself: ships the canonical runtime/source files, nothing from the pre-migration build-info/blueprint/src-generated format", () => {
        const blueprintPath = path.join(installDir!, "npm-pack-built-package.blueprint.json");
        fs.writeFileSync(
            blueprintPath,
            JSON.stringify({
                manifest: {id: "npm-pack-built-package", name: "Npm Pack Built Package", version: "0.1.0"},
                reels: 3,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {A: {3: 5}, B: {3: 2}},
                reelStrips: [
                    ["A", "A", "B"],
                    ["A", "A", "B"],
                    ["A", "A", "B"],
                ],
            }),
        );
        const packageRoot = path.join(installDir!, "npm-pack-built-package");
        const build = spawnSync(pokieBinPath, ["build", blueprintPath, "--target", "tsPackage", "--out", packageRoot], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(build.status).toBe(0);

        // --dry-run: proves what would ship without actually writing/cleaning up a tarball. This built
        // package's own scripts (build/start/server/client) never include prepack/postpack/prepare, so
        // --ignore-scripts changes nothing here -- kept anyway, matching this file's own real-tarball
        // pack above, so packing this package can never run its "build" script a second time.
        const packOutput = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
            cwd: packageRoot,
            encoding: "utf-8",
        });
        const [{files}] = JSON.parse(packOutput) as Array<{files: Array<{path: string}>}>;
        const packedPaths = files.map((file) => file.path);

        // package-lock.json is deliberately not asserted here -- npm's own default pack rules always
        // exclude it (see npm-packlist's strict default rules), regardless of anything this package
        // itself does.
        for (const canonicalFile of BUILT_PACKAGE_FILES.filter((file) => file !== "package-lock.json")) {
            expect(packedPaths).toContain(canonicalFile);
        }
        for (const packedPath of packedPaths) {
            expect(packedPath).not.toMatch(/^src\/generated\//);
            expect(packedPath.toLowerCase()).not.toContain("build-info");
            expect(packedPath.toLowerCase()).not.toContain("blueprint");
        }
    });
});
