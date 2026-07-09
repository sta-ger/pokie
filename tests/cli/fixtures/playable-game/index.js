const {
    VideoSlotConfig,
    VideoSlotSession,
    SymbolsCombinationsGenerator,
    SeededRandomNumberGenerator,
    SymbolsSequence,
} = require("pokie");

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

// VideoSlotConfig's default reel strips are shuffled with an unseeded Math.random() at
// construction time (see ReelsSymbolsSequencesGenerator), independently of any RNG passed to
// SymbolsCombinationsGenerator. A fixture used to test --seed reproducibility must replace them
// with fixed, non-shuffled sequences so a seed only has to control reel *stop positions*.
function buildFixedSymbolsSequences(config) {
    const symbols = config.getAvailableSymbols();
    const sequences = [];
    for (let reel = 0; reel < config.getReelsNumber(); reel++) {
        const pattern = [];
        for (let i = 0; i < 40; i++) {
            pattern.push(symbols[(i + reel) % symbols.length]);
        }
        sequences.push(new SymbolsSequence().fromArray(pattern));
    }
    return sequences;
}

module.exports = {
    getManifest() {
        return {id: "playable-game", name: "Playable Game", version: "1.0.0"};
    },
    createSession(context) {
        const config = new VideoSlotConfig();
        config.setSymbolsSequences(buildFixedSymbolsSequences(config));
        const combinationsGenerator =
            context && context.seed !== undefined
                ? new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(hashSeed(context.seed)))
                : new SymbolsCombinationsGenerator(config);
        return new VideoSlotSession(config, combinationsGenerator);
    },
};
