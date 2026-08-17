/*
 * Verification-only playable package.  It uses Pokie's public game/session
 * interfaces and gives the Studio Play UI three concrete modes to exercise:
 * base (1x), ante (1.25x, persistent), and buyFeature (50x, one-shot).
 */
const {
    BetModeDefinition,
    BetModesConfig,
    FreeGamesForcedFeatureEntryHandler,
    SymbolsCombinationsGenerator,
    VideoSlotWinCalculator,
    VideoSlotWithBetModesSession,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesSession,
// This fixture is nested below the candidate worktree rather than installed as
// a standalone dependency, so resolve the candidate package through its public
// package root just as a locally linked game would.
} = require("../../../../..");

function createConfig() {
    const config = new VideoSlotWithFreeGamesConfig();
    // The purchased feature is the sole free-games source, making the buy
    // lifecycle bounded and observable instead of dependent on random scatters.
    for (const scatter of config.getScatterSymbols()) {
        for (let count = 0; count <= config.getReelsNumber() * config.getReelsSymbolsNumber(); count += 1) {
            config.setFreeGamesForScatters(scatter, count, 0);
        }
    }
    return config;
}

module.exports = {
    getManifest() {
        return {id: "p6-09-mode-semantics", name: "P6-09 Mode Semantics", version: "1.0.0"};
    },
    createSession() {
        const config = createConfig();
        const base = new VideoSlotWithFreeGamesSession(
            config,
            new SymbolsCombinationsGenerator(config),
            new VideoSlotWinCalculator(config),
        );
        return new VideoSlotWithBetModesSession(
            base,
            new BetModesConfig(
                [
                    new BetModeDefinition("base"),
                    new BetModeDefinition("ante", {stakeMultiplier: 1.25}),
                    new BetModeDefinition("buyFeature", {stakeMultiplier: 50, forcesFeatureEntry: true}),
                ],
                "base",
            ),
            new FreeGamesForcedFeatureEntryHandler(1),
        );
    },
    getSessionSerializer() {
        // Studio's Play controls intentionally consume only the game serializer's
        // public projection.  Publish the actual mode-capable session fields so
        // this package exercises that public contract rather than a private view.
        const project = (session) => ({
            availableBets: session.getAvailableBets(),
            bet: session.getBet(),
            availableBetModeIds: session.getAvailableBetModeIds(),
            betModeId: session.getBetModeId(),
        });
        return {getInitialData: project, getRoundData: project};
    },
};
