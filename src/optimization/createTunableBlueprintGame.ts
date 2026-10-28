import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {createAuthoredSession} from "../generated/createAuthoredSession.js";
import {computeGameBlueprintHash} from "../generated/computeGameBlueprintHash.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {SharedSlotMathPool} from "../wasm/math/internal/SharedSlotMathPool.js";

/** Executable data-backed package contract. Custom packages can implement the same contract themselves. */
export function createTunableBlueprintGame(blueprint: GameBlueprint): PokieGame {
    const errors = new GameBlueprintValidator().validate(blueprint).filter((issue) => issue.severity === "error");
    if (errors.length) throw new Error(errors.map((issue) => issue.message).join("; "));
    if (
        (!blueprint.reelStrips && !blueprint.reelSequences) ||
        blueprint.betModes?.length ||
        Object.entries(blueprint.mechanics ?? {}).some(([key, value]) => value !== undefined && key !== "freeGames")
    ) throw new Error(
        "Data-backed exact tuning requires finite authored base reels and simple spins or free-game paid entries.",
    );
    const sharedMathPool = new SharedSlotMathPool();
    return {
        release: () => {
            sharedMathPool.dispose();
            return Promise.resolve();
        },
        getManifest: () => blueprint.manifest,
        getConfigHash: () => computeGameBlueprintHash(blueprint),
        createSession: (context) => createAuthoredSession(blueprint, new SeededRandomNumberGenerator(context?.seed ?? 0), undefined, sharedMathPool).session,
        createExactEnumerationSession: (forced) =>
            createAuthoredSession(blueprint, new SeededRandomNumberGenerator(0), forced, sharedMathPool).session,
    };
}
