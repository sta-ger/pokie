import type {WeightedOutcome} from "./WeightedOutcome.js";

// Tracks this type's own shape (not the pokie package version) — bump when WeightedOutcomeLibrary's fields
// change, same convention as ROUND_ARTIFACT_SCHEMA_VERSION/GAME_BLUEPRINT_SCHEMA_VERSION.
export const WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION = 1;

// A canonical, hashable, storage/audit-grade enumeration of every distinct possible round outcome a math model
// can produce, each carrying its own probability weight — the "no Monte Carlo" counterpart to `Simulation`'s
// sampling-based RTP/volatility estimates (see docs/simulation.md): given a complete, correctly-weighted
// library, `WeightedOutcomeLibraryAnalyzer` computes exact statistics instead of approximating them by sampling.
// Built directly from already-computed RoundArtifacts (see buildWeightedOutcomeLibrary), never from a second
// calculation path.
//
// Deeply readonly and deeply frozen at build time — every nested value (each outcome, and each outcome's own
// RoundArtifact) is immutable, and mutating any of it afterward throws.
export type WeightedOutcomeLibrary<T extends string | number = string> = {
    readonly schemaVersion: number;
    readonly libraryId: string;
    readonly outcomes: readonly WeightedOutcome<T>[];
};
