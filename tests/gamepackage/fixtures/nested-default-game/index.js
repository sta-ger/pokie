// Shaped the way Node's native ESM loader presents a tsc/esModuleInterop-compiled CJS module
// (`export default game;`) to `await import(...)`: the whole CJS `module.exports` (itself an
// object with a `default` property, from `exports.default = game`) becomes `.default` again.
// See loadPokieGame.ts for why this needs an extra unwrap.
module.exports = {
    __esModule: true,
    default: {
        __esModule: true,
        default: {
            getManifest() {
                return {id: "nested-default-game", name: "Nested Default Game", version: "1.0.0"};
            },
            createSession() {
                return {};
            },
        },
    },
};
