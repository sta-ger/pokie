// The raw draw space every WeightedOutcomeRandomSource implementation reduces down to: 2^53, the
// largest power of two a JS number can represent every integer of exactly (Number.MAX_SAFE_INTEGER
// === 2^53 - 1). Built from 7 raw bytes: the low 6 bytes (48 bits, via Buffer.readUIntBE — which
// itself only supports up to 6 bytes/48 bits, hence the split) plus 5 bits masked off the 7th byte,
// 48 + 5 = 53 bits exactly, combined via plain multiplication/addition rather than bitwise operators
// (JS's `<<`/`|` coerce to 32-bit signed integers, unusable much past 2^31) or BigInt (unavailable as
// literal syntax at this package's compilation target). This reduction is lossless/unbiased on its own
// — 2^56 (7 full bytes) is an exact multiple of 2^53, and masking a uniform source down to fewer bits
// preserves uniformity — the actual non-power-of-two bias (whatever exclusiveUpperBound the caller
// asked for) is handled entirely by the rejection-sampling loop in drawUnbiasedInt below.
const RAW_SPACE = Number.MAX_SAFE_INTEGER + 1; // 2^53
const LOW_BYTE_COUNT = 6; // 48 bits — the most Buffer.readUIntBE supports in one call
const HIGH_BYTE_MASK = 0x1f; // 5 bits
const HIGH_BYTE_MULTIPLIER = 2 ** 48;

// The shared unbiased-integer-draw core behind both SeededWeightedOutcomeRandomSource and
// SecureWeightedOutcomeRandomSource: neither one hand-rolls its own rejection-sampling loop, so the
// two can never silently drift apart on what "unbiased" means. `nextBytes` is the only thing that
// differs between them — a deterministic hash-counter stream for the seeded source, crypto.randomBytes
// for the secure one — everything else (the raw draw space, the byte-to-integer reduction, the
// rejection-sampling comparison against exclusiveUpperBound) is identical and lives here exactly once.
//
// Draws an exact, unbiased integer in [0, exclusiveUpperBound) for any exclusiveUpperBound up to 2^53,
// not just powers of two: `raw % exclusiveUpperBound` alone would slightly favor the smaller
// remainders whenever exclusiveUpperBound doesn't evenly divide RAW_SPACE — rejecting any draw that
// lands in that "leftover" remainder and redrawing is what removes that bias entirely rather than
// merely shrinking it.
export function drawUnbiasedInt(exclusiveUpperBound: number, nextBytes: (byteCount: number) => Buffer): number {
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
        raw = rawFromBytes(nextBytes(1 + LOW_BYTE_COUNT));
    } while (raw >= limit);
    return raw % exclusiveUpperBound;
}

function rawFromBytes(bytes: Buffer): number {
    const high = bytes[0] & HIGH_BYTE_MASK;
    const low = bytes.readUIntBE(1, LOW_BYTE_COUNT);
    return high * HIGH_BYTE_MULTIPLIER + low;
}
