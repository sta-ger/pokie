import type {PokieGame} from "../../../gamepackage/PokieGame.js";
import {releasePokieGame} from "../../../gamepackage/loadPokieGame.js";

/** The invocation owns both game resources and the loader lease, including injected/recipe games. */
export async function releaseSimulationGame(game: PokieGame): Promise<void> {
    const failures: unknown[] = [];
    try {
        await game.release?.();
    } catch (error) {
        failures.push(error);
    }
    try {
        await releasePokieGame(game);
    } catch (error) {
        failures.push(error);
    }
    if (failures.length) throw new Error(`Simulation runtime cleanup failed: ${failures.map(String).join("; ")}`);
}
