// The Stake Engine math-sdk's own "index.json" shape (see
// https://stakeengine.github.io/math-sdk/rgs_docs/data_format/) — a strictly enforced schema with no fields
// beyond "modes". POKIE's own provenance (pokieVersion, per-mode library hashes, generatedAt, ...) is
// deliberately kept out of this type and written instead to a sibling "pokie-manifest.json" (see
// StakeEngineManifest) so this file always stays exactly what Stake's own tooling expects, never more.
export type StakeEngineIndexModeEntry = {
    readonly name: string;
    readonly cost: number;
    readonly events: string;
    readonly weights: string;
};

export type StakeEngineIndex = {
    readonly modes: readonly StakeEngineIndexModeEntry[];
};
