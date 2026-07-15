// Turns a session's own string seed plus a round index into the one per-round seed
// SeededWeightedOutcomeRandomSource actually consumes — shared between PreGeneratedSpinCommandHandler
// (the live command path) and PreGeneratedRoundReplayer (the pure reconstruction path), so replaying a
// (seed, round) pair always reproduces the exact same draw the server made when that round was
// originally played.
//
// No hashing happens here — SeededWeightedOutcomeRandomSource already hashes its own seed internally
// (SHA-256 in counter mode, see its own doc comment), so pre-hashing here would only throw away
// information for no benefit. Plain concatenation is enough: `round` is always appended as its own
// trailing `:${round}` segment, so two different rounds of the same session always produce two
// distinct combined strings, and the RNG's own per-seed hash stream is exactly as sensitive to that
// string as it would be to any other seed.
export function deriveDeterministicSeed(seed: string, round: number): string {
    return `${seed}:${round}`;
}
