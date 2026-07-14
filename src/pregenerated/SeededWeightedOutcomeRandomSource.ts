import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";

// Deterministic PRNG (mulberry32, same algorithm as SeededRandomNumberGenerator) for reproducible
// outcome selection — the same numeric seed always produces the same sequence of draws, which is what
// makes PreGeneratedRoundReplayer's reconstruction of a past round exact rather than best-effort. Not
// cryptographically secure; use a secure random source in production.
export class SeededWeightedOutcomeRandomSource implements WeightedOutcomeRandomSource {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    public nextUnitInterval(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}
