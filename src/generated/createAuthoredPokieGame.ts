import {GameBlueprintValidator} from "./GameBlueprintValidator.js";
import type {GameBlueprint} from "./GameBlueprint.js";
import {createAuthoredSession} from "./createAuthoredSession.js";
import {computeGameBlueprintHash} from "./computeGameBlueprintHash.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {SharedSlotMathPool} from "../wasm/math/internal/SharedSlotMathPool.js";

/**
 * Executable, data-backed game surface for an authored GameBlueprint -- the unrestricted counterpart to
 * createTunableBlueprintGame() (that helper deliberately narrows the model to the subset the paytable
 * tuner can search). Used by Studio's draft math preview and by local math analysis, where the caller
 * needs the real authored runtime (free games, bet modes, etc.) rather than a tuning-only projection.
 *
 * The returned game owns one shared math pool; release() disposes it after every session using this
 * game has been destroyed. Exact enumeration is feature-detected by the authored runtime itself: a
 * stateful mechanic that cannot enumerate forced reel stops will throw from
 * createExactEnumerationSession(), which callers must treat as "exact analysis unavailable", not as a
 * reason to fall back to a sampled estimate silently.
 */
export function createAuthoredPokieGame(blueprint: GameBlueprint): PokieGame {
    const errors = new GameBlueprintValidator().validate(blueprint).filter((issue) => issue.severity === "error");
    if (errors.length) throw new Error(errors.map((issue) => issue.message).join("; "));

    const sharedMathPool = new SharedSlotMathPool();
    return {
        release: () => {
            sharedMathPool.dispose();
            return Promise.resolve();
        },
        getInfo: () => blueprint.info,
        getConfigHash: () => computeGameBlueprintHash(blueprint),
        createSession: (context) =>
            createAuthoredSession(blueprint, new SeededRandomNumberGenerator(context?.seed ?? 0), undefined, sharedMathPool).session,
        createExactEnumerationSession: (forced) =>
            createAuthoredSession(blueprint, new SeededRandomNumberGenerator(0), forced, sharedMathPool).session,
    };
}
