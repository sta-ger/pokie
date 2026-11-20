const {
    STUDIO_FIXTURE_SEED,
    STUDIO_FIXTURE_GAME_ID,
    createStudioFixtureGameSession,
    VideoSlotWithFreeGamesSessionSerializer,
} = require("@fromstan/pokie");

// The Studio half of the Studio/browser runner. The examples fixture imports the same public factory,
// so a featured round is one game contract and one seed rather than two coincidentally similar games.
module.exports = {
    getInfo() {
        return {id: STUDIO_FIXTURE_GAME_ID, name: "Studio Fixture Game", version: "1.0.0"};
    },
    getSessionCommandCapabilities() {
        return {bets: [5, 10]};
    },
    getSessionStateSchema() {
        return {kind: "free-games", base: {kind: "seeded-video-slot"}};
    },
    createSession() {
        // The fixture compares a named deterministic fixture round. Studio's optional UI seed is not
        // part of this fixture's identity, so every prepared session starts at that same contract.
        return createStudioFixtureGameSession(STUDIO_FIXTURE_SEED);
    },
    // Studio must consume the same VideoSlot wire projection as the installed examples fixture.
    // Without this hook it falls back to the generic serializer, which loses player choices and
    // makes a settled RoundRecord screen semantically different from its pre-spin session.
    getSessionSerializer() {
        return new VideoSlotWithFreeGamesSessionSerializer();
    },
};
