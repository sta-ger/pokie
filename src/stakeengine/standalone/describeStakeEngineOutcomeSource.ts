import type {CanonicalOutcomeSourceDescriptor} from "../../pregenerated/CanonicalOutcomeSourceDescriptor.js";

// The canonical-outcome-source metadata for an arbitrary Stake Engine outcome directory — see
// CanonicalOutcomeSourceDescriptor's own doc comment for why this exists as an explicit, machine-readable fact
// rather than something a caller infers from StakeEngineOutcomeSourceReading's own single readFromDirectory()
// method. `streaming: false` because StakeEngineOutcomeSourceReader reads an entire mode's own lookup CSV and
// zstd-compressed books into memory in one pass -- there is no per-outcome, byte-range read the way a native
// outcome-library bundle's own index supports (see that reader's own doc comment). A plain function, not a
// class, since this fact never varies per directory/mode: every Stake Engine outcome directory's own reader
// makes the identical promise.
export function describeStakeEngineOutcomeSource(): CanonicalOutcomeSourceDescriptor {
    return {
        kind: "stakeEngine",
        streaming: false,
        limitations: [
            "Reads an entire mode's own lookup CSV and books into memory at once, never a single-outcome random-access read.",
            "Normalizes verbatim Stake Engine events into StakeEngineOutcomeRecord -- never reconstructs a RoundArtifact-shaped step model or a pokie-manifest.json provenance record (see StakeEngineOutcomeRecord's own doc comment).",
            "Never re-derives or recovers the game model/blueprint that produced these outcomes.",
        ],
    };
}
