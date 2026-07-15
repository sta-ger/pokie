import crypto from "crypto";
import {drawUnbiasedInt} from "./internal/drawUnbiasedInt.js";
import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";

// Deterministic RNG for reproducible outcome selection — the same string seed always produces the
// same sequence of draws, which is what makes PreGeneratedRoundReplayer's reconstruction of a past
// round exact rather than best-effort. Takes the seed as a plain string, in full, never folded down
// into a single 32-bit integer first: a hash-then-truncate step would throw away almost all of a
// SHA-256 digest's own entropy and reintroduce a birthday-bound collision risk across different
// (seed, round) pairs a full string seed simply doesn't have.
//
// Built as a small hash-counter DRBG: block #0/#1/#2/... of the output stream are each
// SHA-256(`${seed}:${counter}`), concatenated on demand into an arbitrarily long byte stream —
// standard, unlimited-length deterministic output from a fixed-size hash, the same idea HMAC-DRBG
// generalizes. nextInt() draws unbiased integers from that stream via the same rejection-sampling core
// SecureWeightedOutcomeRandomSource uses (see drawUnbiasedInt) — exact and unbiased for any bound up
// to Number.MAX_SAFE_INTEGER + 1 (2^53), not just powers of two, and not just the low 32 bits a
// mulberry32-style generator would have been limited to.
//
// Not cryptographically secure by construction guarantee (SHA-256 in counter mode is a reasonable PRF
// in practice, but this class makes no formal claim) — use SecureWeightedOutcomeRandomSource in
// production.
export class SeededWeightedOutcomeRandomSource implements WeightedOutcomeRandomSource {
    private readonly seed: string;
    private counter = 0;
    private buffer: Buffer = Buffer.alloc(0);

    constructor(seed: string) {
        this.seed = seed;
    }

    public nextInt(exclusiveUpperBound: number): number {
        return drawUnbiasedInt(exclusiveUpperBound, (byteCount) => this.nextBytes(byteCount));
    }

    // Fills the internal buffer with as many SHA-256(`${seed}:${counter}`) blocks as needed to satisfy
    // `count`, then slices exactly `count` bytes off the front — so a caller asking for bytes across a
    // block boundary transparently gets the next block's bytes too, with no gap or repeat.
    private nextBytes(count: number): Buffer {
        while (this.buffer.length < count) {
            const block = crypto.createHash("sha256").update(`${this.seed}:${this.counter}`).digest();
            this.counter++;
            this.buffer = Buffer.concat([this.buffer, block]);
        }
        const bytes = this.buffer.subarray(0, count);
        this.buffer = this.buffer.subarray(count);
        return bytes;
    }
}
