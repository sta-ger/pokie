// Thrown synchronously by PokieDevServer's constructor when a configured preGeneratedOutcomeLibrary's
// own provenance (every outcome's artifact.provenance.game, guaranteed identical across the whole
// library by buildWeightedOutcomeLibrary's own homogeneity check) doesn't match the loaded PokieGame's
// manifest — e.g. a library built for a different game, or for an older/newer version of this one,
// accidentally wired into this server. The server never starts serving requests in that case: the
// mismatch is a configuration error to fix, not something a caller should discover mid-round.
export class PreGeneratedLibraryProvenanceMismatchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PreGeneratedLibraryProvenanceMismatchError";
    }
}
