import crypto from "crypto";
import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";

// Cryptographically secure WeightedOutcomeRandomSource for production use — the counterpart to
// SecureRandomNumberGenerator. Not reproducible by design; use SeededWeightedOutcomeRandomSource for
// replay/regression scenarios instead.
export class SecureWeightedOutcomeRandomSource implements WeightedOutcomeRandomSource {
    public nextUnitInterval(): number {
        return crypto.randomInt(0, 4294967296) / 4294967296;
    }
}
