import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import type {GameMechanicFeature} from "./GameMechanicFeature.js";
import type {RandomGameBlueprintMechanics} from "./RandomGameBlueprintMechanics.js";

// The mechanic-bearing part of a randomly generated blueprint: reels/rows/symbols/paytable/
// symbolWeights/availableBets -- everything RandomGameBlueprintGenerator doesn't already own itself
// (naming, manifest, provenance). Swap this out via RandomGameBlueprintGenerator's constructor to
// change the generated mechanics without touching naming or provenance.
export interface RandomGameBlueprintStrategy {
    // Stable identifier recorded on RandomGameBlueprintResult.provenance.strategy -- not a class name,
    // which minification/bundling can rename.
    readonly name: string;

    // Declares, independent of any particular `random` draw, which optional GameBlueprint areas this
    // strategy can ever populate. Checked once against GameMechanicCompatibilityPolicy when the
    // generator is constructed, so an incompatible strategy is rejected before it ever runs.
    readonly features: readonly GameMechanicFeature[];

    build(random: RandomNumberGenerating): RandomGameBlueprintMechanics;
}
