const {
    PC_12_FEATURED_ROUND_SEED,
    PC_12_FREE_GAMES_FIXTURE_ID,
    createPc12FreeGamesFixtureSession,
} = require("pokie");

// The Studio half of PC-12's browser runner. The examples fixture imports the same public factory,
// so a featured round is one game contract and one seed rather than two coincidentally similar games.
module.exports = {
    getManifest() {
        return {id: PC_12_FREE_GAMES_FIXTURE_ID, name: "PC-12 Deterministic Free Games Fixture", version: "1.0.0"};
    },
    createSession() {
        // PC-12 compares a named deterministic fixture round. Studio's optional UI seed is not
        // part of this fixture's identity, so every prepared session starts at that same contract.
        return createPc12FreeGamesFixtureSession(PC_12_FEATURED_ROUND_SEED);
    },
};
