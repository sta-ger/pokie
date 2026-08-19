import path from "path";
import {createStudioEntryModuleLoader} from "../../../cli/studio/loadStudioGame.js";

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
});
