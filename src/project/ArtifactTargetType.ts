import type {ProjectType} from "./ProjectType.js";

// The ProjectType kinds a build/export operation can actually PRODUCE as a new artifact -- every ProjectType
// except "blueprint", which is only ever a build INPUT (see ProjectType.ts's own "blueprint" doc comment; no
// operation builds a blueprint, "build" builds FROM one). Reusing ProjectType's own vocabulary rather than
// inventing a parallel one keeps "what this target IS, once built" and "what a later ProjectResolving.resolve()
// call against its own output path would recognize it as" the same closed set, by construction.
export type ArtifactTargetType = Exclude<ProjectType, "blueprint">;
