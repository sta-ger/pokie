import type {GameMechanicCompatibilityPolicy} from "./GameMechanicCompatibilityPolicy.js";
import type {GameMechanicFeature} from "./GameMechanicFeature.js";

// Conservative default: the only combination this policy currently knows to be safe is the empty
// one -- the baseline reels/rows/symbols/paytable/symbolWeights line-pay shape every strategy in this
// package still produces (see DefaultRandomGameBlueprintStrategy's own doc comment for exactly why
// that shape is guaranteed to validate cleanly). A strategy that wants to add a mechanic feature on
// top needs a policy that actually knows the combination is safe -- this one deliberately rejects all
// of them rather than guessing.
export class DefaultGameMechanicCompatibilityPolicy implements GameMechanicCompatibilityPolicy {
    public isCompatible(features: readonly GameMechanicFeature[]): boolean {
        return features.length === 0;
    }
}
