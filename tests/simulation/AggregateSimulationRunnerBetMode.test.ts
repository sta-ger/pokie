import {
    AggregateSimulationRunner,
    BetModeDefinition,
    BetModesConfig,
    FixedBetModeForNextSimulationRoundSetting,
    FreeGamesForcedFeatureEntryHandler,
    SeededRandomNumberGenerator,
    SymbolsCombinationsGenerator,
    SymbolsSequence,
    VideoSlotWinCalculator,
    VideoSlotWithBetModesSession,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesConfigRepresenting,
    VideoSlotWithFreeGamesSession,
} from "pokie";

const FREE_GAMES_TO_GRANT = 4;
const SEED = 1234567;

// Disables every natural scatter-triggered free-games award, so the only source of "freeGames"
// category rounds in these tests is the buy-bonus mode's own forced entry — required to assert exact
// base/freeGames round counts and totals without RNG-driven retriggers muddying them. Also fixes the
// reel strips explicitly (one of each symbol, in a fixed order) rather than leaving
// VideoSlotWithFreeGamesConfig's own default reel-strip generation in place: that default shuffles
// with an unseeded RNG, so two config instances would otherwise have different reel *contents* even
// with the exact same seeded play-selection RNG below — this is what actually makes a run reproducible.
const createNoNaturalTriggersConfig = (): VideoSlotWithFreeGamesConfigRepresenting => {
    const config = new VideoSlotWithFreeGamesConfig();
    const sequences = new Array(config.getReelsNumber())
        .fill(0)
        .map(() => new SymbolsSequence().fromNumberOfEachSymbol(config.getAvailableSymbols(), 1));
    config.setSymbolsSequences(sequences);
    config.getScatterSymbols().forEach((scatter) => {
        for (let i = 0; i < config.getReelsNumber() * config.getReelsSymbolsNumber(); i++) {
            config.setFreeGamesForScatters(scatter, i, 0);
        }
    });
    return config;
};

const betModesConfig = (): BetModesConfig =>
    new BetModesConfig(
        [
            new BetModeDefinition("base"),
            new BetModeDefinition("ante", {stakeMultiplier: 1.25}),
            new BetModeDefinition("buy-bonus", {stakeMultiplier: 50, forcesFeatureEntry: true}),
        ],
        "base",
    );

// A fresh, deterministic (seeded RNG, no natural free-games triggers) VideoSlotWithBetModesSession
// wrapping a VideoSlotWithFreeGamesSession -- the exact same runtime a real game uses, never a
// simulation-side reimplementation of ante/buy-bonus math.
function createDeterministicBetModeSession(): {
    session: VideoSlotWithBetModesSession<string>;
    innerSession: VideoSlotWithFreeGamesSession;
    } {
    const config = createNoNaturalTriggersConfig();
    const innerSession = new VideoSlotWithFreeGamesSession(
        config,
        new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(SEED)),
        new VideoSlotWinCalculator(config),
    );
    innerSession.setCreditsAmount(Number.MAX_SAFE_INTEGER);
    const session = new VideoSlotWithBetModesSession(
        innerSession,
        betModesConfig(),
        new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
    );
    return {session, innerSession};
}

describe("AggregateSimulationRunner with a locked bet mode", () => {
    const ROUNDS = 200;

    it("base mode: every round is stake-based-categorized at the nominal bet, same as no mode selected at all", () => {
        const {session} = createDeterministicBetModeSession();
        const bet = session.getBet();
        const runner = new AggregateSimulationRunner(session, ROUNDS, undefined, undefined, new FixedBetModeForNextSimulationRoundSetting("base"));

        runner.run();
        const breakdown = runner.getBreakdownStatistics();

        expect(breakdown).toBeDefined();
        expect(Object.keys(breakdown!)).toEqual(["base"]); // no natural triggers configured, no forcing mode
        expect(breakdown!.base.rounds).toBe(ROUNDS);
        expect(breakdown!.base.totalBet).toBe(bet * ROUNDS);
    });

    it("ante mode: the breakdown's totalBet reflects the real 1.25x stake, not the nominal bet", () => {
        const {session} = createDeterministicBetModeSession();
        const bet = session.getBet();
        const runner = new AggregateSimulationRunner(session, ROUNDS, undefined, undefined, new FixedBetModeForNextSimulationRoundSetting("ante"));

        runner.run();
        const breakdown = runner.getBreakdownStatistics();

        expect(Object.keys(breakdown!)).toEqual(["base"]); // no natural triggers, ante never forces entry
        expect(breakdown!.base.rounds).toBe(ROUNDS);
        // The whole point: NOT bet * ROUNDS (the nominal figure) -- the runtime's own getStakeAmount()
        // is what's actually read here, never a multiplier recomputed by the simulation layer.
        expect(breakdown!.base.totalBet).toBeCloseTo(bet * 1.25 * ROUNDS, 10);
        expect(session.getBetModeId()).toBe("ante"); // persistent -- never auto-reverted
    });

    it("buy-bonus mode: re-buys every cycle, free spins cost nothing, and the breakdown reflects exactly that", () => {
        const {session, innerSession} = createDeterministicBetModeSession();
        const bet = session.getBet();
        const runner = new AggregateSimulationRunner(
            session,
            ROUNDS,
            undefined,
            undefined,
            new FixedBetModeForNextSimulationRoundSetting("buy-bonus"),
        );

        runner.run();
        const breakdown = runner.getBreakdownStatistics();

        expect(Object.keys(breakdown!).sort()).toEqual(["base", "freeGames"]);
        // One "base" (buy) round starts each cycle, followed by exactly FREE_GAMES_TO_GRANT - 1 free
        // rounds finishing it -- deterministic given no natural retriggers, so this identity holds
        // exactly, not just approximately.
        expect(breakdown!.freeGames.rounds).toBe(breakdown!.base.rounds * (FREE_GAMES_TO_GRANT - 1));
        expect(breakdown!.base.rounds + breakdown!.freeGames.rounds).toBe(ROUNDS);
        // Every buy round is charged the full mode-locked buy cost; every free round costs nothing.
        expect(breakdown!.base.totalBet).toBe(bet * 50 * breakdown!.base.rounds);
        expect(breakdown!.freeGames.totalBet).toBe(0);
        // The mode itself never lingers as "selected" past the purchase that bought it.
        expect(session.getBetModeId()).toBe("base");
        // The bought bonus rounds actually happened, not just the buy spins.
        expect(innerSession.getFreeGamesSum()).toBeGreaterThan(0);
    });

    it("without a betModeSelector, a buy-bonus mode selected once buys only once (contrast case)", () => {
        const {session, innerSession} = createDeterministicBetModeSession();
        session.setBetMode("buy-bonus");
        // No betModeSelector -- nothing re-selects "buy-bonus" once it auto-reverts after the purchase.
        // Runs for exactly one bonus round's worth of spins (the buy + its granted free spins) so the
        // check below lands right as that round finishes, before the *next* round's own
        // beforeRoundPlayed() clears freeGamesSum/Num back to 0 for the following, entirely separate,
        // ordinary (never-rebought) spin.
        const runner = new AggregateSimulationRunner(session, FREE_GAMES_TO_GRANT);

        runner.run();

        expect(session.getBetModeId()).toBe("base");
        // Exactly one purchase's worth of free games, never re-bought.
        expect(innerSession.getFreeGamesSum()).toBe(FREE_GAMES_TO_GRANT);
        expect(innerSession.getFreeGamesNum()).toBe(FREE_GAMES_TO_GRANT);
    });

    it("deterministic seeded runs: the same seed reproduces byte-identical per-mode breakdown totals", () => {
        const runFor = (modeId: string) => {
            const {session} = createDeterministicBetModeSession();
            const runner = new AggregateSimulationRunner(session, ROUNDS, undefined, undefined, new FixedBetModeForNextSimulationRoundSetting(modeId));
            runner.run();
            return runner.getBreakdownStatistics();
        };

        expect(runFor("ante")).toEqual(runFor("ante"));
        expect(runFor("buy-bonus")).toEqual(runFor("buy-bonus"));
    });

    it("base vs ante vs buy-bonus produce genuinely different totalBet for the same seed and round count", () => {
        const baseBreakdown = (() => {
            const {session} = createDeterministicBetModeSession();
            const runner = new AggregateSimulationRunner(session, ROUNDS, undefined, undefined, new FixedBetModeForNextSimulationRoundSetting("base"));
            runner.run();
            return runner.getBreakdownStatistics()!;
        })();
        const anteBreakdown = (() => {
            const {session} = createDeterministicBetModeSession();
            const runner = new AggregateSimulationRunner(session, ROUNDS, undefined, undefined, new FixedBetModeForNextSimulationRoundSetting("ante"));
            runner.run();
            return runner.getBreakdownStatistics()!;
        })();
        const buyBreakdown = (() => {
            const {session} = createDeterministicBetModeSession();
            const runner = new AggregateSimulationRunner(
                session,
                ROUNDS,
                undefined,
                undefined,
                new FixedBetModeForNextSimulationRoundSetting("buy-bonus"),
            );
            runner.run();
            return runner.getBreakdownStatistics()!;
        })();

        const totalBet = (breakdown: Record<string, {totalBet: number}>) =>
            Object.values(breakdown).reduce((sum, component) => sum + component.totalBet, 0);

        const baseTotal = totalBet(baseBreakdown);
        const anteTotal = totalBet(anteBreakdown);
        const buyTotal = totalBet(buyBreakdown);

        expect(anteTotal).toBeGreaterThan(baseTotal);
        expect(buyTotal).toBeGreaterThan(anteTotal);
        expect(anteTotal).toBeCloseTo(baseTotal * 1.25, 10);
    });
});
