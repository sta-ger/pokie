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
});
