import type {ProjectType} from "./ProjectType.js";

// The ProjectType kinds a build/export operation can actually PRODUCE as a new artifact. "blueprint" is only a
// build input, while "wasm" is an inspection-only project type: POKIE can recognize a compatible component but
// deliberately does not expose a WASM build/export target until it owns a complete producer and consumer workflow.
// Reusing the remaining ProjectType vocabulary keeps each produced artifact and its later resolver result aligned.
// Blueprint is a first-class destination for a model-preserving source (a PAR
// workbook import).  It is deliberately still not inferred from outcome or
// package artifacts: those formats do not retain the authored game model.
export type ArtifactTargetType = Exclude<ProjectType, "wasm">;
