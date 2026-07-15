import type {PokieGameManifest} from "../../gamepackage/PokieGameManifest.js";
import type {WeightedOutcomeLibraryAnalysis} from "../WeightedOutcomeLibraryAnalysis.js";

// Tracks this type's own shape (not the pokie package version), same convention as
// STAKE_ENGINE_MANIFEST_SCHEMA_VERSION/WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION.
export const OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION = 1;

export type OutcomeLibraryBundleManifestModeEntry = {
    readonly modeName: string;
    readonly betMode: string;
    readonly stake: number;
    readonly libraryId: string;
    readonly libraryHash: string; // computeWeightedOutcomeLibraryHash(library) — reused as-is, never recomputed differently
    readonly outcomeCount: number;
    readonly totalWeight: number;
    readonly analysis: WeightedOutcomeLibraryAnalysis; // WeightedOutcomeLibraryAnalyzer output, embedded verbatim — no second calculation path
    readonly indexFile: string; // "index_<modeName>.json"
    readonly outcomesFile: string; // "outcomes_<modeName>.jsonl"
};

// POKIE's own provenance for a "pokie outcomelibrary build" run, written to "manifest.json" alongside each
// mode's own small index and streaming outcomes file — same "who/what version/when" stamp convention as
// StakeEngineManifest, and the same "files" inventory convention as StakeEngineManifest/GameBuildInfo (the
// exact set of paths this run generated, relative to the bundle directory).
export type OutcomeLibraryBundleManifest = {
    readonly schemaVersion: number;
    readonly generatedBy: string;
    readonly pokieVersion: string;
    readonly generatedAt: string;
    readonly game: PokieGameManifest;
    readonly configHash?: string;
    readonly modes: readonly OutcomeLibraryBundleManifestModeEntry[];
    readonly files: readonly string[];
};
