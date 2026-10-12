import {
    VideoSlotConfig, VideoSlotSession, VideoSlotWinCalculator,
    SymbolsCombinationsGenerator, SeededRandomNumberGenerator, ReelsSymbolsSequencesGenerator,
    InMemorySessionRepository, InMemoryWallet, SpinCommandHandler,
    captureInitialPokieSessionState, resolveGameSessionIdentity,
    type PokieGame, type RepositoryCommandHandling, type SpinCommandResult,
    type VideoSlotWinCalculating, type SymbolsCombinationDescribing,
} from "@fromstan/pokie";

// Consumer code: public imports, collaborator composition and an explicit complete state codec.
export class ConsumerWinCalculator implements VideoSlotWinCalculating<string> {
    private readonly delegate: VideoSlotWinCalculator;

    constructor(config: VideoSlotConfig) {
        this.delegate = new VideoSlotWinCalculator(config);
    }

    public calculateWin(bet: number, combination: SymbolsCombinationDescribing<string>): void {
        this.delegate.calculateWin(bet, combination);
    }

    public getLinesWinning(): number {
        return this.delegate.getLinesWinning();
    }
    public getScattersWinning(): number {
        return this.delegate.getScattersWinning();
    }
    public getWinAmount(): number {
        return this.delegate.getWinAmount();
    }
    public getWinningLines() {
        return this.delegate.getWinningLines();
    }
    public getWinningScatters() {
        return this.delegate.getWinningScatters();
    }
    public getWinEvaluationResult() {
        return this.delegate.getWinEvaluationResult();
    }
}

export function extensionGame(): PokieGame {
    return {
        getManifest: () => ({id: "consumer", name: "Consumer extension", version: "1"}),
        getSessionCompatibility: () => ({version: "math-1", stateSchemaVersion: "1"}),
        getSessionStateSchema: () => ({kind: "seeded-video-slot"}),
        createSession: context => {
            const config = new VideoSlotConfig(undefined, new ReelsSymbolsSequencesGenerator(new SeededRandomNumberGenerator(context?.seed ?? 7)));
            const session = new VideoSlotSession(config,
                new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(context?.seed ?? 7)),
                new ConsumerWinCalculator(config));
            // Explicit opt-in: the custom calculator delegates only and owns no future-round state.
            // The existing seeded codec and its nonmutating validator cover this composition.
            return Object.assign(session, {isSessionStateRestorable: () => true});
        },
    };
}

export async function extensionRound(): Promise<SpinCommandResult> {
    const game = extensionGame();
    const session = game.createSession({seed: "consumer"});
    const repository = new InMemorySessionRepository();
    const wallet = new InMemoryWallet();
    const state = captureInitialPokieSessionState({seed: "consumer"}, session, undefined, false, game);
    state.identity = resolveGameSessionIdentity(game);
    await repository.save("consumer", state);
    await wallet.setBalance("consumer", session.getCreditsAmount());
    const runtime: RepositoryCommandHandling = new SpinCommandHandler(extensionGame(), repository, wallet);
    const result = await runtime.execute({kind: "spin", sessionId: "consumer", expectedVersion: 1});
    if (result.status === "played") result.state.featureState satisfies unknown;
    else if (result.status !== "not-found") result.reason satisfies string;
    return result;
}
