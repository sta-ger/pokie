// One Stake mode to export directly from a canonical outcome-library bundle (see
// StakeEngineBundleStreamingExporter) — "bundleModeName" is the mode's own name *inside* the bundle, which
// doesn't have to match the Stake "modeName" this run exports it as (mirrors StakeEngineCommand's own
// "bundleDir"/"bundleModeName" config option).
export type StakeEngineBundleModeInput = {
    readonly modeName: string;
    readonly cost: number;
    readonly bundleDir: string;
    readonly bundleModeName: string;
    /** Persisted by a Stake import's re-export config, so the streaming path
     * retains the source bundle's generation contract just like the
     * in-memory exporter does. */
    readonly generator?: OutcomeLibraryGeneratorDiagnostics;
};
import type {OutcomeLibraryGeneratorDiagnostics} from "../weightedoutcome/generate/OutcomeLibraryGeneratorDiagnostics.js";
