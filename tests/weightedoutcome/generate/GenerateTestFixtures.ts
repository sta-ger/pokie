import {GameSession, GameSessionConfig, Paytable, PokieGame, SymbolsCombinationsGenerating, SymbolsSequence, VideoSlotConfig, VideoSlotSession} from "pokie";

// A tiny, hand-computable video-slot math model: 2 reels, a single visible row per reel (reelsSymbolsNumber
// 1), reel 0 = ["A","A","B"] (3 stops), reel 1 = ["A","B"] (2 stops) -- a raw reel-stop space of exactly 3*2=6
// tuples, reducing to exactly 4 distinct visible grids: (A,A) weight 2, (A,B) weight 2, (B,A) weight 1,
// (B,B) weight 1 (2+2+1+1 = 6, matching the raw space exactly). A 2-of-a-kind "A" pays 5x bet, everything else
// pays nothing -- small enough to verify generateExactWeightedOutcomeLibrary's own combinatorics by hand.
export function buildFixtureConfig(): VideoSlotConfig<string> {
    const config = new VideoSlotConfig<string>();
    config.setReelsNumber(2);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols(["A", "B"]);

    const paytable = new Paytable<string>(config.getAvailableBets(), ["A", "B"], [], 2);
    paytable.setPayoutForSymbol("A", 2, 5);
    config.setPaytable(paytable);

    config.setSymbolsSequences([
        new SymbolsSequence<string>().fromNumbersOfSymbols({A: 2, B: 1}),
        new SymbolsSequence<string>().fromNumbersOfSymbols({A: 1, B: 1}),
    ]);

    return config;
}

export function buildFixtureGame(config: VideoSlotConfig<string> = buildFixtureConfig()): PokieGame {
    return {
        getManifest: () => ({id: "fixture-slot", name: "Fixture Slot", version: "1.0.0"}),
        createSession: () => new VideoSlotSession<string>(config),
        createExactEnumerationSession: (combinationsGenerator: SymbolsCombinationsGenerating) => new VideoSlotSession<string>(config, combinationsGenerator),
    };
}

// Same reel layout (and therefore the same raw outcome-space size and grids) as buildFixtureGame(), but a
// different game id -- used to prove a same-cardinality checkpoint from a genuinely different source still
// fails closed instead of being accepted on progressTotal alone.
export function buildAlternateFixtureGame(): PokieGame {
    const config = buildFixtureConfig();
    return {
        getManifest: () => ({id: "fixture-slot-alternate", name: "Fixture Slot (alternate)", version: "1.0.0"}),
        createSession: () => new VideoSlotSession<string>(config),
        createExactEnumerationSession: (combinationsGenerator: SymbolsCombinationsGenerating) => new VideoSlotSession<string>(config, combinationsGenerator),
    };
}

// A game whose createExactEnumerationSession returns a session that can never afford to play a round --
// exercises generateExactWeightedOutcomeLibrary's own "session-not-playable" fail-closed check.
export function buildUnplayableFixtureGame(): PokieGame {
    const config = buildFixtureConfig();
    return {
        getManifest: () => ({id: "fixture-slot-unplayable", name: "Fixture Slot (unplayable)", version: "1.0.0"}),
        createSession: () => new VideoSlotSession<string>(config),
        createExactEnumerationSession: (combinationsGenerator: SymbolsCombinationsGenerating) => {
            const emptyCreditsConfig = new GameSessionConfig();
            emptyCreditsConfig.setCreditsAmount(0);
            return new VideoSlotSession<string>(config, combinationsGenerator, undefined, new GameSession(emptyCreditsConfig));
        },
    };
}

// A game that never opted into exact enumeration at all -- generateExactWeightedOutcomeLibrary's own
// "unsupported" fail-closed check.
export function buildUnsupportedFixtureGame(): PokieGame {
    const config = buildFixtureConfig();
    return {
        getManifest: () => ({id: "fixture-slot-unsupported", name: "Fixture Slot (unsupported)", version: "1.0.0"}),
        createSession: () => new VideoSlotSession<string>(config),
    };
}
