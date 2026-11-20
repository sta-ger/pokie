import type {BuildOutputResult} from "./BuildOutputResult.js";
import type {BuildOutputOptions} from "./BuildOutputOptions.js";
import type {OutputFormat} from "./OutputFormat.js";
import type {PokieProject} from "./PokieProject.js";

// The build-direction counterpart to ProjectResolving/ProjectPreparing: the boundary a caller crosses from
// "a resolved source PokieProject" to "a newly produced output on disk" -- e.g. turning a "blueprint"
// project into a built tsPackage directory. Deliberately interface-only here, same as ProjectPreparing: no
// implementation exists yet, and wiring this to POKIE's own already-atomic per-target
// writers (GamePackageGenerator, OutcomeLibraryFolderWriter, StakeEngineExporter/
// StakeEngineBundleStreamingExporter, ParSheetExporter) -- each of which already builds into a fresh temporary
// location and commits with a single atomic rename, never observable partially-written -- is exactly the
// "replacing build semantics" work BuildOutputBuilderRegistry exists BEFORE (see its own doc comment).
//
// Every implementation of this interface must preserve the same guarantee those existing writers already
// give: build() either produces the complete output at destinationPath via a single atomic publish, or
// throws before touching destinationPath at all -- never a partially-written result observable by a
// concurrent reader -- and must throw BuildConflictError (never overwrite silently) when
// destinationPath already holds content this builder doesn't itself own/manage.
export interface BuildOutputBuilder {
    readonly target: OutputFormat;
    // Whether this target's own destinationPath must be a missing/empty directory or a not-yet-existing
    // file -- the exact "file" vs "directory" kind this builder's own build() already passes to
    // assertBuildDestinationAvailable before ever writing. Exposed here (read by
    // BuildOutputBuilderRegistry.checkDestination()) so a caller can ask "would this destination be accepted"
    // without invoking build() at all, off the same single fact build() itself enforces -- never a second,
    // independently-maintained copy of it.
    readonly destinationKind: "file" | "directory";
    // A read-only source/output precondition check for previews and CLI dry runs. Builders that have
    // no source-specific validation beyond the registry's matrix check may omit it, but concrete
    // filesystem builders implement it so a dry run cannot promise a publishable output from a broken
    // source merely because its destination happens to be empty.
    validate?(source: PokieProject): Promise<void>;
    build(source: PokieProject, destinationPath: string, options?: BuildOutputOptions): Promise<BuildOutputResult>;
}
