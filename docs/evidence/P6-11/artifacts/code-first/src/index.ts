import {
    BetModeDefinition,
    BetModesConfig,
    PokieGame,
    PokieGameContext,
    SeededRandomNumberGenerator,
    SymbolsCombinationsGenerating,
    SymbolsCombinationsGenerator,
    SymbolsSequence,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotSessionSerializer,
    VideoSlotWithBetModesSession,
} from "pokie";

const manifest = {id: "p6-11-code-first", name: "P6-11 Code First", version: "1.0.0"};

function createConfig(): VideoSlotConfig<string> {
    const config = new VideoSlotConfig<string>();
    config.setReelsNumber(2);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols(["A", "B"]);
    config.setAvailableBets([1]);
    config.setSymbolsSequences([new SymbolsSequence<string>().fromArray(["A", "A", "B"]), new SymbolsSequence<string>().fromArray(["A", "B"])]);
    return config;
}

function modes(): BetModesConfig {
    return new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 2})], "base");
}

function createModeSession(generator: SymbolsCombinationsGenerating<string>): VideoSlotWithBetModesSession<string> {
    return new VideoSlotWithBetModesSession(new VideoSlotSession(createConfig(), generator), modes());
}

const game: PokieGame = {
    getManifest() { return manifest; },
    getBetModes() { return [{id: "base", runtimeType: "base", isDefault: true}, {id: "ante", runtimeType: "ante", costMultiplier: 2}]; },
    getConfigHash() { return "sha256:p6-11-code-first-v1"; },
    createSession(context?: PokieGameContext) {
        const config = createConfig();
        const generator = context?.seed === undefined ? new SymbolsCombinationsGenerator(config) : new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(context.seed));
        return new VideoSlotWithBetModesSession(new VideoSlotSession(config, generator), modes());
    },
    createExactEnumerationSession(generator: SymbolsCombinationsGenerating) { return createModeSession(generator as SymbolsCombinationsGenerating<string>); },
    getSessionSerializer() { return new VideoSlotSessionSerializer(); },
};

export = game;
