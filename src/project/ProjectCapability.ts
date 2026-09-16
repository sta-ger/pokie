// A capability id is a plain, open string rather than a closed union — same convention as
// ExternalDeploymentCapability (see externaladapter/ExternalDeploymentCapability.ts) and for the identical
// reason: the constants below are the vocabulary POKIE's own ProjectCapabilities/PokieOperation model
// understands today, but closing this to a union would make every future capability a breaking change to this
// file rather than an additive one.
export type ProjectCapability = string;

// A project that can be loaded and executed in-process as a PokieGame — the capability "sim", "replay",
// "serve", "dev", "client", "studio", "inspect", "validate", and "outcomeLibrary.generate" all require. Only
// a "tsPackage" project grants it today.
export const RUNTIME_EXECUTE_CAPABILITY: ProjectCapability = "runtime.execute";

// A project that can be built into a generated tsPackage — what "build" requires. Only a "blueprint" project
// grants it today.
export const BLUEPRINT_BUILD_CAPABILITY: ProjectCapability = "blueprint.build";

// A project that already holds a readable outcome-library bundle — what "outcomeLibrary.build" and
// "outcomeLibrary.validate" require. Only an "outcomeLibrary" project grants it today.
export const OUTCOME_LIBRARY_READ_CAPABILITY: ProjectCapability = "outcomeLibrary.read";

// Produces a canonical Outcome Library through ArtifactBuilderRegistry.  This is intentionally separate
// from OUTCOME_LIBRARY_READ_CAPABILITY: a runnable package can calculate a new library without already
// being a bundle, while a bundle can be republished without loading a game runtime.
export const OUTCOME_LIBRARY_GENERATE_CAPABILITY: ProjectCapability = "outcomeLibrary.generate";

// An existing Stake Engine directory that can be imported, analyzed, or diffed.  New exports use the narrower
// STAKE_ADAPTER_EXPORT_CAPABILITY below, so a canonical outcome library cannot be mistaken for this foreign
// directory format.
export const STAKE_ADAPTER_EXCHANGE_CAPABILITY: ProjectCapability = "stakeAdapter.exchange";

// Produces a new Stake Engine export from a canonical precomputed source.  Kept distinct from the broader
// exchange capability: an outcome-library can be exported, but it cannot be mistaken for an existing Stake
// directory that supports Stake import/analyze/diff operations.
export const STAKE_ADAPTER_EXPORT_CAPABILITY: ProjectCapability = "stakeAdapter.export";

// A project that can be exchanged as a PAR sheet workbook — what "par.import" and "par.export" require. Only
// a "parWorkbook" project grants it today.
export const PAR_WORKBOOK_EXCHANGE_CAPABILITY: ProjectCapability = "parWorkbook.exchange";

// What "wasm.export" would require. Declared here so a future step can grant it to a project type without
// inventing a new capability id at the same time — no ProjectType grants it yet (see ProjectType.ts's own
// "wasm" doc comment), so describeUnsupportedProjectOperation reports every "wasm.export" attempt as
// unsupported with no alternatives, today.
export const WASM_EXPORT_CAPABILITY: ProjectCapability = "wasm.export";

// A project whose own WASM component manifest (see project/wasm/PokieWasmComponentManifest.ts) can be read
// back, metadata-only, via readWasmComponentManifest — what "wasm.inspect" requires. Only a "wasm" project
// grants it, and only once WasmProjectTargetAdapter has already confirmed the manifest is contract-compatible
// at resolution time (see that adapter's own doc comment). Deliberately distinct from WASM_EXPORT_CAPABILITY
// above (which nothing grants) and from RUNTIME_EXECUTE_CAPABILITY: POKIE has no WASM execution backend, so a
// resolved "wasm" project can be inspected — never built, loaded, run, sim'd, replayed, or served (see
// docs/wasm-compatibility-boundary.md).
export const WASM_MANIFEST_READ_CAPABILITY: ProjectCapability = "wasm.manifest.read";

// A project whose own pre-computed outcomes can be inspected and exactly analyzed straight off disk, via its
// own canonical outcome-source reader — never by loading or executing a PokieGame. What
// "outcomeSource.inspect" and "outcomeSource.analyze" require. Granted to both "outcomeLibrary" (read via
// OutcomeLibraryBundleReading/WeightedOutcomeLibraryAnalyzer) and "stakeAdapter" (read via
// StakeEngineOutcomeSourceReading/StakeEngineStandaloneAnalyzer) — each already has its own
// validator/analyzer over its own canonical source; see CanonicalOutcomeSourceDescriptor for what each
// source's own reader promises/limits (streaming vs. whole-directory, and what it deliberately never
// reconstructs). Deliberately distinct from RUNTIME_EXECUTE_CAPABILITY: neither reader ever loads or
// executes a PokieGame the way "sim"/"replay"/"serve" against a "tsPackage" project do.
export const OUTCOME_SOURCE_READ_CAPABILITY: ProjectCapability = "outcomeSource.read";

// A project whose own outcomes can be drawn one at a time, atomically, via a PreGeneratedOutcomeSourcing
// implementation — what "outcomeSource.sample", "outcomeSource.serve", and "outcomeSource.replay" require.
// Deliberately never "regenerated model math": every draw is served off an already-computed source
// (WeightedOutcomeSelector over an already-built WeightedOutcomeLibrary, or a canonical bundle's own
// index/byte-range read), the same selector/session/server path PreGeneratedSpinCommandHandler and
// PreGeneratedRoundReplayer already use — never a fresh game-model simulation. Granted only to
// "outcomeLibrary" today: a "stakeAdapter" export is a foreign directory pokie's own runtime has no serving
// contract for (see StakeEngineOutcomeSourceReading's own doc comment) — its own exact analysis/diff/report
// remain read-only, under OUTCOME_SOURCE_READ_CAPABILITY, instead.
export const OUTCOME_SOURCE_SAMPLE_CAPABILITY: ProjectCapability = "outcomeSource.sample";
