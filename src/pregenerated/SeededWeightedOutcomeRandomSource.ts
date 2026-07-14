import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";

// The largest raw draw space this class produces without losing precision: two 32-bit mulberry32
// outputs combined bit-for-bit span exactly 2^53, the JS safe-integer limit (Number.MAX_SAFE_INTEGER
// === 2^53 - 1) — see nextRaw().
const RAW_SPACE = 0x20000000000000; // 2^53

// Deterministic PRNG (mulberry32) for reproducible outcome selection — the same numeric seed always
// produces the same sequence of draws, which is what makes PreGeneratedRoundReplayer's reconstruction
// of a past round exact rather than best-effort. Not cryptographically secure; use a secure random
// source in production.
//
// nextInt() draws an exact, unbiased integer via rejection sampling: a raw value is drawn from a fixed
// 2^53-wide space, and any draw landing in the "leftover" remainder (RAW_SPACE % exclusiveUpperBound)
// is discarded and redrawn — without this, `raw % exclusiveUpperBound` would slightly favor the
// smaller remainders whenever exclusiveUpperBound doesn't evenly divide the raw space, a bias that
// silently skews outcome probabilities in a weighted library. This is what "exact" means here: not an
// approximation of uniformity, but a guarantee of it.
export class SeededWeightedOutcomeRandomSource implements WeightedOutcomeRandomSource {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    public nextInt(exclusiveUpperBound: number): number {
        if (!Number.isSafeInteger(exclusiveUpperBound) || exclusiveUpperBound <= 0) {
            throw new RangeError(`exclusiveUpperBound must be a positive safe integer, got ${exclusiveUpperBound}.`);
        }
        if (exclusiveUpperBound > RAW_SPACE) {
            throw new RangeError(`exclusiveUpperBound must be <= ${RAW_SPACE}, got ${exclusiveUpperBound}.`);
        }
        if (exclusiveUpperBound === 1) {
            return 0;
        }

        const limit = RAW_SPACE - (RAW_SPACE % exclusiveUpperBound);
        let raw: number;
        do {
            raw = this.nextRaw();
        } while (raw >= limit);
        return raw % exclusiveUpperBound;
    }

    // Combines two independent 32-bit draws into one uniformly distributed over [0, 2^53): 32 bits from
    // one draw plus 21 bits (masked) from the other span exactly 53 bits, the full width JS numbers can
    // represent exactly.
    private nextRaw(): number {
        const low = this.next32();
        const high = this.next32() & 0x1fffff;
        return high * 0x100000000 + low;
    }

    private next32(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) >>> 0;
    }
}
