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
class ObservedGenerator implements SymbolsCombinationsGenerating {
    private generatedScreens = 0;
    private readonly delegate: SymbolsCombinationsGenerating;
    public constructor(delegate: SymbolsCombinationsGenerating) {
        this.delegate = delegate;
    }
    public generateSymbolsCombination(): SymbolsCombinationDescribing {
        this.generatedScreens++;
        return this.delegate.generateSymbolsCombination();
    }
    public getGeneratedScreens(): number {
        return this.generatedScreens;
    }
}
export function extensionRound(seed: string, bet = 0.05): {screen: unknown; win: number; generatedScreens: number} {
    const config = new VideoSlotConfig(undefined, new ReelsSymbolsSequencesGenerator(new SeededRandomNumberGenerator(seed)));
    config.setAvailableBets([0.05, 7.5, 1e-7]);
    const generator = new ObservedGenerator(new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(seed)));
    const session = new VideoSlotSession(config, generator);
    const runtime = new SessionRuntime(session);
    try {
        const result = runtime.execute({kind: "spin", bet, roundId: "extension-round"});
        if (result.status !== "played") throw new Error(result.reason);
        return {
            screen: session.getSymbolsCombination().toMatrix(),
            win: session.getWinAmount(),
            generatedScreens: generator.getGeneratedScreens(),
        };
    } finally {
        runtime.release();
    }
}
