import type {RoundArtifact} from "./RoundArtifact.js";

// The canonical JSON projection of a RoundArtifact, stamped with its own content hash (see
// computeRoundArtifactHash) — what PokieJsonRoundArtifactProjector produces, and what a round-trip
// (JSON.stringify → JSON.parse → re-hash) is expected to reproduce byte-for-hash-identically.
export type RoundArtifactJson<T extends string | number = string> = RoundArtifact<T> & {
    readonly hash: string;
};
