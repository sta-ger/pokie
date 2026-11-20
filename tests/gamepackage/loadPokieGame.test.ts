import {stageCompiledTestRuntime} from "../testUtils/stageCompiledTestRuntime.js";
import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT} from "../contracts/fixtures/PackageExtractionFixture.js";
import {loadPokieGame, loadPokieGameRuntime, readPokiePackageConfig, releasePokieGame, resolvePokieGameDependencyRoots} from "@fromstan/pokie";
import fs from "fs";
import {createRequire} from "module";
import {execFileSync, type ExecFileSyncOptionsWithStringEncoding} from "child_process";
import {pathToFileURL} from "url";
import os from "os";
import path from "path";
import ts from "typescript";

let disposeRuntimeStorage: () => void;
beforeAll(() => {
    // Keep the real dependency/fallback fixtures; only their owned snapshot scratch changes.
    disposeRuntimeStorage = createPackageExtractionTestEnvironment({stageRuntime: false});
});
afterAll(() => disposeRuntimeStorage());

const fixturesRoot = path.join(__dirname, "fixtures");

function runNativeProbe(args: string[], options: Omit<ExecFileSyncOptionsWithStringEncoding, "encoding"> = {}): string {
    const started = Date.now();
    try {
        return execFileSync(process.execPath, args, {
            timeout: 30000, ...options, encoding: "utf8", killSignal: "SIGKILL", stdio: "pipe",
        });
    } catch (error) {
        // Node's synchronous spawn error can point to itself through .error. Jest workers
        // serialize enumerable error properties, hiding the real failure behind a JSON crash.
        const failure = error as Error & {code?: string; status?: number; signal?: string; stdout?: string; stderr?: string};
        throw new Error(`Native probe ${args[0]} failed after ${Date.now() - started} ms ` +
            `(code=${failure.code}, status=${failure.status}, signal=${failure.signal}): ${failure.message}\n` +
            `stdout:\n${failure.stdout ?? ""}\nstderr:\n${failure.stderr ?? ""}`);
    }
}

it("reports native probe rejection and timeout without circular worker errors", () => {
    for (const [script, timeout, expected] of [
        ["process.stderr.write('probe rejected'); process.exitCode = 7;", 30000, /status=7[\s\S]*probe rejected/],
        ["setInterval(() => {}, 1000);", 50, /code=ETIMEDOUT[\s\S]*signal=SIGKILL/],
    ] as const) {
        let failure: unknown;
        try {
            runNativeProbe(["-e", script], {timeout});
        } catch (error) {
            failure = error;
        }
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toMatch(expected);
        expect(() => JSON.stringify(failure)).not.toThrow();
    }
});

it("preserves the installed host closure for unchanged external games", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-host-"));
    const host = path.join(root, "host");
    const installation = path.join(host, "node_modules", "@fromstan", "pokie");
    const runtimeTree = path.join(installation, "dist", "esm");
    const game = path.join(root, "external-game");
    const runtimeTemporaryRoot = path.join(root, "runtime-tmp");
    // Emit only the affected production modules and their value imports. This is an ordinary
    // resolution fixture, not a package build or a source-module resolution hook.
    const emitted = new Set<string>();
    const emit = (relative: string): void => {
        if (emitted.has(relative)) return;
        emitted.add(relative);
        const output = ts.transpileModule(fs.readFileSync(path.resolve("src", relative), "utf8"), {
            compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
        }).outputText;
        const file = path.join(runtimeTree, relative.replace(/\.ts$/, ".js"));
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, output);
        for (const match of output.matchAll(/["'](\.[^"']+\.js)["']/g)) {
            const dependency = path.join(path.dirname(relative), match[1]).replace(/\.js$/, ".ts");
            if (fs.existsSync(path.resolve("src", dependency))) emit(dependency);
        }
    };
    try {
        fs.mkdirSync(runtimeTemporaryRoot);
        emit("gamepackage/loadPokieGame.ts");
        emit("optimization/internal/optimizationData.ts");
        fs.mkdirSync(path.join(runtimeTree, "gamepackage", "internal"), {recursive: true});
        fs.copyFileSync(path.resolve("src/gamepackage/internal/runtimeLocation.mjs"), path.join(runtimeTree, "gamepackage", "internal", "runtimeLocation.mjs"));
        const manifest = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
        fs.writeFileSync(path.join(installation, "package.json"), JSON.stringify({
            name: manifest.name, version: manifest.version, type: "module",
            exports: {".": {types: "./dist/esm/index.d.ts", default: "./dist/esm/index.js"}},
            dependencies: {...manifest.dependencies, "host-behavior": "1"},
            optionalDependencies: {"missing-host-optional": "1"},
        }));
        fs.mkdirSync(path.join(installation, "node_modules"));
        // Keep the real executable dependency graph, including package scopes, assets,
        // cycles and peers. Maps/declarations are irrelevant to these native JS consumers;
        // repeatedly copying and hashing them dominated this bounded closure probe under load.
        const staged = new Map<string, string>();
        const stageDependency = async (source: string): Promise<string> => {
            const existing = staged.get(source);
            if (existing) return existing;
            const destination = path.join(root, "dependencies", String(staged.size));
            staged.set(source, destination);
            fs.cpSync(source, destination, {recursive: true, filter: file =>
                !["node_modules", ".git"].includes(path.basename(file)) && !file.endsWith(".map") && !file.endsWith(".d.ts")});
            for (const [name, dependency] of Object.entries(await resolvePokieGameDependencyRoots(source, false))) {
                if (dependency === null) continue;
                const target = await stageDependency(dependency);
                const link = path.join(destination, "node_modules", name);
                fs.mkdirSync(path.dirname(link), {recursive: true});
                fs.symlinkSync(target, link, "dir");
            }
            return destination;
        };
        for (const name of Object.keys(manifest.dependencies)) {
            const dependency = await stageDependency(fs.realpathSync(path.resolve("node_modules", name)));
            const target = path.join(installation, "node_modules", name);
            fs.mkdirSync(path.dirname(target), {recursive: true});
            fs.symlinkSync(dependency, target, "dir");
        }
        const behavior = path.join(installation, "node_modules", "host-behavior");
        const leaf = path.join(behavior, "node_modules", "host-leaf");
        fs.mkdirSync(leaf, {recursive: true});
        fs.writeFileSync(path.join(behavior, "package.json"), JSON.stringify({name: "host-behavior", main: "index.js", dependencies: {"host-leaf": "1"}}));
        fs.writeFileSync(path.join(behavior, "index.js"), "module.exports = require('host-leaf');");
        fs.writeFileSync(path.join(leaf, "package.json"), JSON.stringify({name: "host-leaf", main: "index.js"}));
        fs.writeFileSync(path.join(leaf, "index.js"), "module.exports = 'before';");
        fs.writeFileSync(path.join(runtimeTree, "index.js"), `import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
export * from './gamepackage/loadPokieGame.js';
export * from './gamepackage/resolvePokieGameEntryModule.js';
export * from './optimization/internal/optimizationData.js';
const {Workbook} = require('@xlvane/exceljs'), {Command} = require('commander'), behavior = require('host-behavior');
export const hostProbe = () => [typeof new Workbook().addWorksheet, typeof new Command().parse, behavior];
export const hostPaths = () => [fileURLToPath(import.meta.url), require.resolve('@xlvane/exceljs'), require.resolve('commander'), require.resolve('host-behavior')];`);
        fs.mkdirSync(game);
        fs.writeFileSync(path.join(game, "package.json"), JSON.stringify({name: "unchanged-game", pokie: {entry: "game.cjs"}}));
        fs.writeFileSync(path.join(game, "game.cjs"), `const runtime = require('@fromstan/pokie');
module.exports = {getInfo: () => ({id: 'unchanged-game', name: runtime.hostProbe().join(':'), version: '1.0.0'}),
 createSession: () => ({root: __dirname, paths: runtime.hostPaths(), lazy: () => runtime.hostProbe()})};`);
        const script = path.join(host, "probe.cjs");
        fs.writeFileSync(script, `const assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const runtime = require('@fromstan/pokie');
const game = process.argv[2], installation = process.argv[3], leaf = process.argv[4], temporaryRoot = process.argv[5];
const started = performance.now(), timings = {};
const phase = name => { timings[name] = Math.round(performance.now() - started); console.error(name + ': ' + timings[name] + ' ms'); };
(async () => {
 assert.equal(require('os').tmpdir(), temporaryRoot);
 assert.deepEqual(fs.readdirSync(temporaryRoot), []);
 assert.throws(() => require('module').createRequire(path.join(game, 'game.cjs')).resolve('@fromstan/pokie'), /Cannot find module/);
 const first = await runtime.loadPokieGameRuntime(game);
 phase('first acquisition');
 const firstSession = first.game.createSession();
 assert.equal(first.game.getInfo().name, 'function:function:before');
 const roots = await runtime.resolvePokieGameDependencyRoots(game);
 assert.equal(roots['@fromstan/pokie'], installation);
 assert.equal((await runtime.resolvePokieGameDependencyRoots(installation, false))['missing-host-optional'], null);
 const detached = path.join(path.dirname(game), 'detached');
 runtime.copyPackage(game, detached);
 await runtime.createPokieGameDependencyOverlay(detached, game);
 assert.equal(fs.realpathSync(path.join(detached, 'node_modules/@fromstan/pokie')), installation);
 const before = await runtime.packageExecutableRevision(game);
 assert.equal(await runtime.packageExecutableRevision(detached), before);
 fs.writeFileSync(leaf, "module.exports = 'after';");
 const after = await runtime.packageExecutableRevision(game);
 assert.notEqual(after, before);
 assert.equal(await runtime.packageExecutableRevision(detached), after);
 phase('original and detached revisions');
 const second = await runtime.loadPokieGameRuntime(detached);
 phase('edited acquisition');
 const secondSession = second.game.createSession();
 assert.equal(second.game.getInfo().name, 'function:function:after');
 assert.deepEqual(firstSession.lazy(), ['function', 'function', 'before']);
 for (const session of [firstSession, secondSession]) {
   assert.equal(path.dirname(session.root), temporaryRoot);
   for (const file of session.paths) assert.ok(file.startsWith(session.root + path.sep), file);
 }
 assert.notEqual(firstSession.root, secondSession.root);
 fs.writeFileSync(leaf, "throw new Error('host leaf rejected');");
 const temporaryRoots = fs.readdirSync(temporaryRoot).sort();
 assert.deepEqual(temporaryRoots, [path.basename(firstSession.root), path.basename(secondSession.root)].sort());
 await assert.rejects(runtime.loadPokieGameRuntime(game), /host leaf rejected/);
 phase('rejected acquisition');
 assert.deepEqual(fs.readdirSync(temporaryRoot).sort(), temporaryRoots);
 fs.writeFileSync(leaf, "module.exports = 'before';");
 assert.equal(await runtime.packageExecutableRevision(game), before);
 for (let i = 0; i < 2; i++) {
   const restored = await runtime.loadPokieGame(game);
   assert.equal(restored.getInfo().name, 'function:function:before');
   await runtime.releasePokieGame(restored);
 }
 phase('repeated recovery');
 await first.release(); await first.release(); await second.release();
 for (const session of [firstSession, secondSession]) {
   assert.equal(fs.existsSync(session.root), false);
   assert.ok(Object.keys(require.cache).every(file => !file.startsWith(session.root + path.sep)));
 }
 assert.deepEqual(fs.readdirSync(temporaryRoot), []);
 assert.deepEqual(runtime.hostProbe(), ['function', 'function', 'before']);
 assert.equal(fs.existsSync(path.join(game, 'node_modules')), false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(game, 'package.json'))).dependencies, undefined);
 phase('cleanup');
 console.log(JSON.stringify({closure: true, privatePaths: true, revision: true, overlay: true, recovered: true, cleanup: true, timings}));
})().catch(error => { console.error(error); process.exitCode = 1; });`);
        // Direct Jest and npm launches must exercise the same child. Own its temporary namespace
        // so concurrent suites cannot add/remove entries observed by the rejection cleanup check.
        const childEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !(/^npm_/i).test(name) && name !== "INIT_CWD"));
        const {timings, ...result} = JSON.parse(runNativeProbe([script, game, installation, path.join(leaf, "index.js"), runtimeTemporaryRoot], {
            cwd: host, timeout: 60000,
            env: {...childEnvironment, TMPDIR: runtimeTemporaryRoot, TMP: runtimeTemporaryRoot, TEMP: runtimeTemporaryRoot},
        }));
        expect(result).toEqual({closure: true, privatePaths: true, revision: true, overlay: true, recovered: true, cleanup: true});
        console.log("Native host closure cumulative timings (ms):", timings);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
}, 90000);

describe("readPokiePackageConfig", () => {
    it("reads the pokie.entry field from package.json", () => {
        const config = readPokiePackageConfig(path.join(fixturesRoot, "valid-game"));
        expect(config).toEqual({entry: "./index.js"});
    });

    it("throws a descriptive error when package.json has no pokie.entry field", () => {
        expect(() => readPokiePackageConfig(path.join(fixturesRoot, "missing-entry-game"))).toThrow(/pokie\.entry/);
    });

    it("throws a descriptive error when pokie.entry is a whitespace-only string", () => {
        expect(() => readPokiePackageConfig(path.join(fixturesRoot, "blank-entry-game"))).toThrow(/pokie\.entry/);
    });

    it("throws a descriptive error when package.json does not exist", () => {
        expect(() => readPokiePackageConfig(path.join(fixturesRoot, "does-not-exist"))).toThrow();
    });
});

describe("loadPokieGame", () => {
    let root: string;
    let isolatedFixturesRoot: string;
    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-loader-fixtures-"));
        // These cases exercise entry validation, not host-runtime discovery (covered above).
        // Bind every sibling to stable executable output instead of copying the entire
        // checkout, docs and build products on every successful/invalid acquisition.
        stageCompiledTestRuntime(root, {runtimeFilesOnly: true});
        isolatedFixturesRoot = path.join(root, "fixtures");
        fs.cpSync(fixturesRoot, isolatedFixturesRoot, {recursive: true});
        for (const name of fs.readdirSync(isolatedFixturesRoot)) {
            const file = path.join(isolatedFixturesRoot, name, "package.json");
            const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
            fs.writeFileSync(file, JSON.stringify({...manifest, dependencies: {"@fromstan/pokie": "*"}}));
        }
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);
    afterAll(() => {
        if (root) fs.rmSync(root, {recursive: true, force: true});
    });

    it("loads a valid game package and returns its PokieGame export", async () => {
        const game = await loadPokieGame(path.join(isolatedFixturesRoot, "valid-game"));
        try {
            expect(game.getInfo()).toEqual({id: "valid-game", name: "Valid Game", version: "1.0.0"});
            expect(typeof game.createSession).toBe("function");
        } finally {
            await releasePokieGame(game);
        }
    });

    it("throws when the entry module does not export a valid PokieGame", async () => {
        await expect(loadPokieGame(path.join(isolatedFixturesRoot, "invalid-export-game"))).rejects.toThrow(/does not export a valid/);
    });

    it("throws a descriptive error listing every failing check when the entry module's manifest is invalid", async () => {
        let caughtError: unknown;
        try {
            await loadPokieGame(path.join(isolatedFixturesRoot, "invalid-manifest-game"));
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).toBeInstanceOf(Error);
        const message = (caughtError as Error).message;
        expect(message).toContain("does not export a valid");
        expect(message).toContain("pokie-game-info-invalid-id");
        expect(message).toContain("pokie-game-info-invalid-version");
        expect(message).not.toContain("pokie-game-info-invalid-name");
    });

    it("throws when package.json has no pokie.entry field", async () => {
        await expect(loadPokieGame(path.join(isolatedFixturesRoot, "missing-entry-game"))).rejects.toThrow(/pokie\.entry/);
    });

    it("unwraps a double-nested default (as produced by Node's native ESM loader for a tsc esModuleInterop-compiled entry)", async () => {
        const game = await loadPokieGame(path.join(isolatedFixturesRoot, "nested-default-game"));
        try {
            expect(game.getInfo()).toEqual({id: "nested-default-game", name: "Nested Default Game", version: "1.0.0"});
        } finally {
            await releasePokieGame(game);
        }
    });

    it("gives an actionable recovery step (never a raw \"Cannot find module\") when the entry module's dist output is missing", async () => {
        let caughtError: unknown;
        try {
            await loadPokieGame(path.join(isolatedFixturesRoot, "missing-dist-game"));
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).toBeInstanceOf(Error);
        const message = (caughtError as Error).message;
        expect(message).not.toMatch(/^Cannot find module/);
        expect(message).toContain("hasn't been built yet");
        expect(message).toContain("npm install && npm run build");
        expect(message).toContain(path.join(isolatedFixturesRoot, "missing-dist-game"));
    });

    it("gives an actionable recovery step when the entry module's dist output is stale (requires a module that no longer exists)", async () => {
        let caughtError: unknown;
        try {
            await loadPokieGame(path.join(isolatedFixturesRoot, "stale-dist-game"));
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).toBeInstanceOf(Error);
        const message = (caughtError as Error).message;
        expect(message).not.toMatch(/^Cannot find module/);
        expect(message).toContain("stale or incomplete");
        expect(message).toContain("npm install && npm run build");
    });

    it("rejects a canonical package's dist entry when its source was edited after the last build, instead of loading the stale output", async () => {
        const packageRoot = fs.mkdtempSync(path.join(root, "pokie-stale-source-game-"));
        const started = Date.now();
        const timings: Record<string, number> = {};
        try {
            fs.writeFileSync(
                path.join(packageRoot, "package.json"),
                JSON.stringify({name: "stale-source-game", version: "1.0.0", pokie: {entry: "./dist/index.js"}, dependencies: {"@fromstan/pokie": "*"}}),
            );

            fs.mkdirSync(path.join(packageRoot, "src"));
            const sourcePath = path.join(packageRoot, "src", "index.ts");
            fs.writeFileSync(sourcePath, "export {};\n");

            fs.mkdirSync(path.join(packageRoot, "dist"));
            const distEntryPath = path.join(packageRoot, "dist", "index.js");
            fs.writeFileSync(
                distEntryPath,
                'module.exports = {getInfo() { return {id: "stale-source-game", name: "Stale Source Game", version: "1.0.0"}; }, createSession() { return {root: __dirname}; }};\n',
            );

            const buildTime = new Date(Date.now() - 60_000);
            fs.utimesSync(sourcePath, buildTime, buildTime);
            fs.utimesSync(distEntryPath, buildTime, buildTime);

            expect((await resolvePokieGameDependencyRoots(packageRoot))["@fromstan/pokie"])
                .toBe(path.join(root, "node_modules/@fromstan/pokie"));
            const game = await loadPokieGame(packageRoot);
            timings.acquisition = Date.now() - started;
            let snapshotDirectory: string;
            try {
                expect(game.getInfo()).toEqual({id: "stale-source-game", name: "Stale Source Game", version: "1.0.0"});
                snapshotDirectory = (game.createSession() as unknown as {root: string}).root;
                expect(snapshotDirectory).not.toBe(path.dirname(distEntryPath));
                expect(fs.existsSync(snapshotDirectory)).toBe(true);
            } finally {
                await releasePokieGame(game);
            }
            expect(fs.existsSync(snapshotDirectory)).toBe(false);
            timings.release = Date.now() - started;

            // Simulate editing the source after that build completed, without rebuilding.
            const editTime = new Date();
            fs.writeFileSync(sourcePath, "export const edited = true;\n");
            fs.utimesSync(sourcePath, editTime, editTime);

            let caughtError: unknown;
            try {
                await loadPokieGame(packageRoot);
            } catch (error) {
                caughtError = error;
            }

            expect(caughtError).toBeInstanceOf(Error);
            const message = (caughtError as Error).message;
            expect(message).toContain(distEntryPath);
            expect(message).toContain("stale");
            expect(message).toContain("npm run build");
            expect(message).toContain(packageRoot);
            timings.staleRejection = Date.now() - started;
        } finally {
            fs.rmSync(packageRoot, {recursive: true, force: true});
            timings.cleanup = Date.now() - started;
            console.log("Stale source loader cumulative timings (ms):", timings);
        }
    });

});


it.each(["cjs", "esm"])("isolates direct/transitive %s code, lazy imports and live consumers across dependency edits and rejection", async format => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-dependency-game-"));
    const direct = path.join(root, "node_modules", "direct");
    const nested = path.join(direct, "node_modules", "nested");
    const suffix = format === "cjs" ? "cjs" : "mjs";
    const entry = path.join(root, `index.${suffix}`);
    const dependencyFile = path.join(nested, `index.${suffix}`);
    const hostRequire = createRequire(entry);
    // Exercise native ESM even in ts-jest's CommonJS transform.
    // eslint-disable-next-line no-new-func -- the public loader supports native ESM hosts.
    const nativeImport = new Function("file", "return import(file)") as (file: string) => Promise<Record<string, unknown>>;
    const snapshots: string[] = [];
    const load = () => loadPokieGameRuntime(root, file => {
        snapshots.push(path.dirname(file));
        return nativeImport(pathToFileURL(file).href);
    });
    const manifest = (value: string) => ({id: "dependency-game", name: value, version: "1.0.0"});
    const write = (value: string) => fs.writeFileSync(dependencyFile, format === "cjs" ? `module.exports = '${value}';` : `export default '${value}';`);
    fs.mkdirSync(nested, {recursive: true});
    // Bind the current native runtime explicitly. The host-fallback contract is
    // covered separately above; these repeated acquisitions own dependency edits.
    stageCompiledTestRuntime(root, {runtimeFilesOnly: true});
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({pokie: {entry: `index.${suffix}`}, dependencies: {"@fromstan/pokie": "*", direct: "1"}}));
    for (const [name, location, dependencies] of [["direct", direct, {nested: "1"}], ["nested", nested, {}]] as const) {
        fs.writeFileSync(path.join(location, "package.json"), JSON.stringify({name, main: `index.${suffix}`, dependencies, peerDependencies: name === "nested" ? {direct: "1"} : {}}));
    }
    fs.writeFileSync(path.join(direct, `index.${suffix}`), format === "cjs" ? "module.exports = require('nested');" : "export {default} from 'nested';");
    const game = `{getInfo: () => ({id: 'dependency-game', name: value, version: '1.0.0'}), createSession: () => ({}), lazy: async () => ${format === "cjs" ? "require('direct')" : "(await import('direct')).default"}}`;
    fs.writeFileSync(entry, format === "cjs" ? `const value = require('direct'); module.exports = ${game};` : `import value from 'direct'; export default ${game};`);
    write("old");
    const original = format === "cjs" ? hostRequire(dependencyFile) : (await nativeImport(pathToFileURL(dependencyFile).href)).default;
    const cachedModule = hostRequire.cache[dependencyFile];
    const first = await load();
    try {
        expect(first.game.getInfo()).toEqual(manifest("old"));
        write("current");
        const current = await load();
        try {
            const fresh = JSON.parse(runNativeProbe(["--input-type=module", "-e", `console.log(JSON.stringify((await import(${JSON.stringify(pathToFileURL(entry).href)})).default.getInfo()))`]));
            expect(current.game.getInfo()).toEqual(fresh);
            expect(fresh).toEqual(manifest("current"));
            expect(await (first.game as unknown as {lazy(): Promise<string>}).lazy()).toBe("old");
        } finally {
            await current.release();
        }
        // A failed acquisition cleans its snapshot without disturbing an earlier live consumer.
        write("current");
        fs.writeFileSync(dependencyFile, `${format === "esm" ? "export default 0;" : ""} throw Error('dependency rejected');`);
        await expect(load()).rejects.toThrow("dependency rejected");
        write("repaired");
        for (let attempt = 0; attempt < 2; attempt++) {
            const repaired = await load();
            expect(repaired.game.getInfo()).toEqual(manifest("repaired"));
            await repaired.release();
        }
        expect(format === "cjs" ? hostRequire(dependencyFile) : (await nativeImport(pathToFileURL(dependencyFile).href)).default).toBe(original);
        if (format === "cjs") expect(hostRequire.cache[dependencyFile]).toBe(cachedModule);
        // Jest's virtual require.cache ignores deleteProperty. Check actual Node cache ownership
        // in a native host, using the same public loader and current source implementation.
        const probe = path.join(root, "cache-probe.cjs");
        fs.writeFileSync(probe, `const fs = require('fs'), Module = require('module'), assert = require('node:assert/strict');
const ts = require(${JSON.stringify(require.resolve("typescript"))}), original = Module._resolveFilename;
Module._resolveFilename = function(request, ...rest) { try { return original.call(this, request, ...rest); } catch (error) { if (request.endsWith('.js')) return original.call(this, request.slice(0, -3) + '.ts', ...rest); throw error; } };
Module._extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText, file);
(async () => {
 const {loadPokieGameRuntime} = require(${JSON.stringify(path.resolve("src/gamepackage/loadPokieGame.ts"))});
 const outside = require(${JSON.stringify(dependencyFile)}), cached = require.cache[${JSON.stringify(dependencyFile)}];
 let entry;
 const runtime = await loadPokieGameRuntime(${JSON.stringify(root)}, file => { entry = file; return import(require('url').pathToFileURL(file).href); });
 const owned = Object.keys(require.cache).filter(file => file.startsWith(require('path').dirname(entry) + require('path').sep));
 ${format === "cjs" ? "assert.ok(owned.length > 0);" : ""}
 await runtime.release();
 assert.ok(owned.every(file => require.cache[file] === undefined));
 assert.equal(require(${JSON.stringify(dependencyFile)}), outside); assert.equal(require.cache[${JSON.stringify(dependencyFile)}], cached);
 console.log(JSON.stringify({removed: true, preserved: true}));
})().catch(error => { console.error(error); process.exitCode = 1; });`);
        expect(JSON.parse(runNativeProbe([probe]))).toEqual({removed: true, preserved: true});
    } finally {
        await first.release();
        expect(snapshots.every(snapshot => !fs.existsSync(snapshot))).toBe(true);
        fs.rmSync(root, {recursive: true, force: true});
    }
}, PACKAGE_EXTRACTION_TEST_TIMEOUT);
