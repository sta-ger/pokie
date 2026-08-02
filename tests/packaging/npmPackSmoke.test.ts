import {ChildProcessWithoutNullStreams, execFileSync, spawn, spawnSync} from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {BUILT_PACKAGE_FILES} from "pokie";
import {ensureFixturesCanRequirePokie} from "../cli/fixtures/ensureFixturesCanRequirePokie.js";

const REPO_ROOT = path.join(__dirname, "..", "..");

// Only place in the suite where a CLI command is legitimately spawned as a real subprocess (see the
// project's own "never spawn a CLI command as a subprocess" convention for Studio's in-process
// features) — this test isn't exercising Studio internals, it's exercising *packaging*: whether the
// tarball `npm publish` would actually ship contains everything the installed `pokie` binary needs to
// run standalone, outside this repo's own dev tree (studioRoot resolution via import.meta.url, the
// dual CJS/ESM dist layout, etc.).
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

    let tarballPath: string | undefined;
    let installDir: string | undefined;
    let pokieBinPath: string;

    beforeAll(() => {
        // `npm pack --json`'s own JSON array and a lifecycle script's output share the same stdout
        // stream. Running the real build explicitly first, then packing with --ignore-scripts (build
        // is already fresh, so skipping prepack/postpack loses nothing), keeps npm pack's stdout as
        // just its JSON -- otherwise ESLint's pre-existing warn-level output (printed via prepack ->
        // npm run build -> prebuild -> npm run lint) lands on the same stream and corrupts the parse.
        execFileSync("npm", ["run", "build"], {cwd: REPO_ROOT, stdio: "inherit"});
        const packOutput = execFileSync("npm", ["pack", "--json", "--ignore-scripts"], {cwd: REPO_ROOT, encoding: "utf-8"});
        const [{filename}] = JSON.parse(packOutput) as Array<{filename: string}>;
        tarballPath = path.join(REPO_ROOT, filename);
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
        if (tarballPath !== undefined && fs.existsSync(tarballPath)) {
            fs.rmSync(tarballPath);
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
            const build = spawnSync(pokieBinPath, ["build", "random", "--seed", "4242", "--out", "./startup-project"], {
                cwd: installDir,
                encoding: "utf-8",
                timeout: 120000,
            });
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

        it("an explicit `pokie studio` opens Home even from inside a project", async () => {
            expect(await contextOf(["studio"], projectRoot)).toEqual({mode: "home"});
        });

        it("`pokie .` opens the project it was pointed at", async () => {
            expect(await contextOf(["."], projectRoot)).toEqual({mode: "project", projectRoot});
        });

        it("`pokie studio <path>` opens the project it was pointed at", async () => {
            expect(await contextOf(["studio", projectRoot], installDir!)).toEqual({mode: "project", projectRoot});
        });
    });

    // spawnSync (rather than execFileSync) so a non-zero exit is asserted on directly instead of
    // surfacing as a thrown error, and so a "pokie --help" that wrongly reached StudioCommand — which
    // would sit there serving instead of exiting — fails on the timeout rather than hanging the suite.
    it.each([["--help"], ["-h"]])("prints the general usage and the full command list for `pokie %s`, exiting 0", (flag) => {
        const result = spawnSync(pokieBinPath, [flag], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Usage: pokie <command>");
        expect(result.stdout).toContain("Commands:");
        // A representative spread of registered commands, including the longest name, so a truncated
        // or partially-rendered list is caught rather than just "some text was printed".
        for (const commandName of ["build", "create", "inspect", "outcomelibrary", "sim", "studio", "validate"]) {
            expect(result.stdout).toMatch(new RegExp(`^ {2}${commandName} `, "m"));
        }
    });

    // Mirrors tests/cli/cliCommandInventory.contract.test.ts's own frozen "CLI top-level dispatch
    // contract" case for "--version" (see CLI_TOP_LEVEL_DISPATCH_CASES) against the real, installed
    // binary rather than an in-process dispatch() call: there is no dedicated top-level --version flag
    // today, so it falls through resolveCliInvocation's own "-"-prefixed-token step and reaches
    // StudioCommand as an unrecognized option, exiting 1 without ever starting a server. Proves the
    // packaged dist behaves identically to the source under test, not just that the source does.
    it("`pokie --version` has no dedicated top-level flag today: falls through to Studio's own unknown-option error, exiting 1", () => {
        const result = spawnSync(pokieBinPath, ["--version"], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr.trim()).toBe(
            'Unknown option "--version". Usage: pokie studio [projectRoot] [--port <number>] [--host <string>] [--no-open]',
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

    it("`pokie name --json` prints machine-readable JSON from the real installed binary, distinct from its human-readable default", () => {
        const jsonResult = spawnSync(pokieBinPath, ["name", "--json", "--count", "3", "--seed", "42"], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(jsonResult.status).toBe(0);
        expect(jsonResult.stderr).toBe("");
        const names = JSON.parse(jsonResult.stdout) as Array<{title: string; slug: string; packageName: string; seed: number}>;
        expect(names).toHaveLength(3);
        for (const name of names) {
            expect(typeof name.title).toBe("string");
            expect(typeof name.slug).toBe("string");
            expect(typeof name.packageName).toBe("string");
        }

        const humanResult = spawnSync(pokieBinPath, ["name", "--count", "3", "--seed", "42"], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(humanResult.status).toBe(0);
        expect(() => JSON.parse(humanResult.stdout)).toThrow();
        expect(humanResult.stdout).toContain("Reproduce with: pokie name --seed 42");
    });

    it("`pokie name --count 0` rejects an invalid option value with a non-zero exit and a stderr-only message", () => {
        const result = spawnSync(pokieBinPath, ["name", "--count", "0"], {cwd: installDir, encoding: "utf-8", timeout: 60000});

        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr.trim()).toBe(
            "--count requires a positive integer. Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
        );
    });

    it("builds a package from an Enter-only `pokie init` wizard run, then validates and simulates it", () => {
        // More blank lines than the wizard has questions: the surplus is simply never read, and using
        // an exact count here would encode the very question count the Enter-only contract is about.
        const build = spawnSync(pokieBinPath, ["init"], {
            cwd: installDir,
            encoding: "utf-8",
            input: "\n".repeat(40),
            timeout: 120000,
        });

        expect(build.status).toBe(0);

        const projectRoot = (/prepared and verified in "(.+)"\.$/m).exec(build.stdout)?.[1];
        expect(projectRoot).toBeDefined();
        expect(fs.existsSync(path.join(projectRoot!, "dist", "index.js"))).toBe(true);

        const validate = spawnSync(pokieBinPath, ["validate", projectRoot!], {cwd: installDir, encoding: "utf-8", timeout: 60000});
        expect(validate.status).toBe(0);

        const simFile = path.join(installDir!, "enter-only-sim.json");
        const sim = spawnSync(pokieBinPath, ["sim", projectRoot!, "--rounds", "200", "--seed", "demo", "--out", simFile], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 120000,
        });
        expect(sim.status).toBe(0);

        const report = JSON.parse(fs.readFileSync(simFile, "utf-8")) as {rounds: number};
        expect(report.rounds).toBe(200);
    });

    it("runs `pokie outcomelibrary generate` against a package built by the installed binary itself, then bundles and validates the result", () => {
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
        const build = spawnSync(pokieBinPath, ["build", blueprintPath, "--out", packageRoot], {cwd: installDir, encoding: "utf-8", timeout: 60000});
        expect(build.status).toBe(0);

        const libraryFile = path.join(installDir!, "outcomelibrary-base.json");
        const generate = spawnSync(
            pokieBinPath,
            ["outcomelibrary", "generate", packageRoot, "--stake", "1", "--out", libraryFile, "--format", "json"],
            {cwd: installDir, encoding: "utf-8", timeout: 60000},
        );
        expect(generate.status).toBe(0);

        const library = JSON.parse(fs.readFileSync(libraryFile, "utf-8")) as {outcomes: Array<{weight: number}>};
        expect(library.outcomes).toHaveLength(4);
        expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(6);

        const bundleConfigPath = path.join(installDir!, "outcomelibrary-bundle-config.json");
        fs.writeFileSync(bundleConfigPath, JSON.stringify({modes: [{modeName: "base", libraryPath: "outcomelibrary-base.json"}]}));
        const bundleDir = path.join(installDir!, "outcomelibrary-bundle");
        const bundleBuild = spawnSync(pokieBinPath, ["outcomelibrary", "build", bundleConfigPath, "--out", bundleDir], {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        expect(bundleBuild.status).toBe(0);

        const bundleValidate = spawnSync(pokieBinPath, ["outcomelibrary", "validate", bundleDir, "--deep"], {
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
        const build = spawnSync(pokieBinPath, ["build", blueprintPath, "--out", packageRoot], {
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
