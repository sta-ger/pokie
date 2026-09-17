import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    OUTCOME_LIBRARY_GENERATE_CAPABILITY,
    OUTCOME_SOURCE_READ_CAPABILITY,
    OUTCOME_SOURCE_SAMPLE_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    RUNTIME_EXECUTE_CAPABILITY,
    STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    STAKE_ADAPTER_EXPORT_CAPABILITY,
    WASM_MANIFEST_READ_CAPABILITY,
    WASM_ARTIFACT_INSPECT_CAPABILITY,
    WASM_CANONICAL_ARTIFACT_CAPABILITY,
    WASM_EXPORT_CAPABILITY,
    WASM_RUNTIME_EXECUTE_CAPABILITY,
    WASM_RUNTIME_PLAY_CAPABILITY,
    WASM_RUNTIME_REPLAY_CAPABILITY,
    WASM_RUNTIME_SERIALIZE_CAPABILITY,
    type ProjectCapability,
} from "./ProjectCapability.js";
import type {ProjectType} from "./ProjectType.js";
import {
    POKIE_WASM_ARTIFACT_INSPECT_DECLARATION,
    POKIE_WASM_RUNTIME_PLAY_DECLARATION,
    POKIE_WASM_RUNTIME_REPLAY_DECLARATION,
    POKIE_WASM_RUNTIME_SERIALIZE_DECLARATION,
    describeUnsupportedCanonicalWasmRuntimeContract,
} from "../wasm/PokieWasmCanonicalModule.js";
import type {PokieWasmComponentManifest} from "./wasm/PokieWasmComponentManifest.js";

// The fixed set of ProjectCapability ids a resolved PokieProject carries — resolved once, by
// PROJECT_TYPE_CAPABILITIES below, and stamped onto the PokieProject instance itself (see PokieProject.ts) so
// a downstream consumer reads capabilities off the resolved project rather than re-deriving them from "type"
// a second time.
export type ProjectCapabilities = readonly ProjectCapability[];

export function wasmProjectCapabilities(manifest: Pick<PokieWasmComponentManifest, "artifact" | "serialization" | "host" | "capabilities">): ProjectCapabilities {
    if (manifest.artifact === undefined || describeUnsupportedCanonicalWasmRuntimeContract(manifest) !== undefined) {
        return [WASM_MANIFEST_READ_CAPABILITY];
    }
    const capabilities: ProjectCapability[] = [WASM_MANIFEST_READ_CAPABILITY, WASM_CANONICAL_ARTIFACT_CAPABILITY];
    const declaresPlay = manifest.capabilities.includes(POKIE_WASM_RUNTIME_PLAY_DECLARATION);
    const declaresSerialize = manifest.capabilities.includes(POKIE_WASM_RUNTIME_SERIALIZE_DECLARATION);
    const declaresReplay = manifest.capabilities.includes(POKIE_WASM_RUNTIME_REPLAY_DECLARATION);
    if (declaresPlay) capabilities.push(WASM_RUNTIME_PLAY_CAPABILITY);
    if (declaresSerialize) capabilities.push(WASM_RUNTIME_SERIALIZE_CAPABILITY);
    if (declaresReplay) capabilities.push(WASM_RUNTIME_REPLAY_CAPABILITY);
    if (declaresPlay && declaresSerialize && declaresReplay) {
        capabilities.push(WASM_RUNTIME_EXECUTE_CAPABILITY);
    }
    if (manifest.capabilities.includes(POKIE_WASM_ARTIFACT_INSPECT_DECLARATION)) capabilities.push(WASM_ARTIFACT_INSPECT_CAPABILITY);
    return capabilities;
}

// The one place that decides which ProjectCapability each ProjectType grants — every other file in this
// module (ProjectTargetResolver stamping a resolved PokieProject, describeUnsupportedProjectOperation when it
// looks for an alternative type) reads this map rather than re-deciding "does this type support that
// capability" independently. Resolver refines WASM through wasmProjectCapabilities after integrity validation:
// canonical identity grants no operation, declared play/serialize/replay/artifact capabilities are added
// individually, and wasm.runtime.execute represents the complete play/serialize/replay bundle. Legacy sidecar-only
// files are the only inspection-only WASM components.
//
// "outcomeLibrary" and "stakeAdapter" are the two ProjectType values that carry more than one capability today
// — both already have their own canonical outcome-source reader (OutcomeLibraryBundleReading /
// StakeEngineOutcomeSourceReading), so both grant OUTCOME_SOURCE_READ_CAPABILITY (inspect, exact analysis) in
// addition to their own exchange/build-facing capability. Only "outcomeLibrary" additionally grants
// OUTCOME_SOURCE_SAMPLE_CAPABILITY (sampling sim, play/serve, replay): a "stakeAdapter" export has no
// PreGeneratedOutcomeSourcing-style draw-by-draw serving contract, so it stays read-only — see that
// capability's own doc comment.
export const PROJECT_TYPE_CAPABILITIES: Readonly<Record<ProjectType, ProjectCapabilities>> = {
    // A Blueprint can request Stake output through ArtifactBuilderRegistry's prerequisite workflow: it
    // resolves a compatible registered Outcome Library or materializes/generates/registers one first.
    // The capability means that registry-owned workflow is reachable; it does not permit a caller to
    // bypass the registry and export a Blueprint directly with StakeEngineExporter.
    blueprint: [BLUEPRINT_BUILD_CAPABILITY, OUTCOME_LIBRARY_GENERATE_CAPABILITY, STAKE_ADAPTER_EXPORT_CAPABILITY, WASM_EXPORT_CAPABILITY],
    // A loadable package is the code-first source for exact Outcome generation.  The registry materializes
    // its runtime before generation, so a package whose game has no exact-enumeration runtime fails closed
    // there instead of being mistaken for an already-readable Outcome bundle.
    tsPackage: [RUNTIME_EXECUTE_CAPABILITY, OUTCOME_LIBRARY_GENERATE_CAPABILITY, STAKE_ADAPTER_EXPORT_CAPABILITY],
    // A canonical outcome library is also the sole native source for a new Stake Engine export.  Grant the
    // narrow export capability here rather than teaching a CLI/Studio caller to bypass ArtifactBuilderRegistry and
    // invoke StakeEngineExporter itself: registry.build("stakeAdapter", outcomeLibrary, ...) is the one
    // Project -> Artifact boundary for that conversion.
    outcomeLibrary: [OUTCOME_LIBRARY_READ_CAPABILITY, OUTCOME_LIBRARY_GENERATE_CAPABILITY, OUTCOME_SOURCE_READ_CAPABILITY, OUTCOME_SOURCE_SAMPLE_CAPABILITY, STAKE_ADAPTER_EXPORT_CAPABILITY],
    stakeAdapter: [STAKE_ADAPTER_EXCHANGE_CAPABILITY, STAKE_ADAPTER_EXPORT_CAPABILITY, OUTCOME_SOURCE_READ_CAPABILITY],
    // A resolved canonical component is executable through the portable WASM
    // host. Legacy sidecar-only components retain manifest inspection but are
    // rejected by that host at operation time.
    wasm: [WASM_MANIFEST_READ_CAPABILITY],
    parWorkbook: [PAR_WORKBOOK_EXCHANGE_CAPABILITY, WASM_EXPORT_CAPABILITY],
};
