import fs from "fs";
import os from "os";
import path from "path";
import {createStudioEntryModuleLoader, createStudioGameLoader} from "../../../cli/studio/loadStudioGame.js";
import {releasePokieGame} from "pokie";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const fixtureRoot = path.join(__dirname, "..", "fixtures", "playable-game");

describe("createStudioEntryModuleLoader", () => {
    it("loads a registered package with no local pokie dependency through Studio's own runtime", async () => {
        const entryPath = path.join(fixtureRoot, "index.js");
        const loader = createStudioEntryModuleLoader(REPO_ROOT, () =>
            Promise.reject(Object.assign(new Error("Cannot find module 'pokie'"), {code: "MODULE_NOT_FOUND"})),
        );

        const game = await loader(entryPath);

        expect((game.getManifest as () => unknown)()).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(game.createSession).toEqual(expect.any(Function));
    });

    it("preserves an entry's failure when it is not missing Studio's runtime", async () => {
        const expected = new Error("Cannot find module 'other-runtime'");
        const loader = createStudioEntryModuleLoader(REPO_ROOT, () => Promise.reject(Object.assign(expected, {code: "MODULE_NOT_FOUND"})));

        await expect(loader(path.join(fixtureRoot, "index.js"))).rejects.toBe(expected);
    });

    it("loads rebuilt CJS dependencies through the actual Studio loader and keeps Studio-runtime fallback working", async () => {
        const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-loader-cjs-"));
        try {
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "studio-cjs", version: "1.0.0", pokie: {entry: "./game.js"}}));
            fs.writeFileSync(path.join(packageRoot, "model.js"), "module.exports = {name: 'Before rebuild'};\n");
            fs.writeFileSync(
                path.join(packageRoot, "game.js"),
                "const runtime = require('pokie'); const runtimePath = require.resolve('pokie'); const model = require('./model.js'); module.exports = { getManifest() { return {id: 'studio-cjs', name: model.name, version: typeof runtime.loadPokieGame === 'function' && runtimePath ? '1.0.0' : ''}; }, createSession() { return {name: model.name}; }, runtimePath };\n",
            );
            const loadGame = createStudioGameLoader(REPO_ROOT);
            const before = await loadGame(packageRoot);
            fs.writeFileSync(path.join(packageRoot, "model.js"), "module.exports = {name: 'After rebuild'};\n");
            const after = await loadGame(packageRoot);

            expect(before.getManifest().name).toBe("Before rebuild");
            expect(after.getManifest().name).toBe("After rebuild");
            expect((before as unknown as {runtimePath: string}).runtimePath).toEqual(expect.any(String));
            await releasePokieGame(before);
            await releasePokieGame(after);
            expect(fs.existsSync(path.join(packageRoot, ".pokie-runtime-cache"))).toBe(false);
        } finally {
            fs.rmSync(packageRoot, {recursive: true, force: true});
        }
    });

    it("loads rebuilt ESM dependencies through the actual Studio loader", async () => {
        const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-loader-esm-"));
        try {
            fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({name: "studio-esm", version: "1.0.0", type: "module", pokie: {entry: "./game.mjs"}}));
            fs.writeFileSync(path.join(packageRoot, "model.mjs"), "export const name = 'Before rebuild';\n");
            fs.writeFileSync(path.join(packageRoot, "game.mjs"), "import {name} from './model.mjs'; export default {getManifest() { return {id: 'studio-esm', name, version: '1.0.0'}; }, createSession() { return {name}; }};\n");
            const loadGame = createStudioGameLoader(REPO_ROOT);
            const before = await loadGame(packageRoot);
            fs.writeFileSync(path.join(packageRoot, "model.mjs"), "export const name = 'After rebuild';\n");
            const after = await loadGame(packageRoot);

            expect(before.getManifest().name).toBe("Before rebuild");
            expect(after.getManifest().name).toBe("After rebuild");
            await releasePokieGame(before);
            await releasePokieGame(after);
        } finally {
            fs.rmSync(packageRoot, {recursive: true, force: true});
        }
    });
});
