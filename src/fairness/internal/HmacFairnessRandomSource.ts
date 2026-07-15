import crypto from "crypto";
import {drawUnbiasedInt} from "../../pregenerated/internal/drawUnbiasedInt.js";
import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";

// The deterministic byte stream behind every Provably Fair proof (see POKIE_FAIRNESS_ALGORITHM_VERSION): block
// #0/#1/#2/... of the output stream are each HMAC-SHA256(key=serverSeed, `${clientSeed}:${nonce}:${counter}`),
// concatenated on demand — the same hash-counter DRBG shape SeededWeightedOutcomeRandomSource already uses for
// pre-generated rounds, HMAC instead of a plain hash specifically because HMAC keys the *whole stream* on the
// still-secret-until-reveal serverSeed rather than folding it into the message alongside clientSeed/nonce:
// nobody — not even someone who already knows clientSeed/nonce, both public before the round is played — can
// predict a single byte of this stream before serverSeed itself is revealed. That's exactly the property a
// commit-reveal scheme needs (see FairnessCommitment's own doc comment): committing to serverSeedHash alone,
// before clientSeed/nonce are even combined with it, is only meaningful if the resulting stream is unpredictable
// without serverSeed.
//
// nextInt() draws unbiased integers from that stream via the same rejection-sampling core (drawUnbiasedInt)
// every other WeightedOutcomeRandomSource in this codebase shares, so this plugs straight into
// WeightedOutcomeSelector/OutcomeLibraryBundleReading.drawOutcome unmodified — never a second, differently-
// derived selection algorithm for a fairness proof's own draw.
export class HmacFairnessRandomSource implements WeightedOutcomeRandomSource {
    private readonly serverSeed: string;
    private readonly clientSeed: string;
    private readonly nonce: number;
    private counter = 0;
    private buffer: Buffer = Buffer.alloc(0);

    constructor(serverSeed: string, clientSeed: string, nonce: number) {
        this.serverSeed = serverSeed;
        this.clientSeed = clientSeed;
        this.nonce = nonce;
    }

    public nextInt(exclusiveUpperBound: number): number {
        return drawUnbiasedInt(exclusiveUpperBound, (byteCount) => this.nextBytes(byteCount));
    }

    // Fills the internal buffer with as many HMAC-SHA256 blocks as needed to satisfy "count", then slices
    // exactly "count" bytes off the front — so a caller asking for bytes across a block boundary transparently
    // gets the next block's bytes too, with no gap or repeat (same buffering discipline as
    // SeededWeightedOutcomeRandomSource.nextBytes).
    private nextBytes(count: number): Buffer {
        while (this.buffer.length < count) {
            const block = crypto
                .createHmac("sha256", this.serverSeed)
                .update(`${this.clientSeed}:${this.nonce}:${this.counter}`)
                .digest();
            this.counter++;
            this.buffer = Buffer.concat([this.buffer, block]);
        }
        const bytes = this.buffer.subarray(0, count);
        this.buffer = this.buffer.subarray(count);
        return bytes;
    }
}
