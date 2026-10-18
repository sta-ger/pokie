import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import ts from "typescript";
import {linkFixtureRuntime} from "../cli/fixtures/ensureFixturesCanRequirePokie.js";
import {buildPackageJsonPatch} from "../../src/gamepackage/buildPackageJsonPatch.js";
import {GamePackageCreator} from "../../cli/scaffold/GamePackageCreator.js";
import {GamePackageGenerator} from "../../src/generated/GamePackageGenerator.js";
import {renderBuiltGameModule} from "../../src/generated/renderBuiltGameModule.js";
import {renderEntryModule} from "../../cli/scaffold/renderEntryModule.js";
import {inspectRuntimeGraph, runtimeEdges} from "./helpers/runtimeGraph.js";

const root = path.resolve(__dirname, "../..");
const identity = "@fromstan/pokie";
const metadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tempRoot = path.join(root, "node_modules/.cache/pokie-tmp");

// Includes prose package guidance and commands split over whitespace/newlines.
const staleDeliveryIdentity = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*(?:\(\s*)?)[`"']+pokie(?:[`"']|\/)|\bnpx\s+(?:--?[\w-]+(?:=[^\s`]+)?\s+)*pokie\b|\bnpm\s+(?:install|i)\s+(?:--?[\w-]+(?:=[^\s`]+)?\s+)*pokie\b|github\.com\/sta-ger\/pokie(?![-\w])|npmjs\.com\/package\/pokie\b|node_modules\/pokie\b/;

function fixtureDirectory(): string {
    fs.mkdirSync(tempRoot, {recursive: true});
    return fs.mkdtempSync(path.join(tempRoot, "v2c01-identity-"));
}

function files(directory: string): string[] {
    return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? files(file) : [file];
    });
}

// Local, private compiler fixtures exercise Node's resolver, never Jest's name mappings.
// They do not pack, install, build production dist, or contact a registry.
function nativeRuntimeFixture(directory: string): void {
    const packageRoot = path.join(directory, "node_modules/@fromstan/pokie");
    fs.mkdirSync(packageRoot, {recursive: true});
    fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({...metadata, private: true, scripts: {}}));
    for (const [sourceRoot, destination, module] of [
        ["src", "dist/esm", ts.ModuleKind.ESNext],
        ["src", "dist/cjs", ts.ModuleKind.CommonJS],
        ["cli/client", "dist/cli/client", ts.ModuleKind.ESNext],
    ] as const) {
        for (const file of files(path.join(root, sourceRoot))) {
            if (!(/\.(?:ts|mjs)$/).test(file)) continue;
            const target = path.join(packageRoot, destination, path.relative(path.join(root, sourceRoot), file));
            fs.mkdirSync(path.dirname(target), {recursive: true});
            const source = fs.readFileSync(file, "utf8");
            if (file.endsWith("runtimeLocation.mjs")) continue;
            if (file.endsWith(".mjs")) fs.writeFileSync(target, source);
            else {
                fs.writeFileSync(target.replace(/\.ts$/, ".js"), ts.transpileModule(source, {fileName: file, compilerOptions: {module, target: ts.ScriptTarget.ES2020, esModuleInterop: true}}).outputText);
                fs.writeFileSync(target.replace(/\.ts$/, ".d.ts"), ts.transpileDeclaration(source, {fileName: file, compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText);
            }
        }
    }
    execFileSync(process.execPath, [path.join(root, "tests/testUtils/stageRuntimeLocation.mjs"), "--output-root", packageRoot, "esm", "cjs"], {cwd: root});
    // Execute the maintained metadata writer in the fixture, not a production build.
    execFileSync(process.execPath, [path.join(root, "write-cjs-package-json.js")], {cwd: packageRoot});
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({name: "v2c01-private-consumer", private: true, type: "module", dependencies: {[identity]: `^${metadata.version}`}}));
}

describe("V2C-01 delivery identity", () => {
    it("binds metadata, lockfile, binary, pack declarations and explicit ESM-only subpaths", () => {
        const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
        expect(metadata.name).toBe(identity);
        expect(lock.name).toBe(identity);
        expect(lock.packages[""].name).toBe(identity);
        expect(metadata.repository.url).toBe("git+https://github.com/fromstan/pokie.git");
        expect(metadata.homepage).toBe("https://pokie.fromstan.com");
        expect(metadata.bin).toEqual({pokie: "./dist/cli/pokie.js"});
        expect(Object.keys(metadata.exports).sort()).toEqual([".", "./browser", "./client/player", "./wasm"]);
        for (const subpath of ["./browser", "./wasm", "./client/player"]) {
            expect(Object.keys(metadata.exports[subpath])).toEqual(["import"]);
            expect(metadata.exports[subpath].import.types).toMatch(/\.d\.ts$/);
        }
        expect(metadata.files).toEqual(expect.arrayContaining(["dist/", "src/", "LICENSE", "docs/v2-completion/V2C-01.md"]));
        expect(metadata.files).not.toContain("docs/*.md");
        for (const name of metadata.files.filter((name: string) => name.startsWith("docs/"))) expect(name).not.toMatch(/phase|\/evidence\/|inventory|report/);
    });

    it("executes code-first and generated consumers through native ESM/CJS exports and resolves declarations", () => {
        const directory = fixtureDirectory();
        try {
            nativeRuntimeFixture(directory);
            const runtimeRoot = path.join(directory, "node_modules", identity);
            const fixtureModules = path.join(directory, "fixtures/node_modules");
            linkFixtureRuntime(runtimeRoot, fixtureModules);
            expect(fs.realpathSync(path.join(fixtureModules, identity))).toBe(runtimeRoot);
            expect(fs.existsSync(path.join(fixtureModules, "pokie"))).toBe(false);
            // Replace a stale scoped link through the same atomic repair used by real worker fixtures.
            fs.unlinkSync(path.join(fixtureModules, identity));
            fs.symlinkSync(path.join(directory, "missing-runtime"), path.join(fixtureModules, identity), "dir");
            linkFixtureRuntime(runtimeRoot, fixtureModules);
            fs.writeFileSync(path.join(directory, "fixtures/consumer.cjs"), "const runtime = require('@fromstan/pokie'); console.log(typeof runtime.loadPokieGameRuntime);");
            expect(execFileSync(process.execPath, [path.join(directory, "fixtures/consumer.cjs")], {encoding: "utf8"})).toBe("function\n");
            const manifest = {id: "private-slot", name: "Private slot", version: "0.1.0"};
            const scaffold = new GamePackageCreator(metadata.version).create(directory, "private-slot");
            expect(JSON.parse(fs.readFileSync(path.join(scaffold.projectRoot, "package.json"), "utf8")).dependencies).toEqual({[identity]: `^${metadata.version}`});
            const blueprint = {manifest, reels: 2, rows: 1, symbols: ["A"], reelStrips: [["A"], ["A"]], paylines: [[0, 0]], paytable: {A: {2: 1}}};
            expect(renderBuiltGameModule(blueprint, metadata.version)).toContain(`require("${identity}")`);
            expect(renderEntryModule(manifest)).toContain(`from "${identity}"`);
            const generated = new GamePackageGenerator(metadata.version).generate(blueprint, directory, path.join(directory, "generated"));
            expect(JSON.parse(fs.readFileSync(path.join(generated.projectRoot, "package.json"), "utf8")).dependencies).toEqual({[identity]: `^${metadata.version}`});
            for (const projectRoot of [scaffold.projectRoot, generated.projectRoot]) {
                const file = path.join(projectRoot, "package.json");
                fs.writeFileSync(file, JSON.stringify({...JSON.parse(fs.readFileSync(file, "utf8")), private: true}));
            }
            // Compile the real scaffold's sources in place, using its prescribed CJS consumer format.
            for (const file of files(path.join(scaffold.projectRoot, "src"))) {
                const target = path.join(scaffold.projectRoot, "dist", path.relative(path.join(scaffold.projectRoot, "src"), file)).replace(/\.ts$/, ".js");
                fs.mkdirSync(path.dirname(target), {recursive: true});
                fs.writeFileSync(target, ts.transpileModule(fs.readFileSync(file, "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true}}).outputText);
            }
            const consumer = `
                import assert from 'node:assert/strict';
                import {createRequire} from 'node:module';
                import {SeededRandomNumberGenerator as ESM, loadPokieGame, releasePokieGame, loadPokieGameRuntime} from '${identity}';
                import {SeededRandomNumberGenerator as Browser} from '${identity}/browser';
                import {instantiatePokieWasm} from '${identity}/wasm';
                import * as player from '${identity}/client/player';
                const require = createRequire(import.meta.url);
                const {SeededRandomNumberGenerator: CJS} = require('${identity}');
                const nested = createRequire(new URL('./node_modules/@fromstan/pokie/dist/cjs/self.cjs', import.meta.url));
                assert.equal(nested('${identity}').SeededRandomNumberGenerator, CJS);
                assert.equal(new ESM('native').getRandomInt(0, 100), new CJS('native').getRandomInt(0, 100));
                assert.equal(new Browser('native').getRandomInt(0, 100), new ESM('native').getRandomInt(0, 100));
                assert.equal(typeof instantiatePokieWasm, 'function'); assert.ok(Object.keys(player).length);
                for (const suffix of ['browser', 'wasm', 'client/player']) assert.throws(() => require('${identity}/' + suffix), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
                assert.throws(() => require('pokie'), {code:'MODULE_NOT_FOUND'});
                for (const file of ['./private-slot/dist/index.js', './generated/dist/index.js']) {
                    const exports = require(file); const game = exports.default ?? exports;
                    assert.equal(game.getManifest().id, 'private-slot'); assert.ok(game.createSession({seed:'native'}));
                }
                const loaded = await loadPokieGameRuntime('./generated');
                try { assert.equal(loaded.game.getManifest().id, 'private-slot'); assert.ok(loaded.game.createSession({seed:'generated-native'})); }
                finally { await loaded.release(); }
                const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
                const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'v2c01-external-'));
                try {
                    fs.writeFileSync(path.join(isolated, 'package.json'), JSON.stringify({private:true, pokie:{entry:'./game.cjs'}}));
                    fs.writeFileSync(path.join(isolated, 'game.cjs'), "const runtime = require('@fromstan/pokie'); module.exports = {getManifest(){return {id:'external',name:'External',version:'1'};}, createSession(){return new runtime.SeededRandomNumberGenerator('external');}};");
                    process.chdir(os.tmpdir());
                    for (const [load, release] of [[loadPokieGame, releasePokieGame], [require('${identity}').loadPokieGame, require('${identity}').releasePokieGame]]) {
                        const game = await load(isolated); assert.equal(game.createSession().getRandomInt(0,100), new ESM('external').getRandomInt(0,100));
                        await release(game);
                    }
                } finally {fs.rmSync(isolated, {recursive:true,force:true});}
                console.log('native public exports and generated/code-first execution PASS');
            `;
            fs.writeFileSync(path.join(directory, "consumer.mjs"), consumer);
            expect(execFileSync(process.execPath, [path.join(directory, "consumer.mjs")], {cwd: directory, encoding: "utf8", timeout: 30000})).toContain("execution PASS");
            for (const module of [identity, `${identity}/browser`, `${identity}/wasm`, `${identity}/client/player`]) {
                const result = ts.resolveModuleName(module, path.join(directory, "consumer.mts"), {module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext}, ts.sys, undefined, undefined, ts.ModuleKind.ESNext);
                expect(result.resolvedModule?.resolvedFileName).toMatch(/\.d\.ts$/);
            }
            const cjs = ts.resolveModuleName(identity, path.join(directory, "consumer.cts"), {module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext}, ts.sys, undefined, undefined, ts.ModuleKind.CommonJS);
            expect(cjs.resolvedModule?.resolvedFileName).toContain("dist/cjs/index.d.ts");
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("preserves authored dependency versions and unrelated package fields", () => {
        expect(buildPackageJsonPatch({private: true, dependencies: {[identity]: "^1.2.1", other: "1"}}, metadata.version)).toMatchObject({private: true, dependencies: {[identity]: "^1.2.1", other: "1"}});
    });

    it("checks complete portable graphs and runtime dependency direction", () => {
        for (const entry of ["src/browser.ts", "src/wasm/browser.ts", "src/wasm/worker.ts", "cli/client/player/index.ts"]) {
            expect(inspectRuntimeGraph([path.join(root, entry)], {portable: true, packageRoot: root}).length).toBeGreaterThan(1);
        }
        expect(inspectRuntimeGraph([path.join(root, "src/index.ts"), path.join(root, "cli/pokie.ts")], {packageRoot: root}).length).toBeGreaterThan(100);
    });

    it.each([
        'import "node:crypto";', 'export * from "fs/promises";', 'const fs = require("fs");',
        'void import("node:worker_threads");', 'import fs = require("node:fs");',
        'void import(`node:net`);', 'require.resolve("fs/promises");', 'export * from "@fromstan/pokie";',
    ])("rejects portable runtime edge %s with an offending dependency path", source => {
        const directory = fixtureDirectory();
        try {
            const file = path.join(directory, "entry.ts");
            fs.writeFileSync(file, source);
            expect(() => inspectRuntimeGraph([file], {portable: true})).toThrow(/entry\.ts ->/);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true}); 
        }
    });

    it("distinguishes erased type edges, transitive Node adapters and runtime cycles", () => {
        const directory = fixtureDirectory();
        try {
            const a = path.join(directory, "a.ts"), 
                b = path.join(directory, "b.ts");
            fs.writeFileSync(a, 'import type {B} from "./b.js"; export type A = B;');
            fs.writeFileSync(b, 'import type {A} from "./a.js"; export type B = A;');
            expect(inspectRuntimeGraph([a], {portable: true})).toEqual([a]);
            fs.writeFileSync(a, 'export * from "./b.js";');
            fs.writeFileSync(b, 'export * from "./a.js";');
            expect(() => inspectRuntimeGraph([a])).toThrow(/a\.ts -> .*b\.ts -> .*a\.ts/);
            fs.writeFileSync(b, 'void import("node:http");');
            expect(() => inspectRuntimeGraph([a], {portable: true})).toThrow(/a\.ts -> .*b\.ts -> node:http/);
            fs.mkdirSync(path.join(directory, "node"));
            fs.writeFileSync(path.join(directory, "node/adapter.ts"), 'export const adapter = 1;');
            fs.writeFileSync(b, 'export * from "./node/adapter.js";');
            expect(() => inspectRuntimeGraph([a], {portable: true})).toThrow(/Node adapter/);
            expect(() => runtimeEdges('void import(moduleName);', a)).toThrow(/Unverifiable/);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true}); 
        }
    });

    it("rejects reversed runtime/CLI/presentation dependencies and accepts adapter composition", () => {
        const directory = fixtureDirectory();
        try {
            const runtime = path.join(directory, "src/runtime.ts"), 
                cli = path.join(directory, "cli/command.ts"), 
                presentation = path.join(directory, "cli/studio-client/view.ts");
            fs.mkdirSync(path.dirname(runtime), {recursive: true});
            fs.mkdirSync(path.dirname(presentation), {recursive: true});
            fs.writeFileSync(runtime, "export const runtime = 1;");
            fs.writeFileSync(cli, 'export * from "../src/runtime.js";');
            expect(inspectRuntimeGraph([cli], {packageRoot: directory})).toEqual([cli, runtime].sort());
            fs.writeFileSync(runtime, 'export * from "../cli/command.js";');
            expect(() => inspectRuntimeGraph([runtime], {packageRoot: directory})).toThrow(/Runtime depends on CLI: .*runtime.ts ->/);
            fs.writeFileSync(runtime, "export const runtime = 1;");
            fs.writeFileSync(cli, 'export * from "./studio-client/view.js";');
            fs.writeFileSync(presentation, "export const view = 1;");
            expect(() => inspectRuntimeGraph([cli], {packageRoot: directory})).toThrow(/Runtime depends on Studio presentation: .*command.ts ->/);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true}); 
        }
    });

    it("keeps every publication entry inert, including transitive npm lifecycle hooks", () => {
        const visited = new Set<string>();
        const inspect = (name: string): void => {
            if (visited.has(name)) return;
            visited.add(name);
            for (const hook of [`pre${name}`, name, `post${name}`]) {
                const command = metadata.scripts[hook] ?? "";
                expect(command).not.toMatch(/npm\s+publish|npm\s+exec|npx|authorized-release-runner/);
                for (const match of command.matchAll(/npm run ([\w:-]+)/g)) inspect(match[1]);
            }
        };
        ["build", "prepack", "test", "postinstall", "release:pc20", "release:p8-05"].forEach(inspect);
        expect(metadata.publishConfig.registry).toBe("https://publication-disabled.invalid");
        const runner = fs.readFileSync(path.join(root, "scripts/pc-20-authorized-release-runner.mjs"), "utf8");
        expect(runner).toContain("throw new Error(\"Public publication is disabled");
        expect(runner).not.toMatch(/execFile|fetch\(|writeFile|services\.run/);
        const completion = fs.readFileSync(path.join(root, "scripts/p8-05-release-completion.mjs"), "utf8");
        expect(completion).not.toContain("runAuthorizedLifecycle");
        expect(completion).toContain("public publication is disabled");
        expect(fs.readFileSync(path.join(root, ".github/workflows/publish.yml"), "utf8")).not.toMatch(/workflow_dispatch|npm publish|secrets\./);
    });

    it.each([
        'npx\n  pokie dev ./game', 'npx --yes\n pokie dev ./game', 'npm install\n  -g pokie', 'npm i --global\n pokie', 'npm install --save-dev pokie',
        'exports from `"pokie"`', 'GameBlueprint imported from `pokie`',
        'import {Game} from "pokie";', "const p = require('pokie/browser');", "void import('pokie/wasm');",
    ])("detects stale maintained guidance: %s", text => {
        expect(staleDeliveryIdentity.test(text)).toBe(true);
    });

    it.each([
        'npx --package @fromstan/pokie pokie dev ./game', 'from "@fromstan/pokie"',
        'pokie.entry .pokie pokie-manifest.json pokie.state.v2', 'https://github.com/sta-ger/pokie-examples',
    ])("preserves product contracts and explicit scoped launch guidance: %s", text => {
        expect(staleDeliveryIdentity.test(text)).toBe(false);
    });

    it("classifies maintained delivery text separately from immutable history and product contracts", () => {
        const maintained = [path.join(root, "README.md"), ...metadata.files.filter((name: string) => name.startsWith("docs/")).map((name: string) => path.join(root, name)), ...["src", "cli", "examples", "site/content", "site/examples"].flatMap(name => files(path.join(root, name)))];

        expect(maintained.filter(file => (/\.(?:ts|tsx|js|mjs|md|html|json)$/).test(file) && staleDeliveryIdentity.test(fs.readFileSync(file, "utf8")))).toEqual([]);
        expect(fs.readFileSync(path.join(root, "docs/pokie-phase4-inventory.md"), "utf8")).toContain("sta-ger/pokie-examples");
        expect(fs.readFileSync(path.join(root, "src/wasm/PokieWasmCanonicalModule.ts"), "utf8")).toContain('POKIE_WASM_IMPORT_MODULE = "pokie"');
        expect(buildPackageJsonPatch({}, metadata.version).pokie).toEqual({entry: "./dist/index.js"});
    });
});
