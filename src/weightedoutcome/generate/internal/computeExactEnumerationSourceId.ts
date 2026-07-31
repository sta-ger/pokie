import crypto from "crypto";

// Deterministic identity for a single exact enumeration run -- everything an ExactEnumerationCheckpoint (see
// WeightedOutcomeLibraryGenerationCancelledError) needs to prove it was actually produced by THIS game/config's
// own sweep, not merely one that happens to share the same raw outcome-space size. Built from the inputs that
// actually determine which grids get accumulated and at what weight: the game's own id, its configHash (a
// different configuration of the same game can enumerate a completely different reel-stop space), and the
// concrete reel windows generation itself will sweep over (catches two games/configs whose reel SIZES match but
// whose actual symbol layout doesn't -- same outcome-space cardinality, incompatible grids). betMode/stake are
// deliberately excluded: they only affect artifact building for each already-accumulated grid, never which raw
// tuples exist or how they dedupe/weight.
export function computeExactEnumerationSourceId(gameId: string, configHash: string | undefined, reelWindows: readonly string[][][]): string {
    const material = JSON.stringify({gameId, configHash: configHash ?? null, reelWindows});
    return crypto.createHash("sha256").update(material).digest("hex");
}
