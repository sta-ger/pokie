import type {RoundArtifact} from "./RoundArtifact.js";

// A RoundArtifact is transport/storage-agnostic; a projector turns it into one concrete representation.
// PokieJsonRoundArtifactProjector is the standard, ready-made one (canonical JSON + content hash) — implement
// this directly for a different representation (e.g. a flat CSV row for a data warehouse) without touching
// RoundArtifact itself.
export interface RoundArtifactProjector<T extends string | number, TOutput> {
    project(artifact: RoundArtifact<T>): TOutput;
}
