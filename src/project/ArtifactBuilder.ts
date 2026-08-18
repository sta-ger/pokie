import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import type {ArtifactBuildOptions} from "./ArtifactBuildOptions.js";
import type {ArtifactTargetType} from "./ArtifactTargetType.js";
import type {PokieProject} from "./PokieProject.js";

// The build-direction counterpart to ProjectResolving/ProjectMaterializing: the boundary a caller crosses from
// "a resolved source PokieProject" to "a newly-produced artifact on disk" -- e.g. turning a "blueprint"
// project into a built tsPackage directory. Deliberately contract-only here, same as ProjectMaterializing was
// in P3-POLISH-02: no implementation exists yet, and wiring this to POKIE's own already-atomic per-target
// writers (GamePackageGenerator, OutcomeLibraryBundleWriter, StakeEngineExporter/
// StakeEngineBundleStreamingExporter, ParSheetExporter) -- each of which already builds into a fresh temporary
// location and commits with a single atomic rename, never observable partially-written -- is exactly the
// "replacing build semantics" work ArtifactBuilderRegistry exists BEFORE (see its own doc comment).
//
// Every implementation of this interface must preserve the same guarantee those existing writers already
// give: build() either produces the complete artifact at destinationPath via a single atomic publish, or
// throws before touching destinationPath at all -- never a partially-written result observable by a
// concurrent reader -- and must throw ArtifactBuildConflictError (never overwrite silently) when
// destinationPath already holds content this builder doesn't itself own/manage.
export interface ArtifactBuilder {
    readonly target: ArtifactTargetType;
    // Whether this target's own destinationPath must be a missing/empty directory or a not-yet-existing
    // file -- the exact "file" vs "directory" kind this builder's own build() already passes to
    // assertArtifactDestinationAvailable before ever writing. Exposed here (read by
    // ArtifactBuilderRegistry.checkDestination()) so a caller can ask "would this destination be accepted"
    // without invoking build() at all, off the same single fact build() itself enforces -- never a second,
    // independently-maintained copy of it.
    readonly destinationKind: "file" | "directory";
    build(source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult>;
}
