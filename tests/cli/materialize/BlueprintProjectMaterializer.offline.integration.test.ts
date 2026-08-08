import {ChildProcessWithoutNullStreams, execFileSync, spawn} from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {computeGameBlueprintHash, DEV_OPERATION, GAME_BLUEPRINT_SCHEMA_VERSION, GameBlueprint} from "pokie";
import {createStarterGameBlueprint} from "../../../cli/build/createStarterGameBlueprint.js";
import {BlueprintMaterializationError} from "../../../cli/materialize/BlueprintMaterializationError.js";
import {BlueprintProjectMaterializer} from "../../../cli/materialize/BlueprintProjectMaterializer.js";
import {createMaterializingRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";
import {resolveLocalPokieDependencyClosure} from "../../../cli/prepare/localPokieDependencyClosure.js";
import {PackageCommandResult, PackageCommandRunning, withLocalPokieInstall} from "../../../cli/prepare/PackageCommandRunner.js";
import {REPO_ROOT} from "../../testUtils/offlinePokieDependencyOverride.js";
import {ensureCompiledTestOutput} from "../../testUtils/ensureCompiledTestOutput.js";

const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");
const COMPILED_CJS_PACKAGE_JSON = path.join(REPO_ROOT, "dist", "cjs", "package.json");
const COMPILED_ESM_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js");

// Mirrors BlueprintProjectMaterializer's own private DEFAULT_CACHE_ROOT exactly (a machine-wide,
// process-external tmp location) -- there is no way to override it without handing
// createMaterializingRuntimePackageResolver a test-only `materializer`, which the CLI-command coverage
// below deliberately never does (see that describe block's own doc comment). Computing the same cache
// key production would and removing only that one entry afterward keeps this test from ever touching
// another concurrent process's own cache entries.
const DEFAULT_CACHE_ROOT = path.join(os.tmpdir(), "pokie-materialize-cache");

function computeDefaultCacheDir(blueprint: GameBlueprint, pokieVersion: string): string {
    const raw = `blueprintHash:${computeGameBlueprintHash(blueprint)}|pokieVersion:${pokieVersion}|buildContractVersion:${GAME_BLUEPRINT_SCHEMA_VERSION}`;
    const cacheKey = crypto.createHash("sha256").update(raw).digest("hex");
    return path.join(DEFAULT_CACHE_ROOT, cacheKey);
}

async function postJson(url: string, body: unknown = {}): Promise<{status: number; body: Record<string, unknown>}> {
    const response = await fetch(url, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    return {status: response.status, body: (await response.json()) as Record<string, unknown>};
}

// Deliberately never a real, published npm version -- every scenario below proves it never matters,
// since "pokie" itself, and every one of its own runtime dependencies (e.g. "exceljs"), are always
// resolved locally (via withLocalPokieInstall -- production's own mechanism, used completely
// unmodified here, never a test-only stand-in for it) rather than looked up against a registry at all.
// Randomized per test run (never a fixed literal) so a materialize() call below always performs a
// genuine fresh install -- proving the real npm mechanism runs, not just that a stale cache entry left
// over from a previous run of this same file gets borrowed.
const UNPUBLISHED_POKIE_VERSION = `0.0.0-offline-e2e-unpublished-${crypto.randomBytes(4).toString("hex")}`;

// Fails the very first "npm install" it's asked to run (a real, structured rejection shaped like a real
// execFile failure -- a message plus a separate "stderr") and delegates every call after that to `base` --
// standing in for a real, transient local npm failure (a flaky lock, a momentarily-corrupt npm cache)
// followed by a successful retry, without ever faking BlueprintProjectMaterializer's own recovery logic.
function failFirstInstallThenDelegate(base: PackageCommandRunning): PackageCommandRunning & {calls: number} {
    let calls = 0;
    let failed = false;
    const runner = (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        calls++;
        if (args[0] === "install" && !failed) {
            failed = true;
            return Promise.reject(
                Object.assign(new Error("Command failed: npm install\nnpm ERR! simulated transient local npm failure"), {
                    stderr: "npm ERR! simulated transient local npm failure -- e.g. a momentarily locked npm cache",
                }),
            );
        }
        return base(command, args, cwd);
    };
    // Object.assign copies a getter's *current value*, not the accessor itself -- defineProperty is what
    // keeps `.calls` live across every subsequent invocation of `runner`. Reflect.defineProperty returns
    // a success boolean, not the target, so the added property needs an explicit cast on `runner` itself
    // afterward.
    Reflect.defineProperty(runner, "calls", {
        get: () => calls,
    });
    return runner as PackageCommandRunning & {calls: number};
}

// Proves BlueprintProjectMaterializer's real, shipped offline mechanism end to end, through the actual
// production entry point (createMaterializingRuntimePackageResolver) every CLI/Studio operation that
// loads a POKIE game package is built from -- not a hand-constructed BlueprintProjectMaterializer
// standing in for it. A real ProjectTargetResolver recognizes the raw blueprint file exactly as a bare
// `pokie <blueprint.json>` launch would; a real GamePackageGenerator, a real spawned "npm install" that
// never reaches a registry (see below), and a real PokieGamePackageValidator load the result.
//
// `pokiePackageRootWithSpaces` stands in for "the running POKIE installation's own root directory" (see
// cli/pokie.ts's readOwnPackageRoot()) at a path shaped the way a real end user's machine easily
// produces one (e.g. under "Program Files", "My Projects") -- a symlink to this checkout's own
// REPO_ROOT, so every provenance withLocalPokieDependency's own doc comment lists (a dev checkout, an
// npm-linked target, a tarball-installed or ordinarily npm-installed copy) is equally well represented:
// the mechanism only ever cares about the resolved absolute path, never how it got there, and a symlink
// resolves to exactly the same kind of absolute path any of them would.
//
// Every "npm install" spawned below also runs with the registry forced unreachable and npm's own
// `--offline` mode forced on (see beforeAll) -- so an unpublished pokieVersion alone could never be
// mistaken for proof that *every* transitive dependency avoids registry resolution (e.g. "exceljs" alone
// pulls in dozens of packages of its own -- see withLocalPokieDependencyClosure's own doc comment in
// PackageCommandRunner.ts): if this checkout's own dependency-closure rewrite ever missed one, npm would
// fail fast here instead of silently succeeding against a reachable registry.
//
// Slow (real npm), same "pokie-integration" project as BlueprintProjectMaterializer.integration.test.ts
// (see jest.config.mjs's `*.integration.test.ts` glob).
describe("BlueprintProjectMaterializer (offline end-to-end: default production resolver, unpublished pokie version, real npm, no registry, spaced installation path)", () => {
    jest.setTimeout(300000);

    let cacheRoot: string;
    let sourceDir: string;
    let pokiePackageRootWithSpaces: string;
    let originalNpmOffline: string | undefined;
    let originalNpmRegistry: string | undefined;

    beforeAll(() => {
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [COMPILED_CJS_ENTRY, COMPILED_CJS_PACKAGE_JSON, COMPILED_ESM_WORKER_ENTRY],
            lockName: "compiled-runtime",
            command: ["npm", "run", "build-test-runtime"],
        });

        pokiePackageRootWithSpaces = path.join(os.tmpdir(), `pokie install root with spaces ${crypto.randomBytes(4).toString("hex")}`);
        fs.symlinkSync(REPO_ROOT, pokiePackageRootWithSpaces, "dir");

        // Forces any npm dependency resolution that isn't already rewritten to a local `file:` spec to
        // fail loudly and immediately, instead of silently succeeding against a reachable registry in a
        // network-connected dev/CI environment -- see this describe block's own doc comment. `offline`
        // alone already guarantees zero network requests of any kind (a DNS-independent, deterministic
        // failure mode); the unreachable registry URL is defense in depth in case any single install
        // step doesn't inherit that flag.
        originalNpmOffline = process.env.npm_config_offline;
        originalNpmRegistry = process.env.npm_config_registry;
        process.env["npm_config_offline"] = "true";
        process.env["npm_config_registry"] = "http://127.0.0.1:1/";
    });

    afterAll(() => {
        fs.rmSync(pokiePackageRootWithSpaces, {force: true});
        restoreEnv("npm_config_offline", originalNpmOffline);
        restoreEnv("npm_config_registry", originalNpmRegistry);
    });

    beforeEach(() => {
        cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie materialize cache offline e2e "));
        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie materialize source offline e2e "));
    });

    afterEach(() => {
        fs.rmSync(cacheRoot, {recursive: true, force: true});
        fs.rmSync(sourceDir, {recursive: true, force: true});
    });

    function writeStarterBlueprint(): string {
        const blueprintPath = path.join(sourceDir, "game.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(createStarterGameBlueprint(), null, 4));
        return blueprintPath;
    }

    it("materializes a genuinely loadable runtime through the default production resolver and reuses the cache -- fully offline, registry unreachable, pokieVersion never published, installation path containing spaces", async () => {
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(UNPUBLISHED_POKIE_VERSION, DEV_OPERATION, pokiePackageRootWithSpaces);
        const blueprintPath = writeStarterBlueprint();

        const first = await resolveRuntimePackageRoot(blueprintPath);
        try {
            // "pokie" really did resolve to this exact (spaced-path) checkout, not any registry-published
            // version.
            const installedPokiePackageJson = JSON.parse(
                fs.readFileSync(path.join(first.runtimePath, "node_modules", "pokie", "package.json"), "utf-8"),
            ) as {name: string};
            expect(installedPokiePackageJson.name).toBe("pokie");

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const entry = require(path.join(first.runtimePath, "dist", "index.js"));
            const game = entry.default ?? entry;
            expect(game.getManifest().id).toBe("starter-slot");
        } finally {
            await first.release();
        }

        const second = await resolveRuntimePackageRoot(blueprintPath);
        try {
            expect(second.runtimePath).toBe(first.runtimePath);
        } finally {
            await second.release();
        }
    });

    it("recovers from a failed staging build through the production resolver, leaves no cache artifacts, and safely retries without a second install once cached", async () => {
        const blueprintPath = writeStarterBlueprint();

        const flakyRunner = failFirstInstallThenDelegate(withLocalPokieInstall(pokiePackageRootWithSpaces));
        const materializer = new BlueprintProjectMaterializer(
            UNPUBLISHED_POKIE_VERSION,
            undefined,
            undefined,
            undefined,
            flakyRunner,
            undefined,
            cacheRoot,
        );
        // `resolveProject` stays the real default (undefined) -- only the materializer's own runCommand
        // needs to be flaky here, so project resolution is exercised exactly as production does it.
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(UNPUBLISHED_POKIE_VERSION, DEV_OPERATION, undefined, {materializer});

        const caught = await resolveRuntimePackageRoot(blueprintPath).catch((error: unknown) => error);

        expect(caught).toBeInstanceOf(BlueprintMaterializationError);
        const materializationError = caught as BlueprintMaterializationError;
        expect(materializationError.phase).toBe("dependencies");
        // The human-facing message leads with a plain-English summary -- the raw npm output never leaks
        // into it, only into the error's own "details" (see BlueprintMaterializationError's own doc
        // comment, and cli/dispatch.ts's own secondary "npm output:" block).
        expect(materializationError.message).not.toContain("npm ERR!");
        expect(materializationError.message.toLowerCase()).toContain("dependencies");
        expect(materializationError.details).toContain("npm ERR! simulated transient local npm failure");
        expect(fs.readdirSync(cacheRoot)).toEqual([]);

        const retried = await resolveRuntimePackageRoot(blueprintPath);
        try {
            expect(fs.existsSync(path.join(retried.runtimePath, "dist", "index.js"))).toBe(true);
            expect(fs.existsSync(path.join(retried.runtimePath, "node_modules", "pokie"))).toBe(true);
            expect(flakyRunner.calls).toBe(2);

            const cachedAfterRetry = await resolveRuntimePackageRoot(blueprintPath);
            try {
                expect(cachedAfterRetry.runtimePath).toBe(retried.runtimePath);
                expect(flakyRunner.calls).toBe(2);
            } finally {
                await cachedAfterRetry.release();
            }
        } finally {
            await retried.release();
        }
    });
});

// Proves the shared mechanism the describe block above exercises through a hand-rolled
// `fs.symlinkSync` root also works when `pokiePackageRoot` is a *real* npm-managed installation of
// "pokie" -- the two provenance shapes withLocalPokieDependency's own doc comment lists that no test in
// this file otherwise exercises: a tarball-installed copy (what `npm install <tarball>` actually leaves
// behind -- no node_modules of its own, every dependency hoisted into the *installing* project's
// node_modules instead) and an npm-linked target (a real symlink npm itself creates via `npm link`, not
// a hand-rolled one). Both are produced by a genuine `npm pack`/`npm install`/`npm link`, fully offline
// (registry forced unreachable, see beforeAll below) -- proving resolveLocalPokieDependencyClosure's own
// Node-module-resolution walk (see localPokieDependencyClosure.ts's own doc comment) actually reaches
// "commander"/"exceljs" through a realistic hoisted layout, not just through a root that already happens
// to contain its own node_modules (as every checkout-shaped root elsewhere in this file does).
//
// `npm link` is routed through a scratch `npm_config_prefix` (never this environment's real global npm
// folder) so the real npm-managed symlink it creates can never leak state outside this test's own temp
// directories.
//
// Slow (a real `npm pack`, two real `npm install`/`npm link` runs, plus one real materialization per
// source form), same "pokie-integration" project as the rest of this file.
describe("BlueprintProjectMaterializer (offline end-to-end: real npm-managed installation sources -- tarball-installed and npm-linked pokiePackageRoot)", () => {
    jest.setTimeout(300000);

    let sourceDir: string;
    let tarballInstallDir: string;
    let tarballPath: string;
    let tarballInstalledPokieRoot: string;
    let linkNpmPrefix: string;
    let linkInstallDir: string;
    let linkedPokieRoot: string;
    let originalNpmOffline: string | undefined;
    let originalNpmRegistry: string | undefined;

    beforeAll(() => {
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [COMPILED_CJS_ENTRY, COMPILED_CJS_PACKAGE_JSON, COMPILED_ESM_WORKER_ENTRY],
            lockName: "compiled-runtime",
            command: ["npm", "run", "build-test-runtime"],
        });

        originalNpmOffline = process.env.npm_config_offline;
        originalNpmRegistry = process.env.npm_config_registry;
        process.env["npm_config_offline"] = "true";
        process.env["npm_config_registry"] = "http://127.0.0.1:1/";

        // "pokie"'s own real, on-disk runtime dependency closure (see resolveLocalPokieDependencyClosure's
        // own doc comment) -- the exact same closure withLocalPokieInstall itself computes -- so every
        // scratch consumer project below can install "pokie" (from a tarball, or via a real link) without
        // its own "commander"/"exceljs" ever needing the (deliberately unreachable) registry either.
        const dependencyClosure = resolveLocalPokieDependencyClosure(REPO_ROOT);
        const localClosureDependencies: Record<string, string> = {};
        for (const {name, root} of dependencyClosure) {
            localClosureDependencies[name] = `file:${root}`;
        }

        // Real `npm pack` (never a hand-assembled directory) -- `--ignore-scripts` skips prepack's own
        // full `npm run build` (dist/cjs and dist/esm are already fresh from ensureCompiledTestOutput
        // above; nothing else this test needs -- CLI/client/studio-client assets -- is required to
        // resolve "pokie" as a plain runtime dependency). Plain (non-`--json`) `npm pack` prints only the
        // tarball's own filename to stdout -- every other line ("npm notice", the tarball contents
        // listing) goes to stderr -- so trimming stdout is all that's needed to locate it.
        const packDestination = fs.mkdtempSync(path.join(os.tmpdir(), "pokie materialize tarball pack "));
        const filename = execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", packDestination], {
            cwd: REPO_ROOT,
            encoding: "utf-8",
        }).trim();
        tarballPath = path.join(packDestination, filename);

        tarballInstallDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie materialize tarball consumer "));
        fs.writeFileSync(
            path.join(tarballInstallDir, "package.json"),
            JSON.stringify(
                {
                    name: "pokie-materialize-tarball-consumer",
                    version: "0.0.0",
                    private: true,
                    dependencies: {pokie: `file:${tarballPath}`, ...localClosureDependencies},
                },
                null,
                4,
            ),
        );
        execFileSync("npm", ["install", "--no-audit", "--no-fund"], {cwd: tarballInstallDir, encoding: "utf-8"});
        tarballInstalledPokieRoot = path.join(tarballInstallDir, "node_modules", "pokie");

        // Real `npm link` (never a hand-rolled fs.symlinkSync) against a scratch global prefix, so the
        // symlink it creates lives entirely under this test's own temp directories.
        linkNpmPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "pokie materialize link prefix "));
        fs.mkdirSync(path.join(linkNpmPrefix, "lib", "node_modules"), {recursive: true});
        linkInstallDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie materialize link consumer "));
        fs.writeFileSync(
            path.join(linkInstallDir, "package.json"),
            JSON.stringify({name: "pokie-materialize-link-consumer", version: "0.0.0", private: true}, null, 4),
        );
        execFileSync("npm", ["link", REPO_ROOT], {
            cwd: linkInstallDir,
            encoding: "utf-8",
            env: {...process.env, "npm_config_prefix": linkNpmPrefix},
        });
        linkedPokieRoot = path.join(linkInstallDir, "node_modules", "pokie");
    });

    afterAll(() => {
        fs.rmSync(path.dirname(tarballPath), {recursive: true, force: true});
        fs.rmSync(tarballInstallDir, {recursive: true, force: true});
        fs.rmSync(linkInstallDir, {recursive: true, force: true});
        fs.rmSync(linkNpmPrefix, {recursive: true, force: true});
        restoreEnv("npm_config_offline", originalNpmOffline);
        restoreEnv("npm_config_registry", originalNpmRegistry);
    });

    beforeEach(() => {
        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie materialize source npm-sources offline e2e "));
    });

    afterEach(() => {
        fs.rmSync(sourceDir, {recursive: true, force: true});
    });

    function writeStarterBlueprint(): string {
        const blueprintPath = path.join(sourceDir, "game.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(createStarterGameBlueprint(), null, 4));
        return blueprintPath;
    }

    it.each([
        ["a real `npm pack` + `npm install <tarball>` root, with no node_modules of its own", () => tarballInstalledPokieRoot] as const,
        ["a real `npm link` root", () => linkedPokieRoot] as const,
    ])("materializes a genuinely loadable runtime through the default production resolver from %s -- unpublished pokie version, no registry", async (_label, getPokiePackageRoot) => {
        const pokieVersion = `0.0.0-offline-e2e-unpublished-${crypto.randomBytes(4).toString("hex")}`;
        const pokiePackageRoot = getPokiePackageRoot();
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(pokieVersion, DEV_OPERATION, pokiePackageRoot);
        const blueprintPath = writeStarterBlueprint();

        const resolved = await resolveRuntimePackageRoot(blueprintPath);
        try {
            // "pokie" really did resolve to this exact installation (the tarball-installed/linked root),
            // not any registry-published version.
            const installedPokiePackageJson = JSON.parse(
                fs.readFileSync(path.join(resolved.runtimePath, "node_modules", "pokie", "package.json"), "utf-8"),
            ) as {name: string};
            expect(installedPokiePackageJson.name).toBe("pokie");

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const entry = require(path.join(resolved.runtimePath, "dist", "index.js"));
            const game = entry.default ?? entry;
            expect(game.getManifest().id).toBe("starter-slot");
        } finally {
            await resolved.release();
        }
    });
});

type CliExecution = {exitCode: number | null; stdout: string; stderr: string};

// Runs the built CLI executable to completion exactly the way a real installed "pokie" binary would --
// a genuine child process, dispatched through its own real argv/dispatch() (cli/dispatch.ts), never a
// hand-constructed command instance -- and waits for it to exit on its own. The right shape for a
// one-shot command (validate/sim) that never binds a port. "--preserve-symlinks-main" is what keeps
// `pokieJsPath`'s own spaced path the one cli/pokie.ts's ownPackageDir()/readOwnPackageRoot() actually
// observes -- see the describe block below's own doc comment for why that matters and why this is one of
// only two places in the suite that spawns a real CLI subprocess.
function runPokieCliToCompletion(pokieJsPath: string, args: string[]): Promise<CliExecution> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--preserve-symlinks-main", pokieJsPath, ...args]) as ChildProcessWithoutNullStreams;
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("exit", (exitCode) => {
            resolve({exitCode, stdout, stderr});
        });
    });
}

type CliServerHandle = {baseUrl: string; stop(): Promise<void>};

// Same real-subprocess mechanism as runPokieCliToCompletion, for a command that starts a server and
// keeps running (serve/dev/studio): resolves once `readyPattern` matches its own "listening on
// http://..." stdout line -- the same thing a real user watches for -- and stop() sends the exact
// signal a real user's Ctrl+C would (SIGINT), driving the command's own registered shutdown handler
// (DevCommand/StudioCommand) or Node's own default SIGINT termination (ServeCommand, which registers no
// handler of its own) rather than a forced kill.
function startPokieCliServer(pokieJsPath: string, args: string[], readyPattern: RegExp): Promise<CliServerHandle> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--preserve-symlinks-main", pokieJsPath, ...args]) as ChildProcessWithoutNullStreams;
        let stdout = "";
        let stderr = "";
        let settled = false;
        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
            if (settled) {
                return;
            }
            const match = readyPattern.exec(stdout);
            if (match) {
                settled = true;
                resolve({baseUrl: `http://127.0.0.1:${match[1]}`, stop: () => stopPokieCliChild(child)});
            }
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.once("error", (error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        });
        child.once("exit", (exitCode) => {
            if (!settled) {
                settled = true;
                reject(new Error(`pokie CLI exited (code ${exitCode}) before reporting it was listening.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
            }
        });
    });
}

function stopPokieCliChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    return new Promise((resolve, reject) => {
        if (child.exitCode !== null) {
            resolve();
            return;
        }
        const timer = setTimeout(() => {
            reject(new Error("Timed out waiting for the pokie CLI child process to exit after SIGINT."));
        }, 15000);
        child.once("exit", () => {
            clearTimeout(timer);
            resolve();
        });
        child.kill("SIGINT");
    });
}

// Proves the offline mechanism above isn't just reachable through BlueprintProjectMaterializer/
// createMaterializingRuntimePackageResolver directly (the describe block above), but through the real,
// built `pokie` CLI executable itself -- a genuine child process running dist/cli/pokie.js exactly the
// way an installed "pokie" binary would, dispatched via its own real argv/dispatch() (cli/dispatch.ts),
// never a hand-constructed command instance -- for every required CLI runtime entry point a real user
// would actually run against an unpublished Blueprint: `pokie validate`, `pokie sim`, `pokie serve`,
// `pokie dev`, the implicit `pokie <blueprint.json>` Studio launch (see resolveCliInvocation.ts's own
// doc comment on why a bare, existing path argument opens Studio's Project mode for it), and Studio's
// Play runtime -- the "applicable play path" for a Blueprint, which has no separately-built package a
// second, standalone play surface could otherwise come from.
//
// This is the one other sanctioned place in the suite that spawns a real CLI subprocess (see
// tests/packaging/npmPackSmoke.test.ts's own doc comment on the project's "never spawn a CLI command as
// a subprocess in tests" convention) -- for a different reason than that file's own packaging proof:
// this describe block exists to prove *running-installation-root discovery* (cli/pokie.ts's own
// readOwnPackageRoot()/ownPackageDir(), and the real dispatch() precedence that routes a bare path to
// Studio) actually reaches a materialized runtime end to end, not per-command argument-parsing behavior
// -- that stays covered, fast and in-process, by tests/cli/cliCommandInventory.contract.test.ts.
//
// `pokiePackageRootWithSpaces` stands in for "the running POKIE installation's own root directory" at a
// path shaped the way a real end user's machine easily produces one (e.g. under "Program Files", "My
// Projects"). Unlike the describe block above's own plain symlink-to-REPO_ROOT, this one is a *real*
// directory: it also needs its own package.json "version" field rewritten to an unpublished value (see
// POKIE_VERSION below), which would corrupt this checkout's own package.json if the whole root were
// just a symlink to it. Only its two large, read-only subtrees are symlinked in -- dist/ (built moments
// earlier by ensureCompiledTestOutput below) and node_modules/, both real REPO_ROOT copies, never
// duplicated on disk -- and package.json itself is a real, rewritten copy. Every provenance
// withLocalPokieDependency's own doc comment lists (a dev checkout, an npm-linked target, a
// tarball-installed or ordinarily npm-installed copy) is equally well represented: the mechanism only
// ever cares about the resolved absolute path and package.json content, never how either got there.
//
// Node's own module loader would ordinarily resolve a symlinked *main* module (dist/cli/pokie.js, or any
// of its symlinked ancestor directories) to its real, non-spaced target path before import.meta.url is
// ever read -- the "--preserve-symlinks-main" flag every spawn above passes is what keeps the spaced path
// itself the one cli/pokie.ts's own ownPackageDir()/readOwnPackageRoot() actually observes, so a passing
// run here is proof the *real* running-installation discovery mechanism resolves a spaced path
// correctly, not just that it resolves *some* path. (This has no bearing on ordinary dependency
// resolution -- "commander"/"exceljs" resolve through the symlinked node_modules/ exactly as they would
// without the flag; only the main module's own realpath-for-import.meta.url is affected.)
//
// Every "npm install" spawned below also runs with the registry forced unreachable and npm's own
// `--offline` mode forced on (see beforeAll) -- so an unpublished pokieVersion alone could never be
// mistaken for proof that *every* transitive dependency avoids registry resolution.
//
// All five commands below share one pokieVersion (POKIE_VERSION, baked into the rewritten package.json
// above) and one unmodified starter Blueprint, so -- exactly as a real, shared cache would -- only the
// first command below to run actually performs a real "npm install"; every command after it borrows that
// same cache entry (BlueprintProjectMaterializer's own cache key never depends on which PokieOperation
// asked for it). That's still full proof every entry point *reaches* the shared mechanism through its
// own real CLI invocation; the dedicated fresh-install/cache-reuse behavior itself is already covered by
// the describe block above, so it isn't repeated five times here.
//
// Slow (real npm, a real tsc build of dist/cli, and five real subprocess launches), same
// "pokie-integration" project as BlueprintProjectMaterializer.integration.test.ts (see jest.config.mjs's
// `*.integration.test.ts` glob).
describe("CLI command coverage (offline end-to-end, through the built CLI executable): validate, sim, serve, dev, implicit Blueprint target opening, and Play -- all through dispatch() and the running installation's own root discovery", () => {
    jest.setTimeout(300000);

    const POKIE_VERSION = `0.0.0-offline-cli-e2e-unpublished-${crypto.randomBytes(4).toString("hex")}`;

    let pokiePackageRootWithSpaces: string;
    let pokieJsPath: string;
    let sourceDir: string;
    let blueprintPath: string;
    let blueprint: GameBlueprint;
    let originalNpmOffline: string | undefined;
    let originalNpmRegistry: string | undefined;

    beforeAll(() => {
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [COMPILED_CJS_ENTRY, COMPILED_CJS_PACKAGE_JSON, COMPILED_ESM_WORKER_ENTRY],
            lockName: "compiled-runtime",
            command: ["npm", "run", "build-test-runtime"],
        });
        // Built directly via tsc -- never "npm run build-cli", which also builds the client/studio-client
        // frontends through vite. Neither is needed here: PokieClientServer/StudioServer both serve their
        // own static assets lazily and never validate that clientRoot/studioRoot exist up front, and every
        // assertion below only ever talks to a JSON API, never a served frontend asset. This produces the
        // exact compiled dist/cli/pokie.js every command below is spawned from.
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [path.join(REPO_ROOT, "dist", "cli", "pokie.js")],
            lockName: "compiled-cli",
            command: [path.join(REPO_ROOT, "node_modules", ".bin", "tsc"), "--project", "tsconfig.cli.json"],
        });

        pokiePackageRootWithSpaces = fs.mkdtempSync(path.join(os.tmpdir(), "pokie install root with spaces cli e2e "));
        fs.symlinkSync(path.join(REPO_ROOT, "dist"), path.join(pokiePackageRootWithSpaces, "dist"), "dir");
        fs.symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(pokiePackageRootWithSpaces, "node_modules"), "dir");
        const repoPackageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as Record<string, unknown>;
        fs.writeFileSync(
            path.join(pokiePackageRootWithSpaces, "package.json"),
            JSON.stringify({...repoPackageJson, version: POKIE_VERSION}, null, 4),
        );
        pokieJsPath = path.join(pokiePackageRootWithSpaces, "dist", "cli", "pokie.js");

        originalNpmOffline = process.env.npm_config_offline;
        originalNpmRegistry = process.env.npm_config_registry;
        process.env["npm_config_offline"] = "true";
        process.env["npm_config_registry"] = "http://127.0.0.1:1/";

        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie cli offline e2e source "));
        blueprint = createStarterGameBlueprint();
        blueprintPath = path.join(sourceDir, "game.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint, null, 4));
    });

    afterAll(() => {
        fs.rmSync(pokiePackageRootWithSpaces, {recursive: true, force: true});
        fs.rmSync(sourceDir, {recursive: true, force: true});
        fs.rmSync(computeDefaultCacheDir(blueprint, POKIE_VERSION), {recursive: true, force: true});
        restoreEnv("npm_config_offline", originalNpmOffline);
        restoreEnv("npm_config_registry", originalNpmRegistry);
    });

    it("`pokie validate` reaches a materialized runtime through the built CLI executable", async () => {
        const result = await runPokieCliToCompletion(pokieJsPath, ["validate", blueprintPath]);
        expect(result.stderr).toBe("");
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("valid           yes");
    });

    it("`pokie sim` reaches a materialized runtime through the built CLI executable", async () => {
        const outFile = path.join(sourceDir, "sim-report.json");
        const result = await runPokieCliToCompletion(pokieJsPath, [
            "sim",
            blueprintPath,
            "--rounds",
            "50",
            "--workers",
            "1",
            "--seed",
            "offline-cli-e2e",
            "--out",
            outFile,
        ]);
        expect(result.stderr).toBe("");
        expect(result.exitCode).toBe(0);
        const report = JSON.parse(fs.readFileSync(outFile, "utf-8")) as {game: {id: string}; rounds: number};
        expect(report.game.id).toBe("starter-slot");
        expect(report.rounds).toBe(50);
    });

    it("`pokie serve` reaches a materialized runtime through the built CLI executable and answers real HTTP", async () => {
        const server = await startPokieCliServer(
            pokieJsPath,
            ["serve", blueprintPath, "--port", "0"],
            /POKIE dev server \(experimental\) listening on http:\/\/127\.0\.0\.1:(\d+)/,
        );
        try {
            const gameResponse = await fetch(`${server.baseUrl}/game`);
            expect((await gameResponse.json()) as {id: string}).toMatchObject({id: "starter-slot"});
        } finally {
            await server.stop();
        }
    });

    it("`pokie dev` reaches a materialized runtime through the built CLI executable and serves a healthy API", async () => {
        const server = await startPokieCliServer(
            pokieJsPath,
            ["dev", blueprintPath, "--port", "0", "--client-port", "0", "--no-open"],
            /dev server \(experimental\) listening on http:\/\/127\.0\.0\.1:(\d+)/,
        );
        try {
            const healthResponse = await fetch(`${server.baseUrl}/health`);
            expect(healthResponse.status).toBe(200);
        } finally {
            await server.stop();
        }
    });

    it("implicit Blueprint target opening and Play both reach a materialized runtime through the built CLI executable's own dispatch", async () => {
        // Mirrors exactly what `pokie <blueprint.json>` dispatches to -- see resolveCliInvocation.ts's own
        // precedence table: a bare, existing path argument resolves to {commandName: "studio", args:
        // [thatPath, ...everyTrailingFlag]}.
        const server = await startPokieCliServer(
            pokieJsPath,
            [blueprintPath, "--port", "0", "--no-open"],
            /POKIE Studio listening on http:\/\/127\.0\.0\.1:(\d+)/,
        );
        try {
            const dashboard = await pollProjectDashboard(server.baseUrl);
            expect(dashboard.status).toBe("loaded");
            expect((dashboard.game as {id: string}).id).toBe("starter-slot");

            // Play is Studio's only game mode -- a real session driven entirely in-process, with no
            // separate server/host/port of its own (see StudioServer.ts's own doc comment on
            // handlePlayNewSession/handlePlaySpin).
            const created = await postJson(`${server.baseUrl}/api/project/play/session`, {});
            expect(created.status).toBe(201);
            const sessionId = (created.body.session as {sessionId: string}).sessionId;

            const spun = await postJson(`${server.baseUrl}/api/project/play/sessions/${sessionId}/spin`, {});
            expect(spun.status).toBe(200);
        } finally {
            await server.stop();
        }
    });
});

// Polls GET /api/project/context -- the exact route the Project Dashboard itself polls -- until the
// background load StudioServer kicked off at startup (see StudioServer.ts's own startProjectDashboardLoad)
// settles out of "loading"/"empty" into a terminal status. Mirrors StudioFullWorkflow.integration.test.ts's
// own pollUntilTerminal, tailored to this context's own status vocabulary.
async function pollProjectDashboard(baseUrl: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 2000; attempt++) {
        const response = await fetch(`${baseUrl}/api/project/context`);
        const body = (await response.json()) as Record<string, unknown>;
        if (body.status !== "loading" && body.status !== "empty") {
            return body;
        }
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }
    throw new Error(`Timed out waiting for ${baseUrl}/api/project/context to leave "loading".`);
}

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
    } else {
        process.env[name] = value;
    }
}
