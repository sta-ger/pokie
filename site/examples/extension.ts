import {
    VideoSlotConfig,
    VideoSlotSession,
    ReelsSymbolsSequencesGenerator,
    SymbolsCombinationsGenerator,
    SeededRandomNumberGenerator,
    SessionRuntime,
    type SymbolsCombinationDescribing,
    type SymbolsCombinationsGenerating,
} from "@fromstan/pokie/browser";

/** Browser-safe extension collaborator; seeded generation and payout remain shared. */
class TaggedGenerator implements SymbolsCombinationsGenerating {
    private readonly delegate: SymbolsCombinationsGenerating;
    public constructor(delegate: SymbolsCombinationsGenerating) {
        this.delegate = delegate;
    }
    public generateSymbolsCombination(): SymbolsCombinationDescribing {
        return this.delegate.generateSymbolsCombination();
    }
}
export function extensionRound(seed: string): {screen: unknown; win: number} {
    const config = new VideoSlotConfig(undefined, new ReelsSymbolsSequencesGenerator(new SeededRandomNumberGenerator(seed)));
    const generator = new TaggedGenerator(new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(seed)));
    const session = new VideoSlotSession(config, generator);
    const runtime = new SessionRuntime(session);
    try {
        const result = runtime.execute({kind: "spin", bet: 0.05, roundId: "extension-round"});
        if (result.status !== "played") throw new Error(result.reason);
        return {screen: session.getSymbolsCombination().toMatrix(), win: session.getWinAmount()};
    } finally {
        runtime.release();
    }
}
