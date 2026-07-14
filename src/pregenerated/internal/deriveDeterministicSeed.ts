import crypto from "crypto";

// Turns an arbitrary string seed plus a round index into the one 32-bit numeric seed
// SeededWeightedOutcomeRandomSource actually consumes — shared between PreGeneratedSpinCommandHandler
// (the live command path) and PreGeneratedRoundReplayer (the pure reconstruction path), so replaying a
// (seed, round) pair always reproduces the exact same draw the server made when that round was
// originally played. Hashing (rather than e.g. concatenating char codes) keeps nearby seeds/rounds
// from producing correlated numeric seeds.
export function deriveDeterministicSeed(seed: string, round: number): number {
    const digest = crypto.createHash("sha256").update(`${seed}:${round}`).digest();
    return digest.readUInt32BE(0);
}
