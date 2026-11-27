import {PokieGameInfo} from "@fromstan/pokie";

export function renderEntryModule(manifest: PokieGameInfo): string {
    return `import {
    CustomLinesDefinitions,
    Paytable,
    PokieGame,
    PokieGameContext,
    ReelsSymbolsSequencesGenerator,
    SeededRandomNumberGenerator,
    SymbolsCombinationsGenerator,
    SymbolsSequence,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotSessionSerializer,
    validateExecutableState,
} from "@fromstan/pokie";

const manifest = ${JSON.stringify(manifest, null, 4)};

// A small balanced five-line demo, not a production-certified model. The shape is deliberately close
// to POKIE's Starter Slot, so a first simulation is not a 19%-RTP surprise. Replace the symbols,
// strips, paylines and paytable with your own authored math before shipping.
const DEMO_BETS = [1, 2, 5] as const;
const DEMO_SYMBOL_COUNTS = {A: 4, K: 6, Q: 8, J: 10} as const;
const DEMO_LINES: Record<string, readonly number[]> = {
    "0": [0, 0, 0, 0, 0],
    "1": [1, 1, 1, 1, 1],
    "2": [2, 2, 2, 2, 2],
    "3": [0, 1, 1, 1, 0],
    "4": [2, 1, 1, 1, 2],
};
const DEMO_PAYTABLE: Record<string, Record<number, number>> = {
    A: {3: 5, 4: 10, 5: 20},
    K: {3: 3, 4: 6, 5: 12},
    Q: {3: 2, 4: 4, 5: 8},
    J: {3: 1, 4: 2, 5: 4},
};
// Keeps the demo in the usual mid-90s RTP range while leaving the authored multipliers easy to read.
const DEMO_PAYOUT_SCALE = 0.98;

function createDemoConfig(seedRng: SeededRandomNumberGenerator | undefined): VideoSlotConfig {
    // Seed the default sequence generator too before replacing its strips, so a seeded session never
    // consumes unseeded Math.random() during construction.
    const config = new VideoSlotConfig(undefined, seedRng ? new ReelsSymbolsSequencesGenerator(seedRng) : undefined);
    config.setReelsNumber(5);
    config.setReelsSymbolsNumber(3);
    config.setAvailableSymbols(Object.keys(DEMO_SYMBOL_COUNTS));
    config.setWildSymbols([]);
    config.setScatterSymbols([]);
    config.setAvailableBets([...DEMO_BETS]);
    const lines = new CustomLinesDefinitions();
    for (const [id, definition] of Object.entries(DEMO_LINES)) lines.setLineDefinition(id, [...definition]);
    config.setLinesDefinitions(lines);

    const paytable = new Paytable([...DEMO_BETS]);
    for (const [symbol, awards] of Object.entries(DEMO_PAYTABLE)) {
        for (const [count, multiplier] of Object.entries(awards)) {
            paytable.setPayoutForSymbol(symbol, Number(count), multiplier * DEMO_PAYOUT_SCALE);
        }
    }
    config.setPaytable(paytable);
    config.setSymbolsSequences(
        Array.from({length: 5}, () => new SymbolsSequence<string>().fromNumbersOfSymbols(DEMO_SYMBOL_COUNTS).shuffle(seedRng)),
    );
    return config;
}

const game: PokieGame = {
    getInfo() {
        return manifest;
    },
    getSessionStateSchema() {
        return {kind: "seeded-video-slot"};
    },
    getSessionCommandCapabilities() {
        return {bets: [...DEMO_BETS]};
    },
    validateLiveSessionState(state: unknown, context?: PokieGameContext) {
        validateExecutableState(state, {kind: "seeded-video-slot"}, undefined, context?.seed === undefined);
    },
    createSession(context?: PokieGameContext) {
        const seedRng = context && context.seed !== undefined ? new SeededRandomNumberGenerator(context.seed) : undefined;
        const config = createDemoConfig(seedRng);
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
`;
}
