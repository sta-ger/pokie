import {loadPokieGame, loadPokieGameRuntime, readPokiePackageConfig, releasePokieGame} from "@fromstan/pokie";
import fs from "fs";
import {createRequire} from "module";
import {execFileSync} from "child_process";
import {pathToFileURL} from "url";
import os from "os";
import path from "path";

const fixturesRoot = path.join(__dirname, "fixtures");

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
    it("loads a valid game package and returns its PokieGame export", async () => {
        const game = await loadPokieGame(path.join(fixturesRoot, "valid-game"));
        try {
            expect(game.getManifest()).toEqual({id: "valid-game", name: "Valid Game", version: "1.0.0"});
            expect(typeof game.createSession).toBe("function");
        } finally {
            await releasePokieGame(game);
        }
    });

    it("throws when the entry module does not export a valid PokieGame", async () => {
        await expect(loadPokieGame(path.join(fixturesRoot, "invalid-export-game"))).rejects.toThrow(/does not export a valid/);
    });

    it("throws a descriptive error listing every failing check when the entry module's manifest is invalid", async () => {
        let caughtError: unknown;
        try {
            await loadPokieGame(path.join(fixturesRoot, "invalid-manifest-game"));
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).toBeInstanceOf(Error);
        const message = (caughtError as Error).message;
        expect(message).toContain("does not export a valid");
        expect(message).toContain("pokie-game-manifest-invalid-id");
        expect(message).toContain("pokie-game-manifest-invalid-version");
        expect(message).not.toContain("pokie-game-manifest-invalid-name");
    });

    it("throws when package.json has no pokie.entry field", async () => {
        await expect(loadPokieGame(path.join(fixturesRoot, "missing-entry-game"))).rejects.toThrow(/pokie\.entry/);
    });

    it("unwraps a double-nested default (as produced by Node's native ESM loader for a tsc esModuleInterop-compiled entry)", async () => {
        const game = await loadPokieGame(path.join(fixturesRoot, "nested-default-game"));
        try {
            expect(game.getManifest()).toEqual({id: "nested-default-game", name: "Nested Default Game", version: "1.0.0"});
        } finally {
            await releasePokieGame(game);
        }
    });

    it("gives an actionable recovery step (never a raw \"Cannot find module\") when the entry module's dist output is missing", async () => {
        let caughtError: unknown;
        try {
            await loadPokieGame(path.join(fixturesRoot, "missing-dist-game"));
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).toBeInstanceOf(Error);
        const message = (caughtError as Error).message;
        expect(message).not.toMatch(/^Cannot find module/);
        expect(message).toContain("hasn't been built yet");
        expect(message).toContain("npm install && npm run build");
        expect(message).toContain(path.join(fixturesRoot, "missing-dist-game"));
    });

    it("gives an actionable recovery step when the entry module's dist output is stale (requires a module that no longer exists)", async () => {
        let caughtError: unknown;
        try {
            await loadPokieGame(path.join(fixturesRoot, "stale-dist-game"));
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
        const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stale-source-game-"));
        try {
            fs.writeFileSync(
                path.join(packageRoot, "package.json"),
                JSON.stringify({name: "stale-source-game", version: "1.0.0", pokie: {entry: "./dist/index.js"}}),
            );

            fs.mkdirSync(path.join(packageRoot, "src"));
            const sourcePath = path.join(packageRoot, "src", "index.ts");
            fs.writeFileSync(sourcePath, "export {};\n");

            fs.mkdirSync(path.join(packageRoot, "dist"));
            const distEntryPath = path.join(packageRoot, "dist", "index.js");
            fs.writeFileSync(
                distEntryPath,
                'module.exports = {getManifest() { return {id: "stale-source-game", name: "Stale Source Game", version: "1.0.0"}; }, createSession() { return {}; }};\n',
            );

            const buildTime = new Date(Date.now() - 60_000);
            fs.utimesSync(sourcePath, buildTime, buildTime);
            fs.utimesSync(distEntryPath, buildTime, buildTime);

            const game = await loadPokieGame(packageRoot);
            try {
                expect(game.getManifest()).toEqual({id: "stale-source-game", name: "Stale Source Game", version: "1.0.0"});
            } finally {
                await releasePokieGame(game);
            }

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
        } finally {
            fs.rmSync(packageRoot, {recursive: true, force: true});
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
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({pokie: {entry: `index.${suffix}`}, dependencies: {direct: "1"}}));
    for (const [name, location, dependencies] of [["direct", direct, {nested: "1"}], ["nested", nested, {}]] as const) {
        fs.writeFileSync(path.join(location, "package.json"), JSON.stringify({name, main: `index.${suffix}`, dependencies, peerDependencies: name === "nested" ? {direct: "1"} : {}}));
    }
    fs.writeFileSync(path.join(direct, `index.${suffix}`), format === "cjs" ? "module.exports = require('nested');" : "export {default} from 'nested';");
    const game = `{getManifest: () => ({id: 'dependency-game', name: value, version: '1.0.0'}), createSession: () => ({}), lazy: async () => ${format === "cjs" ? "require('direct')" : "(await import('direct')).default"}}`;
    fs.writeFileSync(entry, format === "cjs" ? `const value = require('direct'); module.exports = ${game};` : `import value from 'direct'; export default ${game};`);
    write("old");
    const original = format === "cjs" ? hostRequire(dependencyFile) : (await nativeImport(pathToFileURL(dependencyFile).href)).default;
    const cachedModule = hostRequire.cache[dependencyFile];
    const first = await load();
    try {
        expect(first.game.getManifest()).toEqual(manifest("old"));
        write("current");
        const current = await load();
        try {
            const fresh = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `console.log(JSON.stringify((await import(${JSON.stringify(pathToFileURL(entry).href)})).default.getManifest()))`], {encoding: "utf8"}));
            expect(current.game.getManifest()).toEqual(fresh);
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
            expect(repaired.game.getManifest()).toEqual(manifest("repaired"));
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
        expect(JSON.parse(execFileSync(process.execPath, [probe], {encoding: "utf8", timeout: 30000}))).toEqual({removed: true, preserved: true});
    } finally {
        await first.release();
        expect(snapshots.every(snapshot => !fs.existsSync(snapshot))).toBe(true);
        fs.rmSync(root, {recursive: true, force: true});
    }
}, 60000);
