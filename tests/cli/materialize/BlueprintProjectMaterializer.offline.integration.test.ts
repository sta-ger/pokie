import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {DEV_OPERATION} from "pokie";
import {createStarterGameBlueprint} from "../../../cli/build/createStarterGameBlueprint.js";
import {BlueprintMaterializationError} from "../../../cli/materialize/BlueprintMaterializationError.js";
import {BlueprintProjectMaterializer} from "../../../cli/materialize/BlueprintProjectMaterializer.js";
import {createMaterializingRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";
import {PackageCommandResult, PackageCommandRunning, withLocalPokieInstall} from "../../../cli/prepare/PackageCommandRunner.js";
import {REPO_ROOT} from "../../testUtils/offlinePokieDependencyOverride.js";
import {ensureCompiledTestOutput} from "../../testUtils/ensureCompiledTestOutput.js";

const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");
const COMPILED_CJS_PACKAGE_JSON = path.join(REPO_ROOT, "dist", "cjs", "package.json");
const COMPILED_ESM_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js");

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

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
    } else {
        process.env[name] = value;
    }
}
