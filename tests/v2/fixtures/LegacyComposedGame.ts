import {
    AbstractVideoSlotSessionDecorator, BetModeDefinition, BetModesConfig,
    Paytable, SeededRandomNumberGenerator, SymbolsCombinationsGenerator, SymbolsSequence,
    VideoSlotConfig, VideoSlotSession, VideoSlotWithBetModesSession,
    VideoSlotWithFreeGamesConfig, VideoSlotWithFreeGamesSession,
    type PokieGame, type VideoSlotSessionHandling,
} from "@fromstan/pokie";

export const legacyCompositions = ["free-games", "bet-modes", "bet-free", "free-bet"] as const;
export type LegacyComposition = typeof legacyCompositions[number];

class LegacyDecorator extends AbstractVideoSlotSessionDecorator {
    public rounds = 0;
    public override play(): void {
        this.rounds++;
        super.play();
    }
}

class LegacySnapshotDecorator extends LegacyDecorator {
    public toSessionState(): unknown {
        return ["opaque legacy snapshot", this.rounds];
    }
}

/** Deliberately unchanged package contract: no new codec/capability declarations. */
export function legacyComposedGame(composition: LegacyComposition, opaque: boolean): PokieGame {
    return {
        getManifest: () => ({id: "legacy-composition", name: "Legacy composition", version: "1"}),
        createSession: () => {
            const config = new VideoSlotConfig();
            config.setScatterSymbols(["A"]);
            const landedSymbols = config.getReelsNumber() * config.getReelsSymbolsNumber();
            const paytable = new Paytable<string>(config.getAvailableBets(), config.getAvailableSymbols());
            paytable.setPayoutForSymbol("A", landedSymbols, 2);
            config.setPaytable(paytable);
            config.setSymbolsSequences(Array.from({length: config.getReelsNumber()}, () => new SymbolsSequence().fromArray(["A", "A", "A"])));
            const base = new VideoSlotSession(config, new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(7)));
            let session: VideoSlotSessionHandling = opaque ? new LegacySnapshotDecorator(base) : new LegacyDecorator(base);
            const free = (nested: VideoSlotSessionHandling): VideoSlotWithFreeGamesSession => {
                const freeConfig = new VideoSlotWithFreeGamesConfig(config, {});
                freeConfig.setFreeGamesForScatters("A", landedSymbols, 2);
                return new VideoSlotWithFreeGamesSession(freeConfig, undefined, undefined, nested);
            };
            const modes = (nested: VideoSlotSessionHandling): VideoSlotWithBetModesSession => new VideoSlotWithBetModesSession(nested, new BetModesConfig([new BetModeDefinition("base")], "base"));
            if (composition === "free-games" || composition === "bet-free") session = free(session);
            if (composition !== "free-games") session = modes(session);
            if (composition === "free-bet") session = free(session);
            return session;
        },
    };
}
