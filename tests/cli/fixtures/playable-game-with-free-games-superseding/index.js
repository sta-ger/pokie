// A distinct project root for PC-12's public project-switch exercise. Resolve the currently running
// candidate package directly, because Home Open Project materializes this fixture independently and
// therefore cannot rely on a sibling fixture's Node resolution path.
const {
    PC_12_FEATURED_ROUND_SEED,
    PC_12_FREE_GAMES_FIXTURE_ID,
    createPc12FreeGamesFixtureSession,
    VideoSlotWithFreeGamesSessionSerializer,
} = require(process.cwd());

module.exports = {
    getManifest() {
        return {id: PC_12_FREE_GAMES_FIXTURE_ID, name: "PC-12 Deterministic Free Games Fixture", version: "1.0.0"};
    },
    createSession() {
        return createPc12FreeGamesFixtureSession(PC_12_FEATURED_ROUND_SEED);
    },
    getSessionSerializer() {
        return new VideoSlotWithFreeGamesSessionSerializer();
    },
};
