import type {ArtifactTargetType} from "./ArtifactTargetType.js";
import type {ProjectCapability} from "./ProjectCapability.js";
import type {ProjectType} from "./ProjectType.js";

// What ArtifactBuilderRegistry.describe() reports for a single build target -- the one place a caller (a
// future "replace build semantics" step, a Studio build-preview panel) asks "can I build this artifact, and
// from what source" instead of re-deriving it from PokieOperation/ProjectCapabilities independently. Every
// field here is truthful about TODAY's supported conversions only -- an empty "supportedSources" (wasm) or a
// narrow one (every other target) is ArtifactBuilderRegistry reporting a fact computed from the same
// OPERATION_REQUIRED_CAPABILITY/PROJECT_TYPE_CAPABILITIES contracts describeUnsupportedProjectOperation
// already reads, not a placeholder left to fill in later.
export type ArtifactBuildTargetDescriptor = {
    readonly target: ArtifactTargetType;
    // The single ProjectCapability a source PokieProject must carry to build this target -- the same
    // capability OPERATION_REQUIRED_CAPABILITY already names for this target's own PokieOperation, not a
    // second, independently-decided requirement (see ArtifactBuilderRegistry's own TARGET_OPERATION map).
    readonly requiredSourceCapability: ProjectCapability;
    // Every ProjectType whose own PROJECT_TYPE_CAPABILITIES already grants requiredSourceCapability today --
    // empty for "wasm" (see ProjectType.ts's own "wasm" doc comment: no ProjectType grants WASM_EXPORT_CAPABILITY
    // yet), so an empty array here is this descriptor truthfully reporting "not buildable from anything today",
    // never an omission.
    readonly supportedSources: readonly ProjectType[];
    // Explicit, human-readable statement of what this target's build does NOT promise -- e.g. that an
    // "outcomeLibrary"/"stakeAdapter" build never reconstructs the game model that produced its outcomes (a
    // one-way conversion), or that "wasm" has no arbitrary package-to-WASM compiler. Exists so a caller
    // surfacing this descriptor to a user states the limitation directly, rather than a reader having to infer
    // it from an empty/narrow supportedSources array alone.
    readonly unsupportedNotes: readonly string[];
};
