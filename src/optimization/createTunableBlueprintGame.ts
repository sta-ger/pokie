import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {createAuthoredSession} from "../generated/createAuthoredSession.js";
import {computeGameBlueprintHash} from "../generated/computeGameBlueprintHash.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";

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
    const disposers: (() => void)[] = [];
    const create: typeof createAuthoredSession = (...args) => {
        const owned = createAuthoredSession(...args);
        disposers.push(owned.dispose);
        return owned;
    };
    return {
        release: () => {
            for (const dispose of disposers.splice(0)) dispose();
            return Promise.resolve();
        },
        getManifest: () => blueprint.manifest,
        getConfigHash: () => computeGameBlueprintHash(blueprint),
        createSession: (context) => create(blueprint, new SeededRandomNumberGenerator(context?.seed ?? 0)).session,
        createExactEnumerationSession: (forced) =>
            create(blueprint, new SeededRandomNumberGenerator(0), forced).session,
    };
}
