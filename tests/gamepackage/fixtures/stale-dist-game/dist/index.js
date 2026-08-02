// Simulates a stale build: this compiled file still requires a dependency that isn't installed
// here (e.g. it was never `npm install`-ed, or was removed from package.json since the last build).
require("totally-nonexistent-pokie-fixture-dependency-xyz");

module.exports = {
    getManifest() {
        return {id: "stale-dist-game", name: "Stale Dist Game", version: "1.0.0"};
    },
    createSession() {
        return {};
    },
};
