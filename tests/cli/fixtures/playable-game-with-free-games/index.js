const {VideoSlotWithFreeGamesConfig, VideoSlotWithFreeGamesSession, SymbolsCombinationsGenerator, SeededRandomNumberGenerator} = require("pokie");

// FNV-1a: turns any --seed string/number into a 32-bit int for SeededRandomNumberGenerator.
function hashSeed(seed) {
    let hash = 0x811c9dc5;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

// A base/free-games fixture used to demonstrate `pokie sim`'s feature-level breakdown end to end:
// this game's session implements the optional StakeAmountDetermining contract (via
// VideoSlotWithFreeGamesSession), so AggregateSimulationRunner can tell a charged base-game round
// from an unfinished free-games round that charges nothing, and "pokie sim"/"report"/"diff" can show
// base vs. freeGames RTP contribution separately. Uses the built-in default free-games mapping
// (3/4/5 "S" scatters award 10/15/20 free games) and the default (unfixed) reel strips, so most
// rounds are base and only an occasional scatter hit triggers a free-games round — unlike the plain
// "playable-game" fixture, this one doesn't fix the reel sequences, so --seed controls stop positions
// but not full reproducibility across runs.
module.exports = {
    getManifest() {
        return {id: "playable-game-with-free-games", name: "Playable Game With Free Games", version: "1.0.0"};
    },
    createSession(context) {
        const config = new VideoSlotWithFreeGamesConfig();
        const combinationsGenerator =
            context && context.seed !== undefined
                ? new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(hashSeed(context.seed)))
                : new SymbolsCombinationsGenerator(config);
        return new VideoSlotWithFreeGamesSession(config, combinationsGenerator);
    },
};
