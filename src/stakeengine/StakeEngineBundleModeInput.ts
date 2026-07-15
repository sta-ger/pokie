// One Stake mode to export directly from a canonical outcome-library bundle (see
// StakeEngineBundleStreamingExporter) — "bundleModeName" is the mode's own name *inside* the bundle, which
// doesn't have to match the Stake "modeName" this run exports it as (mirrors StakeEngineCommand's own
// "bundleDir"/"bundleModeName" config option).
export type StakeEngineBundleModeInput = {
    readonly modeName: string;
    readonly cost: number;
    readonly bundleDir: string;
    readonly bundleModeName: string;
};
