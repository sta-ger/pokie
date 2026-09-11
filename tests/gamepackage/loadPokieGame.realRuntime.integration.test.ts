import {execFileSync} from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {ensureCompiledTestOutput} from "../testUtils/ensureCompiledTestOutput.js";
import {REPO_ROOT} from "../testUtils/offlinePokieDependencyOverride.js";

const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");

describe("loadPokieGame (real long-lived CJS runtime)", () => {
    beforeAll(() => {
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [COMPILED_CJS_ENTRY],
            lockName: "runtime-loader-reload",
            command: ["npm", "run", "build-cjs:compile"],
            forceRebuild: true,
        });
    });

    it("executes rebuilt entry code when the same package path is reopened", () => {
        const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-real-runtime-reload-"));
        const entryPath = path.join(packageRoot, "index.js");
        const scriptPath = path.join(packageRoot, "reload.cjs");
        const gameSource = (name: string): string =>
            `module.exports = {getManifest() { return {id: "reload-game", name: ${JSON.stringify(name)}, version: "1.0.0"}; }, createSession() { return {}; }};\n`;
        try {
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "reload-game", version: "1.0.0", pokie: {entry: "./index.js"}}));
            fs.writeFileSync(entryPath, gameSource("Before rebuild"));
            fs.writeFileSync(
                scriptPath,
                `const fs = require("fs");\n` +
                    `const {loadPokieGame} = require(process.argv[2]);\n` +
                    `(async () => { const root = process.argv[3]; const before = await loadPokieGame(root); fs.writeFileSync(root + "/index.js", ${JSON.stringify(gameSource("After rebuild"))}); const after = await loadPokieGame(root); process.stdout.write(JSON.stringify([before.getManifest().name, after.getManifest().name])); })().catch((error) => { console.error(error); process.exitCode = 1; });\n`,
            );

            const output = execFileSync(process.execPath, [scriptPath, COMPILED_CJS_ENTRY, packageRoot], {encoding: "utf-8"});
            expect(JSON.parse(output)).toEqual(["Before rebuild", "After rebuild"]);
        } finally {
            fs.rmSync(packageRoot, {recursive: true, force: true});
        }
    });

    it("executes a rebuilt CommonJS dependency when the same entry path is reopened", () => {
        const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-real-runtime-dependency-reload-"));
        const scriptPath = path.join(packageRoot, "reload.cjs");
        try {
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "reload-dependency", version: "1.0.0", pokie: {entry: "./game.js"}}));
            fs.writeFileSync(path.join(packageRoot, "game.js"), "const model = require('./model.js'); module.exports = {getManifest() { return {id: 'reload-dependency', name: model.name, version: '1.0.0'}; }, createSession() { return {}; }};\n");
            fs.writeFileSync(path.join(packageRoot, "model.js"), "module.exports = {name: 'Before dependency rebuild'};\n");
            fs.writeFileSync(
                scriptPath,
                `const fs = require("fs");\n` +
                    `const {loadPokieGame} = require(process.argv[2]);\n` +
                    `(async () => { const root = process.argv[3]; const before = await loadPokieGame(root); fs.writeFileSync(root + "/model.js", "module.exports = {name: 'After dependency rebuild'};\\n"); const after = await loadPokieGame(root); process.stdout.write(JSON.stringify([before.getManifest().name, after.getManifest().name])); })().catch((error) => { console.error(error); process.exitCode = 1; });\n`,
            );
            const output = execFileSync(process.execPath, [scriptPath, COMPILED_CJS_ENTRY, packageRoot], {encoding: "utf-8"});
            expect(JSON.parse(output)).toEqual(["Before dependency rebuild", "After dependency rebuild"]);
        } finally {
            fs.rmSync(packageRoot, {recursive: true, force: true});
        }
    });

    it("preserves ancestor dependencies when a package also has its own node_modules", () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-runtime-ancestor-dependencies-"));
        const packageRoot = path.join(workspaceRoot, "game");
        const scriptPath = path.join(workspaceRoot, "load.cjs");
        try {
            fs.mkdirSync(path.join(packageRoot, "node_modules", "local-dependency"), {recursive: true});
            fs.mkdirSync(path.join(workspaceRoot, "node_modules", "ancestor-dependency"), {recursive: true});
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "ancestor-dependencies", version: "1.0.0", dependencies: {"local-dependency": "1.0.0", "ancestor-dependency": "1.0.0"}, pokie: {entry: "./game.js"}}));
            fs.writeFileSync(path.join(packageRoot, "node_modules", "local-dependency", "index.js"), "module.exports = 'local';\n");
            fs.writeFileSync(path.join(workspaceRoot, "node_modules", "ancestor-dependency", "index.js"), "module.exports = 'ancestor';\n");
            fs.writeFileSync(path.join(packageRoot, "game.js"), "const local = require('local-dependency'); const ancestor = require('ancestor-dependency'); module.exports = {getManifest() { return {id: 'ancestor-dependencies', name: local + '-' + ancestor, version: '1.0.0'}; }, createSession() { return {}; }};\n");
            fs.writeFileSync(scriptPath, `const {loadPokieGame} = require(process.argv[2]); (async () => { const game = await loadPokieGame(process.argv[3]); process.stdout.write(game.getManifest().name); })().catch((error) => { console.error(error); process.exitCode = 1; });\n`);
            const output = execFileSync(process.execPath, [scriptPath, COMPILED_CJS_ENTRY, packageRoot], {encoding: "utf-8"});
            expect(output).toBe("local-ancestor");
        } finally {
            fs.rmSync(workspaceRoot, {recursive: true, force: true});
        }
    });

    it("binds an ancestor-less package to the embedding runtime installed at the process working directory", () => {
        const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-runtime-host-fallback-"));
        const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-runtime-host-fallback-game-"));
        const scriptPath = path.join(hostRoot, "load.cjs");
        try {
            fs.mkdirSync(path.join(hostRoot, "node_modules"), {recursive: true});
            fs.symlinkSync(COMPILED_CJS_ENTRY.slice(0, -"index.js".length), path.join(hostRoot, "node_modules", "pokie"), process.platform === "win32" ? "junction" : "dir");
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "host-fallback-game", version: "1.0.0", pokie: {entry: "./game.js"}}));
            fs.writeFileSync(
                path.join(packageRoot, "game.js"),
                "const runtime = require('pokie'); module.exports = {getManifest() { return {id: 'host-fallback-game', name: typeof runtime.loadPokieGame, version: '1.0.0'}; }, createSession() { return {}; }};\n",
            );
            fs.writeFileSync(
                scriptPath,
                "const {loadPokieGame, releasePokieGame} = require(process.argv[2]); (async () => { const game = await loadPokieGame(process.argv[3]); process.stdout.write(game.getManifest().name); await releasePokieGame(game); })().catch((error) => { console.error(error); process.exitCode = 1; });\n",
            );

            const output = execFileSync(process.execPath, [scriptPath, COMPILED_CJS_ENTRY, packageRoot], {cwd: hostRoot, encoding: "utf-8"});
            expect(output).toBe("function");
        } finally {
            fs.rmSync(hostRoot, {recursive: true, force: true});
            fs.rmSync(packageRoot, {recursive: true, force: true});
        }
    });

    it("executes a rebuilt ESM dependency when the same entry path is reopened", () => {
        const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-real-runtime-esm-dependency-reload-"));
        const scriptPath = path.join(packageRoot, "reload.cjs");
        try {
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "reload-esm-dependency", version: "1.0.0", type: "module", pokie: {entry: "./game.mjs"}}));
            fs.writeFileSync(path.join(packageRoot, "game.mjs"), "import {name} from './model.mjs'; export default {getManifest() { return {id: 'reload-esm-dependency', name, version: '1.0.0'}; }, createSession() { return {}; }};\n");
            fs.writeFileSync(path.join(packageRoot, "model.mjs"), "export const name = 'Before ESM dependency rebuild';\n");
            fs.writeFileSync(
                scriptPath,
                `const fs = require("fs");\n` +
                    `const {loadPokieGame} = require(process.argv[2]);\n` +
                    `(async () => { const root = process.argv[3]; const before = await loadPokieGame(root); fs.writeFileSync(root + "/model.mjs", "export const name = 'After ESM dependency rebuild';\\n"); const after = await loadPokieGame(root); process.stdout.write(JSON.stringify([before.getManifest().name, after.getManifest().name])); })().catch((error) => { console.error(error); process.exitCode = 1; });\n`,
            );
            const output = execFileSync(process.execPath, [scriptPath, COMPILED_CJS_ENTRY, packageRoot], {encoding: "utf-8"});
            expect(JSON.parse(output)).toEqual(["Before ESM dependency rebuild", "After ESM dependency rebuild"]);
        } finally {
            fs.rmSync(packageRoot, {recursive: true, force: true});
        }
    });

    it("keeps lazy CJS assets alive until release, then removes both snapshot files and require cache entries", () => {
        const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-runtime-lease-cjs-"));
        const scriptPath = path.join(packageRoot, "lease.cjs");
        try {
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "lease-cjs", version: "1.0.0", pokie: {entry: "./game.js"}}));
            fs.writeFileSync(path.join(packageRoot, "model.json"), JSON.stringify({name: "lazy model"}));
            fs.writeFileSync(
                path.join(packageRoot, "game.js"),
                "const fs = require('fs'); const path = require('path'); module.exports = { getManifest() { return {id: 'lease-cjs', name: 'Lease CJS', version: '1.0.0'}; }, createSession() { return { model: JSON.parse(fs.readFileSync(path.join(__dirname, 'model.json'), 'utf8')).name }; } };\n",
            );
            fs.writeFileSync(
                scriptPath,
                `const fs = require('fs'); const path = require('path'); const {loadPokieGameRuntime} = require(process.argv[2]);\n` +
                    `(async () => { const root = process.argv[3]; const loaded = await loadPokieGameRuntime(root); const value = loaded.game.createSession().model; await loaded.release(); const cache = Object.keys(require.cache).filter((file) => /[\\/]pokie-runtime-[A-Za-z0-9]{6}[\\/]/.test(file)); const sourceWasMutated = fs.existsSync(path.join(root, '.pokie-runtime-cache')); process.stdout.write(JSON.stringify({value, cache, sourceWasMutated})); })().catch((error) => { console.error(error); process.exitCode = 1; });\n`,
            );
            const output = execFileSync(process.execPath, [scriptPath, COMPILED_CJS_ENTRY, packageRoot], {encoding: "utf-8"});
            expect(JSON.parse(output)).toEqual({value: "lazy model", cache: [], sourceWasMutated: false});
        } finally {
            fs.rmSync(packageRoot, {recursive: true, force: true});
        }
    });

    it("keeps old and new package versions isolated while both leases are live", () => {
        const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-runtime-lease-version-"));
        const scriptPath = path.join(packageRoot, "versions.cjs");
        try {
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "lease-version", version: "1.0.0", pokie: {entry: "./game.js"}}));
            fs.writeFileSync(path.join(packageRoot, "model.js"), "module.exports = {name: 'Before rebuild'};\n");
            fs.writeFileSync(path.join(packageRoot, "game.js"), "const model = require('./model.js'); module.exports = {getManifest() { return {id: 'lease-version', name: model.name, version: '1.0.0'}; }, createSession() { return {name: model.name}; }};\n");
            fs.writeFileSync(
                scriptPath,
                `const fs = require('fs'); const {loadPokieGameRuntime} = require(process.argv[2]);\n` +
                    `(async () => { const root = process.argv[3]; const before = await loadPokieGameRuntime(root); fs.writeFileSync(root + '/model.js', "module.exports = {name: 'After rebuild'};\\n"); const after = await loadPokieGameRuntime(root); const result = [before.game.createSession().name, after.game.createSession().name]; await before.release(); await after.release(); process.stdout.write(JSON.stringify(result)); })().catch((error) => { console.error(error); process.exitCode = 1; });\n`,
            );
            const output = execFileSync(process.execPath, [scriptPath, COMPILED_CJS_ENTRY, packageRoot], {encoding: "utf-8"});
            expect(JSON.parse(output)).toEqual(["Before rebuild", "After rebuild"]);
        } finally {
            fs.rmSync(packageRoot, {recursive: true, force: true});
        }
    });
});
