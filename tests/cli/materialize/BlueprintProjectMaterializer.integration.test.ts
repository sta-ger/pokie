import fs from "fs";
import os from "os";
import path from "path";
import {createStarterGameBlueprint} from "../../../cli/build/createStarterGameBlueprint.js";
import {BlueprintProjectMaterializer} from "../../../cli/materialize/BlueprintProjectMaterializer.js";
import {PackageCommandResult, PackageCommandRunning} from "../../../cli/prepare/PackageCommandRunner.js";
import {localPokieDependencyRunner, REPO_ROOT} from "../../testUtils/offlinePokieDependencyOverride.js";
import {ensureCompiledTestOutput} from "../../testUtils/ensureCompiledTestOutput.js";

const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");
const COMPILED_CJS_PACKAGE_JSON = path.join(REPO_ROOT, "dist", "cjs", "package.json");
const COMPILED_ESM_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js");

type RecordedCommand = {args: string[]; cwd: string};

function countingRunner(base: PackageCommandRunning): PackageCommandRunning & {calls: RecordedCommand[]} {
    const calls: RecordedCommand[] = [];
    const runner = (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        calls.push({args, cwd});
        return base(command, args, cwd);
    };
    return Object.assign(runner, {calls});
}

// The one BlueprintProjectMaterializer test that runs its real, uninjected collaborators end to end: the
// real GamePackageGenerator (the exact code path "pokie build" itself uses -- see that class's own doc
// comment for why nothing here is a simplified/in-memory blueprint interpreter), a real spawned "npm install"
// (offline, via localPokieDependencyRunner -- see tests/testUtils/offlinePokieDependencyOverride.ts), and the
// real PokieGamePackageValidator, which only ever reports "valid" by dynamically loading the materialized
// package's own entry module through Node's real module resolution (require("pokie") included). A materialize()
// call that succeeds here is proof the cached result is a genuine, runnable PokieGame runtime, not a stand-in
// -- exactly what BlueprintProjectMaterializer.test.ts's fakes can't themselves prove. Slow (real npm), which
// is why -- like GamePackagePreparer.integration.test.ts -- this lives in the "pokie-integration" project
// (see jest.config.mjs's `*.integration.test.ts` glob) rather than the default fast lane.
describe("BlueprintProjectMaterializer (real generator, real npm install, real verify)", () => {
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
        cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-materialize-cache-real-"));
        sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-materialize-source-real-"));
    });

    afterEach(() => {
        fs.rmSync(cacheRoot, {recursive: true, force: true});
        fs.rmSync(sourceDir, {recursive: true, force: true});
    });

    it("materializes a blueprint into a genuinely loadable PokieGame runtime -- real dist/index.js, real installed node_modules/pokie", async () => {
        const runner = countingRunner(localPokieDependencyRunner());
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, undefined, cacheRoot);
        const blueprintPath = path.join(sourceDir, "game.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(createStarterGameBlueprint(), null, 4));

        const result = await materializer.materialize({
            type: "blueprint",
            rootPath: blueprintPath,
            capabilities: [],
            provenance: "test fixture",
        } as never);

        expect(fs.existsSync(path.join(result.runtimePath, "dist", "index.js"))).toBe(true);
        expect(fs.existsSync(path.join(result.runtimePath, "node_modules", "pokie"))).toBe(true);
        expect(result.ownsRuntimePath).toBe(false);
        expect(runner.calls).toHaveLength(1);

        // Loads exactly the way loadPokieGame/PokieGamePackageValidator do -- a real require() of the
        // materialized entry module, resolving "pokie" through the real node_modules this materializer's
        // own "npm install" phase just installed.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const entry = require(path.join(result.runtimePath, "dist", "index.js"));
        const game = entry.default ?? entry;
        expect(game.getManifest().id).toBe("starter-slot");
    });

    it("reuses the cache for an unchanged blueprint without a second real 'npm install'", async () => {
        const runner = countingRunner(localPokieDependencyRunner());
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, undefined, cacheRoot);
        const blueprintPath = path.join(sourceDir, "game.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(createStarterGameBlueprint(), null, 4));
        const project = {type: "blueprint", rootPath: blueprintPath, capabilities: [], provenance: "test fixture"} as never;

        const first = await materializer.materialize(project);
        const second = await materializer.materialize(project);

        expect(second.runtimePath).toBe(first.runtimePath);
        expect(runner.calls).toHaveLength(1);
    });

    it("materializes an edited blueprint into a fresh cache entry with its own real 'npm install'", async () => {
        const runner = countingRunner(localPokieDependencyRunner());
        const materializer = new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined, runner, undefined, cacheRoot);
        const blueprintPath = path.join(sourceDir, "game.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(createStarterGameBlueprint(), null, 4));
        const project = {type: "blueprint", rootPath: blueprintPath, capabilities: [], provenance: "test fixture"} as never;

        const before = await materializer.materialize(project);

        const edited = createStarterGameBlueprint();
        edited.manifest.id = "starter-slot-edited";
        fs.writeFileSync(blueprintPath, JSON.stringify(edited, null, 4));
        const after = await materializer.materialize(project);

        expect(after.runtimePath).not.toBe(before.runtimePath);
        expect(runner.calls).toHaveLength(2);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const entry = require(path.join(after.runtimePath, "dist", "index.js"));
        const game = entry.default ?? entry;
        expect(game.getManifest().id).toBe("starter-slot-edited");
    });
});
