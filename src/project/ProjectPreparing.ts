import type {PokieProject} from "./PokieProject.js";
import type {ProjectPreparationResult} from "./ProjectPreparationResult.js";

// The runtime-side counterpart to ProjectResolving: the boundary a caller crosses from "a resolved
// PokieProject" to "a runtime location loadable the way loadPokieGame/the pokie CLI expect" — e.g. turning
// a "blueprint" project into a built tsPackage directory, or a "stakeAdapter" export into its runnable
// form. Takes the already-resolved PokieProject, never a raw path, so a caller can't hand this something
// ProjectResolving itself never recognized; resolving a path is ProjectResolving's job, not this one's.
// Deliberately contract-only here: no implementation exists yet, and no runtime/package-manager behavior
// (installing dependencies, invoking a build, spawning a process) is performed by this interface itself —
// see ProjectPreparationResult for what a future implementation must report back, in particular who
// owns cleanup of what it produced.
export interface ProjectPreparing {
    prepare(project: PokieProject, options?: ProjectPreparationOptions): Promise<ProjectPreparationResult>;
}

/**
 * Lifetime facts for a runtime preparation.  Runtime callers deliberately
 * pass these through instead of inventing their own cancellation/cache rules.
 */
export type ProjectPreparationOptions = {
    readonly signal?: AbortSignal;
    /** Extra source facts consumed before the Blueprint stage (for example PAR bytes). */
    readonly cacheIdentity?: string;
};
