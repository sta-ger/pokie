import fs from "fs";
import os from "os";
import path from "path";
import {createStarterGameBlueprint} from "../../../cli/build/createStarterGameBlueprint.js";
import {BlueprintMaterializationError} from "../../../cli/materialize/BlueprintMaterializationError.js";
import {BlueprintProjectMaterializer} from "../../../cli/materialize/BlueprintProjectMaterializer.js";
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
const UNPUBLISHED_POKIE_VERSION = "0.0.0-offline-e2e-unpublished";

function blueprintProject(rootPath: string): unknown {
    return {type: "blueprint", rootPath, capabilities: [], provenance: "test fixture"};
}

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
    return Object.assign(runner, {
        get calls() {
            return calls;
        },
    });
}

// Proves BlueprintProjectMaterializer's real, shipped offline mechanism (withLocalPokieInstall, wired in
// by materializeRuntimePackage.ts's default resolver for every CLI/Studio operation) end to end: a real
// GamePackageGenerator, a real spawned "npm install" that never reaches a registry -- not for "pokie"
// itself, and not for any of its own runtime dependencies (e.g. "exceljs", which alone pulls in dozens
// of transitive packages of its own -- see withLocalPokieDependencyClosure's own doc comment in
// PackageCommandRunner.ts) -- and a real PokieGamePackageValidator loading the result, against a
// pokieVersion that could never resolve from a registry at all. `withLocalPokieInstall` is used exactly
// as every real CLI/Studio call site uses it, bound to this checkout's own REPO_ROOT (standing in for
// "the running POKIE installation's own root directory" -- see cli/pokie.ts's readOwnPackageRoot()) --
// never wrapped in any test-only dependency override, so this proves the actual shipped mechanism, not
// a stand-in for it. Slow (real npm), same "pokie-integration" project as
// BlueprintProjectMaterializer.integration.test.ts (see jest.config.mjs's `*.integration.test.ts` glob).
describe("BlueprintProjectMaterializer (offline end-to-end: unpublished pokie version, real npm, no registry)", () => {
    jest.setTimeout(300000);

    let cacheRoot: string;
    let sourceDir: string;

    beforeAll(() => {
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [COMPILED_CJS_ENTRY, COMPILED_CJS_PACKAGE_JSON, COMPILED_ESM_WORKER_ENTRY],
            lockName: "compiled-runtime",
            command: ["npm", "run", "build-test-runtime"],
        });
    });

    beforeEach(() => {
        cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-materialize-cache-offline-e2e-"));
        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-materialize-source-offline-e2e-"));
    });

    afterEach(() => {
        fs.rmSync(cacheRoot, {recursive: true, force: true});
        fs.rmSync(sourceDir, {recursive: true, force: true});
    });

    it("materializes a genuinely loadable runtime and reuses the cache, for a pokieVersion that has never been published", async () => {
        const runner = withLocalPokieInstall(REPO_ROOT);
        const materializer = new BlueprintProjectMaterializer(UNPUBLISHED_POKIE_VERSION, undefined, undefined, undefined, runner, undefined, cacheRoot);
        const blueprintPath = path.join(sourceDir, "game.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(createStarterGameBlueprint(), null, 4));
        const project = blueprintProject(blueprintPath);

        const first = await materializer.materialize(project as never);
        const second = await materializer.materialize(project as never);

        expect(second.runtimePath).toBe(first.runtimePath);

        // "pokie" really did resolve to this exact checkout, not any registry-published version.
        const installedPokiePackageJson = JSON.parse(
            fs.readFileSync(path.join(first.runtimePath, "node_modules", "pokie", "package.json"), "utf-8"),
        ) as {name: string};
        expect(installedPokiePackageJson.name).toBe("pokie");

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const entry = require(path.join(first.runtimePath, "dist", "index.js"));
        const game = entry.default ?? entry;
        expect(game.getManifest().id).toBe("starter-slot");
    });

    it("recovers from a failed staging build, leaves no cache artifacts, and safely retries without a second install once cached", async () => {
        const blueprintPath = path.join(sourceDir, "game.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(createStarterGameBlueprint(), null, 4));
        const project = blueprintProject(blueprintPath);

        const flakyRunner = failFirstInstallThenDelegate(withLocalPokieInstall(REPO_ROOT));
        const materializer = new BlueprintProjectMaterializer(
            UNPUBLISHED_POKIE_VERSION,
            undefined,
            undefined,
            undefined,
            flakyRunner,
            undefined,
            cacheRoot,
        );

        const caught = await materializer.materialize(project as never).catch((error: unknown) => error);

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

        const retried = await materializer.materialize(project as never);
        expect(fs.existsSync(path.join(retried.runtimePath, "dist", "index.js"))).toBe(true);
        expect(fs.existsSync(path.join(retried.runtimePath, "node_modules", "pokie"))).toBe(true);
        expect(flakyRunner.calls).toBe(2);

        const cachedAfterRetry = await materializer.materialize(project as never);
        expect(cachedAfterRetry.runtimePath).toBe(retried.runtimePath);
        expect(flakyRunner.calls).toBe(2);
    });
});
