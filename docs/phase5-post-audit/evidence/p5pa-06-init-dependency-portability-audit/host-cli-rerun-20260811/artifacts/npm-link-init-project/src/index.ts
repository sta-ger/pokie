import {
    PokieGame,
    PokieGameContext,
    ReelsSymbolsSequencesGenerator,
    SeededRandomNumberGenerator,
    SymbolsCombinationsGenerator,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotSessionSerializer,
} from "pokie";

const manifest = {
    "id": "linked-init-project",
    "name": "Linked Init Project",
    "version": "0.1.0"
};

const game: PokieGame = {
    getManifest() {
        return manifest;
    },
    createSession(context?: PokieGameContext) {
        const seedRng = context && context.seed !== undefined ? new SeededRandomNumberGenerator(context.seed) : undefined;
        // VideoSlotConfig's own default reel-strip content (this scaffold sets no symbols/reelStrips of
        // its own -- a developer hand-edits those in) is otherwise shuffled with unseeded Math.random()
        // at construction time; passing a seeded ReelsSymbolsSequencesGenerator here makes it
        // deterministic too, not just the stop-position draws below.
        const config = new VideoSlotConfig(undefined, seedRng ? new ReelsSymbolsSequencesGenerator(seedRng) : undefined);
        const combinationsGenerator = context && context.seed !== undefined
            ? new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(context.seed))
            : new SymbolsCombinationsGenerator(config);
        return new VideoSlotSession(config, combinationsGenerator);
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
