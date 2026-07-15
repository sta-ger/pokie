import crypto from "crypto";
import {drawUnbiasedInt} from "./internal/drawUnbiasedInt.js";
import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";

// Cryptographically secure WeightedOutcomeRandomSource for production use — the counterpart to
// SecureRandomNumberGenerator. Not reproducible by design; use SeededWeightedOutcomeRandomSource for
// replay/regression scenarios instead.
//
// Draws raw bytes from crypto.randomBytes and reduces them to an unbiased integer via the same
// rejection-sampling core SeededWeightedOutcomeRandomSource uses (see drawUnbiasedInt), rather than
// crypto.randomInt: that built-in is itself unbiased, but only within its own supported range
// (max - min < 2^48) — a library whose total weight exceeds that (e.g. a fine-grained reel-combination
// count in the billions) would silently be out of reach. drawUnbiasedInt supports any exclusiveUpperBound
// up to Number.MAX_SAFE_INTEGER + 1 (2^53), so this class does too.
export class SecureWeightedOutcomeRandomSource implements WeightedOutcomeRandomSource {
    public nextInt(exclusiveUpperBound: number): number {
        return drawUnbiasedInt(exclusiveUpperBound, (byteCount) => crypto.randomBytes(byteCount));
    }
}
