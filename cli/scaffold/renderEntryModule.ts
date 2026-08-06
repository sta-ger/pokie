import {PokieGameManifest} from "pokie";

export function renderEntryModule(manifest: PokieGameManifest): string {
    return `import {PokieGame, VideoSlotConfig, VideoSlotSession, VideoSlotSessionSerializer} from "pokie";

const manifest = ${JSON.stringify(manifest, null, 4)};

const game: PokieGame = {
    getManifest() {
        return manifest;
    },
    createSession() {
        const config = new VideoSlotConfig();
        return new VideoSlotSession(config);
    },
    getSessionSerializer() {
        return new VideoSlotSessionSerializer();
    },
};

// "export =" (not "export default"): compiled with this package's own tsconfig.json
// (module: CommonJS, esModuleInterop: true), "export default" would emit "exports.default = game"
// instead of "module.exports = game" -- loadPokieGame's own import()-based unwrapping copes with
// either shape, but a plain require("./dist/index.js") (e.g. from another Node tool that doesn't
// go through loadPokieGame) needs the module's exports object itself to already satisfy the
// PokieGame contract.
export = game;
`;
}
