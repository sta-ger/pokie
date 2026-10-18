import {
    SeededRandomNumberGenerator,
    ReelsSymbolsSequencesGenerator,
    VideoSlotConfig,
    SymbolsCombinationsGenerator,
    VideoSlotSession,
    SessionRuntime,
} from "@fromstan/pokie/browser";

export function browserRound(seed = "docs-28") {
    const config = new VideoSlotConfig(
        undefined,
        new ReelsSymbolsSequencesGenerator(new SeededRandomNumberGenerator(seed)),
    );
    const session = new VideoSlotSession(
        config,
        new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(seed)),
    );
    const runtime = new SessionRuntime(session);
    try {
        const result = runtime.execute({kind: "spin", bet: 1, roundId: "docs-round"});
        if (result.status !== "played") throw new Error(result.reason);
        return {screen: session.getSymbolsCombination().toMatrix(), win: session.getWinAmount()};
    } finally {
        runtime.release();
    }
}
