"use strict";
const pokie_1 = require("pokie");
const manifest = {
    "id": "registry-lifecycle-final-fixture",
    "name": "Registry Lifecycle Final Fixture",
    "version": "0.1.0"
};
const game = {
    getManifest() {
        return manifest;
    },
    createSession(context) {
        const seedRng = context && context.seed !== undefined ? new pokie_1.SeededRandomNumberGenerator(context.seed) : undefined;
        // VideoSlotConfig's own default reel-strip content (this scaffold sets no symbols/reelStrips of
        // its own -- a developer hand-edits those in) is otherwise shuffled with unseeded Math.random()
        // at construction time; passing a seeded ReelsSymbolsSequencesGenerator here makes it
        // deterministic too, not just the stop-position draws below.
        const config = new pokie_1.VideoSlotConfig(undefined, seedRng ? new pokie_1.ReelsSymbolsSequencesGenerator(seedRng) : undefined);
        const combinationsGenerator = context && context.seed !== undefined
            ? new pokie_1.SymbolsCombinationsGenerator(config, new pokie_1.SeededRandomNumberGenerator(context.seed))
            : new pokie_1.SymbolsCombinationsGenerator(config);
        return new pokie_1.VideoSlotSession(config, combinationsGenerator);
    },
    getSessionSerializer() {
        return new pokie_1.VideoSlotSessionSerializer();
    },
};
module.exports = game;
