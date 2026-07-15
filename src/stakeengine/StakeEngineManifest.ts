import type {PokieGameManifest} from "../gamepackage/PokieGameManifest.js";

// Tracks this type's own shape (not the pokie package version) — same convention as
// WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION/ROUND_ARTIFACT_SCHEMA_VERSION/GAME_BLUEPRINT_SCHEMA_VERSION.
export const STAKE_ENGINE_MANIFEST_SCHEMA_VERSION = 1;

export type StakeEngineManifestModeEntry = {
    readonly name: string;
    readonly betMode: string;
    readonly stake: number;
    readonly cost: number;
    readonly outcomeCount: number;
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly events: string;
    readonly weights: string;
};

// POKIE's own provenance for a "pokie stakeengine export" run, written to "pokie-manifest.json" alongside
// Stake's own strict "index.json" (see StakeEngineIndex) so the output stays inspectable — what produced it,
// from what, when — without Stake's own file ever carrying a field it doesn't expect.
//
// "files" doubles as a manifest, same convention as GameBuildInfo.files: the exact set of paths (relative to
// the export directory) this run generated. A later "pokie stakeengine export" into the same directory reads
// it back to decide whether re-running is a safe rebuild — see assertSafeToRebuildStakeEngineExport.
export type StakeEngineManifest = {
    readonly schemaVersion: number;
    readonly generatedBy: string;
    readonly pokieVersion: string;
    readonly generatedAt: string;
    readonly game: PokieGameManifest;
    readonly configHash?: string;
    readonly modes: readonly StakeEngineManifestModeEntry[];
    readonly files: readonly string[];
};
