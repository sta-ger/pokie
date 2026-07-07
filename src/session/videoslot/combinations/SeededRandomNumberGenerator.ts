import {RandomNumberGenerating} from "pokie";

// Deterministic PRNG (mulberry32) for reproducible spins — same seed always produces the same
// sequence of draws. Useful for replaying/debugging a specific round, regression tests, and
// certification-style test suites that need a controlled, repeatable stream of outcomes. Not
// cryptographically secure and not a substitute for SecureRandomNumberGenerator in production.
export class SeededRandomNumberGenerator implements RandomNumberGenerating {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    public getRandomInt(min: number, max: number): number {
        return min + Math.floor(this.nextFloat() * (max - min));
    }

    private nextFloat(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}
