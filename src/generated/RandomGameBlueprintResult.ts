import type {GameBlueprint} from "./GameBlueprint.js";
import type {RandomGameBlueprintProvenance} from "./RandomGameBlueprintProvenance.js";

export type RandomGameBlueprintResult = {
    readonly blueprint: GameBlueprint;
    // The seed actually used -- echoes back the caller's own seed unchanged, or the one this call
    // minted for itself when none was given, so an unseeded run can still be reproduced afterward.
    // Duplicated on `provenance.seed`; kept here too so the common case (seed only, no audit trail)
    // doesn't need to reach into provenance.
    readonly seed: number;
    readonly provenance: RandomGameBlueprintProvenance;
};
