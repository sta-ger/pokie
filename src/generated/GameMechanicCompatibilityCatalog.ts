import type {GameMechanicFeature} from "./GameMechanicFeature.js";

// One entry = one full set of GameMechanicFeature values that may safely appear together, as declared
// by a single RandomGameBlueprintStrategy (see RandomGameBlueprintStrategy.features). Order within an
// entry doesn't matter -- DefaultGameMechanicCompatibilityPolicy compares by membership, not sequence.
export type GameMechanicCompatibilityCatalogEntry = readonly GameMechanicFeature[];

// Known-safe combinations only -- deliberately not every subset of ALL_GAME_MECHANIC_FEATURES, and
// growing only as strategies are built and proven to respect each entry's constraints:
//   - ["paylines"] / ["winModel"] are each safe alone, but never together in one entry: setting both
//     "paylines" and a "winModel" of "ways"/"clusters" on the same blueprint makes GameBlueprintValidator
//     emit "blueprint-winmodel-paylines-ignored" (ways/cluster wins ignore paylines entirely), so a
//     strategy that could produce that combination on a single blueprint is never compatible.
//   - "reelStrips" only changes how symbols land on the reels, independent of how a win is evaluated, so
//     it freely combines with either "paylines" or "winModel".
//   - ["paylines", "reelStrips", "winModel"] looks like it contradicts the first rule, but it doesn't:
//     it exists only for RandomGameBlueprintVariantStrategy, which declares exactly this set because it
//     *can* produce any of paylines/ways/clusters across different builds, while still guaranteeing --
//     structurally, in its own build() -- that "paylines" and "winModel" are never both set on the same
//     blueprint (see that class's own doc comment). The catalog trusts that guarantee; it does not (and
//     cannot) re-verify it per build.
//   - ["reelStripGeneration"] alone is DefaultRandomGameBlueprintStrategy's own entry: it only ever
//     expresses its reel weighting as per-reel generated strips, never a flat "symbolWeights" or a
//     literal "reelStrips", so it needs no combination with anything else.
export const DEFAULT_GAME_MECHANIC_COMPATIBILITY_CATALOG: readonly GameMechanicCompatibilityCatalogEntry[] = [
    [],
    ["paylines"],
    ["winModel"],
    ["reelStrips"],
    ["paylines", "reelStrips"],
    ["reelStrips", "winModel"],
    ["paylines", "reelStrips", "winModel"],
    ["reelStripGeneration"],
];
