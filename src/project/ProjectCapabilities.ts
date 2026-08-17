import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    OUTCOME_SOURCE_READ_CAPABILITY,
    OUTCOME_SOURCE_SAMPLE_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    RUNTIME_EXECUTE_CAPABILITY,
    STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    STAKE_ADAPTER_EXPORT_CAPABILITY,
    WASM_MANIFEST_READ_CAPABILITY,
    type ProjectCapability,
} from "./ProjectCapability.js";
import type {ProjectType} from "./ProjectType.js";

// The fixed set of ProjectCapability ids a resolved PokieProject carries — resolved once, by
// PROJECT_TYPE_CAPABILITIES below, and stamped onto the PokieProject instance itself (see PokieProject.ts) so
// a downstream consumer reads capabilities off the resolved project rather than re-deriving them from "type"
// a second time.
export type ProjectCapabilities = readonly ProjectCapability[];

// The one place that decides which ProjectCapability each ProjectType grants — every other file in this
// module (ProjectTargetResolver stamping a resolved PokieProject, describeUnsupportedProjectOperation when it
// looks for an alternative type) reads this map rather than re-deciding "does this type support that
// capability" independently. "wasm" maps to WASM_MANIFEST_READ_CAPABILITY alone — a resolved "wasm" project
// (only ever produced by WasmProjectTargetAdapter recognizing a contract-compatible sidecar manifest, see that
// adapter's own doc comment) can be inspected, never built/exported (WASM_EXPORT_CAPABILITY, still granted to
// nothing today) or loaded/executed (RUNTIME_EXECUTE_CAPABILITY) — see ProjectType.ts's own doc comment on
// that entry.
//
// "outcomeLibrary" and "stakeAdapter" are the two ProjectType values that carry more than one capability today
// — both already have their own canonical outcome-source reader (OutcomeLibraryBundleReading /
// StakeEngineOutcomeSourceReading), so both grant OUTCOME_SOURCE_READ_CAPABILITY (inspect, exact analysis) in
// addition to their own exchange/build-facing capability. Only "outcomeLibrary" additionally grants
// OUTCOME_SOURCE_SAMPLE_CAPABILITY (sampling sim, play/serve, replay): a "stakeAdapter" export has no
// PreGeneratedOutcomeSourcing-style draw-by-draw serving contract, so it stays read-only — see that
// capability's own doc comment.
export const PROJECT_TYPE_CAPABILITIES: Readonly<Record<ProjectType, ProjectCapabilities>> = {
    blueprint: [BLUEPRINT_BUILD_CAPABILITY],
    tsPackage: [RUNTIME_EXECUTE_CAPABILITY],
    // A canonical outcome library is also the sole native source for a new Stake Engine export.  Grant the
    // narrow export capability here rather than teaching a CLI/Studio caller to bypass ArtifactBuilderRegistry and
    // invoke StakeEngineExporter itself: registry.build("stakeAdapter", outcomeLibrary, ...) is the one
    // Project -> Artifact boundary for that conversion.
    outcomeLibrary: [OUTCOME_LIBRARY_READ_CAPABILITY, OUTCOME_SOURCE_READ_CAPABILITY, OUTCOME_SOURCE_SAMPLE_CAPABILITY, STAKE_ADAPTER_EXPORT_CAPABILITY],
    stakeAdapter: [STAKE_ADAPTER_EXCHANGE_CAPABILITY, STAKE_ADAPTER_EXPORT_CAPABILITY, OUTCOME_SOURCE_READ_CAPABILITY],
    wasm: [WASM_MANIFEST_READ_CAPABILITY],
    parWorkbook: [PAR_WORKBOOK_EXCHANGE_CAPABILITY],
};
