import {execFileSync} from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {DEV_OPERATION} from "@fromstan/pokie";
import {createStarterGameBlueprint} from "../../cli/build/createStarterGameBlueprint.js";
import {BlueprintMaterializationError} from "../../cli/materialize/BlueprintMaterializationError.js";
import {BlueprintProjectMaterializer} from "../../cli/materialize/BlueprintProjectMaterializer.js";
import {createMaterializingRuntimePackageResolver} from "../../cli/materialize/materializeRuntimePackage.js";
import {resolveLocalPokieDependencyClosure} from "../../cli/prepare/localPokieDependencyClosure.js";
import {PackageCommandResult, PackageCommandRunning, withLocalPokieInstall} from "../../cli/prepare/PackageCommandRunner.js";
import {REPO_ROOT} from "../testUtils/offlinePokieDependencyOverride.js";
import {ensureCompiledTestOutput} from "../testUtils/ensureCompiledTestOutput.js";

const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");
const COMPILED_CJS_PACKAGE_JSON = path.join(REPO_ROOT, "dist", "cjs", "package.json");
const COMPILED_ESM_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js");

// Randomized unpublished versions force fresh offline materialization rather than a stale cache.
const UNPUBLISHED_POKIE_VERSION = `0.0.0-offline-e2e-unpublished-${crypto.randomBytes(4).toString("hex")}`;

// Fails every install for one staging directory (a real, structured rejection shaped like a real execFile
// failure -- a message plus a separate "stderr") and delegates a later staging build to `base`. This lets
// the materializer exhaust its own transient-install retry before the production resolver must surface its
// BlueprintMaterializationError; the caller's subsequent retry then gets a fresh staging directory.
function failOneStagingBuildThenDelegate(base: PackageCommandRunning): PackageCommandRunning & {calls: number} {
    let calls = 0;
    let failedStagingDir: string | undefined;
    const runner = (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        calls++;
        if (args[0] === "install" && (failedStagingDir === undefined || cwd === failedStagingDir)) {
            failedStagingDir = cwd;
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

describe("BlueprintProjectMaterializer (offline real npm staging-build retry and recovery)", () => {
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
            forceRebuild: true,
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

    it("exposes exhausted staging-build retries as a materialization error, clears the failed cache, and reuses a fresh retry", async () => {
        const blueprintPath = writeStarterBlueprint();

        const flakyRunner = failOneStagingBuildThenDelegate(withLocalPokieInstall(pokiePackageRootWithSpaces));
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
            expect(fs.existsSync(path.join(retried.runtimePath, "node_modules", "@fromstan", "pokie"))).toBe(true);
            expect(flakyRunner.calls).toBe(3);

            const cachedAfterRetry = await resolveRuntimePackageRoot(blueprintPath);
            try {
                expect(cachedAfterRetry.runtimePath).toBe(retried.runtimePath);
                expect(flakyRunner.calls).toBe(3);
            } finally {
                await cachedAfterRetry.release();
            }
        } finally {
            await retried.release();
        }
    });
});

// Proves the default production resolver also works from a real npm-managed installation of
// @fromstan/pokie. The ordinary checkout/local-link coverage stays in the CLI integration suite;
// these packaging cases cover a tarball-installed copy (what `npm install <tarball>` actually leaves
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
// source form), discovered by the "pokie-packaging" project.
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
                    dependencies: {"@fromstan/pokie": `file:${tarballPath}`, ...localClosureDependencies},
                },
                null,
                4,
            ),
        );
        execFileSync("npm", ["install", "--no-audit", "--no-fund"], {cwd: tarballInstallDir, encoding: "utf-8"});
        tarballInstalledPokieRoot = path.join(tarballInstallDir, "node_modules", "@fromstan", "pokie");

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
        linkedPokieRoot = path.join(linkInstallDir, "node_modules", "@fromstan", "pokie");
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
                fs.readFileSync(path.join(resolved.runtimePath, "node_modules", "@fromstan", "pokie", "package.json"), "utf-8"),
            ) as {name: string};
            expect(installedPokiePackageJson.name).toBe("@fromstan/pokie");

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const entry = require(path.join(resolved.runtimePath, "dist", "index.js"));
            const game = entry.default ?? entry;
            expect(game.getManifest().id).toBe("starter-slot");
        } finally {
            await resolved.release();
        }
    });
});

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
    } else {
        process.env[name] = value;
    }
}
