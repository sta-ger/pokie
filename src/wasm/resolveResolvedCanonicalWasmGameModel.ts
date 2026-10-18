import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {assertDeclarativeWasmBlueprint, normalizeResolvedWasmBlueprint} from "./DeclarativeWasmModel.js";
import {resolveSharedSlotMathModel} from "../generated/resolveSharedSlotMathModel.js";
import {assertPlayableSharedSlotMathModel} from "./math/SharedSlotMath.js";
import type {PokieWasmGameModel} from "./PokieWasmCanonicalModule.js";

/** Resolved declarative input only. Node's authoring adapter owns procedural materialization. */
export function resolveResolvedCanonicalWasmGameModel(input: GameBlueprint): PokieWasmGameModel {
    const blueprint = normalizeResolvedWasmBlueprint(input);
    assertDeclarativeWasmBlueprint(blueprint);
    const strips = blueprint.reelSequences?.map(reel => reel.type === "exact" ? reel.symbols : reel.variants[0].symbols) ?? blueprint.reelStrips ?? [];
    if (strips.length !== blueprint.reels || strips.some((strip) => strip === undefined || strip.length === 0)) throw new Error(`Blueprint "${blueprint.manifest.id}" cannot materialize one executable strip per reel for the canonical WASM model.`);
    const model = resolveSharedSlotMathModel(blueprint);
    assertPlayableSharedSlotMathModel(model);
    return blueprint.screenGeometry || blueprint.reelSequences || blueprint.betModes?.length || Object.values(blueprint.mechanics ?? {}).some(value => value !== undefined)
        ? {...model, features: {schemaVersion: "pokie.features.v1", blueprint}} : model;
}
