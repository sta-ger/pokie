import type {ProjectType} from "./ProjectType.js";

// The ProjectType kinds a build/export operation can actually PRODUCE as a new artifact. "blueprint" is only a
// build input, while "wasm" is an inspection-only project type: POKIE can recognize a compatible component but
// deliberately does not expose a WASM build/export target until it owns a complete producer and consumer workflow.
// Reusing the remaining ProjectType vocabulary keeps each produced artifact and its later resolver result aligned.
export type ArtifactTargetType = Exclude<ProjectType, "blueprint" | "wasm">;
