import crypto from "crypto";
import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";

// Cryptographically secure WeightedOutcomeRandomSource for production use — the counterpart to
// SecureRandomNumberGenerator. Not reproducible by design; use SeededWeightedOutcomeRandomSource for
// replay/regression scenarios instead. Delegates directly to crypto.randomInt, which is itself already
// exact/unbiased (rejection sampling internally) — no float conversion or modulo involved.
export class SecureWeightedOutcomeRandomSource implements WeightedOutcomeRandomSource {
    public nextInt(exclusiveUpperBound: number): number {
        return crypto.randomInt(0, exclusiveUpperBound);
    }
}
