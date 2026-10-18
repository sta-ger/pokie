import {resolveResolvedCanonicalWasmGameModel} from "./resolveResolvedCanonicalWasmGameModel.js";
import {normalizeResolvedWasmBlueprint} from "./DeclarativeWasmModel.js";
import {materializeReelStrips} from "../generated/materializeReelStrips.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {PokieWasmGameModel} from "./PokieWasmCanonicalModule.js";

/** The one Blueprint-to-portable-model boundary used by preview, validation, and publication. */
export function resolveCanonicalWasmGameModel(blueprint: GameBlueprint): PokieWasmGameModel {
    const resolution = resolveReelStripGeneration(blueprint);
    if (!resolution.success) {
        const failedReels = resolution.reels.filter((reel) => !reel.success).map((reel) => `reel ${reel.reelIndex}: ${reel.diagnostics.flatMap((diagnostic) => diagnostic.violations.map((violation) => violation.message)).join("; ")}`).join(" | ");
        throw new Error(`Blueprint "${blueprint.manifest.id}" cannot materialize its generated reel strips for the canonical WASM model. ${failedReels || "Fix reelStripGeneration and rebuild."}`);
    }
    let materialized: GameBlueprint;
    try {
        materialized = normalizeResolvedWasmBlueprint(materializeReelStrips(blueprint, resolution.reelStripGeneration));
    } catch (error) {
        throw new Error(`Blueprint "${blueprint.manifest.id}" cannot materialize its reel strips for the canonical WASM model. ${error instanceof Error ? error.message : String(error)} Next: use valid literal/generated strips or repair the authored symbol weights.`);
    }
    return resolveResolvedCanonicalWasmGameModel(materialized);
}
