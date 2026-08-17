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
    WASM_EXPORT_CAPABILITY,
    WASM_MANIFEST_READ_CAPABILITY,
    type ProjectCapability,
} from "./ProjectCapability.js";

// An operation id is a plain, open string — same "open vocabulary" convention as ProjectCapability, for the
// same reason: OPERATION_REQUIRED_CAPABILITY below is a lookup table, not an exhaustive switch, so an
// operation this module doesn't recognize simply isn't checked (see describeUnsupportedProjectOperation)
// rather than being a compile error.
export type PokieOperation = string;

export const BUILD_OPERATION: PokieOperation = "build";
export const SIM_OPERATION: PokieOperation = "sim";
export const REPLAY_OPERATION: PokieOperation = "replay";
export const VALIDATE_OPERATION: PokieOperation = "validate";
// Interactively edits an existing Blueprint Project's own canonical GameBlueprint (see "pokie edit") --
// requires BLUEPRINT_BUILD_CAPABILITY, the same single capability BUILD_OPERATION requires, since
// editing and building both only ever operate on a resolved "blueprint" project's own JSON file.
export const EDIT_OPERATION: PokieOperation = "edit";
export const INSPECT_OPERATION: PokieOperation = "inspect";
export const SERVE_OPERATION: PokieOperation = "serve";
export const DEV_OPERATION: PokieOperation = "dev";
export const CLIENT_OPERATION: PokieOperation = "client";
export const STUDIO_OPERATION: PokieOperation = "studio";
export const OUTCOME_LIBRARY_GENERATE_OPERATION: PokieOperation = "outcomeLibrary.generate";
export const OUTCOME_LIBRARY_BUILD_OPERATION: PokieOperation = "outcomeLibrary.build";
export const OUTCOME_LIBRARY_VALIDATE_OPERATION: PokieOperation = "outcomeLibrary.validate";
export const STAKE_ENGINE_EXPORT_OPERATION: PokieOperation = "stakeEngine.export";
export const STAKE_ENGINE_IMPORT_OPERATION: PokieOperation = "stakeEngine.import";
export const STAKE_ENGINE_ANALYZE_OPERATION: PokieOperation = "stakeEngine.analyze";
export const STAKE_ENGINE_DIFF_OPERATION: PokieOperation = "stakeEngine.diff";
export const PAR_IMPORT_OPERATION: PokieOperation = "par.import";
export const PAR_EXPORT_OPERATION: PokieOperation = "par.export";
export const WASM_EXPORT_OPERATION: PokieOperation = "wasm.export";
// Reads back a resolved "wasm" project's own PokieWasmComponentManifest (see readWasmComponentManifest) —
// requires WASM_MANIFEST_READ_CAPABILITY, never RUNTIME_EXECUTE_CAPABILITY: POKIE has no WASM execution
// backend, so this is metadata-only, the same "resolve read-only" boundary WasmProjectTargetAdapter itself
// enforces at resolution time.
export const WASM_INSPECT_OPERATION: PokieOperation = "wasm.inspect";
// Statically assesses a "tsPackage" project's own source for Node built-in API usage/declared dependencies
// that would block a hypothetical WASM build (see assessWasmPackagingPreflight) — requires
// RUNTIME_EXECUTE_CAPABILITY, the same capability sim/replay/serve require, since only a "tsPackage" project
// is a real, already-loadable source directory this preflight can scan; every other ProjectType has no
// comparable source tree. Deliberately not gated on WASM_EXPORT_CAPABILITY (which nothing grants): this
// preflight exists to assess a package *before* any WASM build capability could ever be granted to it, not to
// gate on a capability that would make the preflight itself unreachable.
export const WASM_PACKAGING_PREFLIGHT_OPERATION: PokieOperation = "wasm.packagingPreflight";
// The outcome-source-driven counterparts to INSPECT/SIM/SERVE/REPLAY_OPERATION above — deliberately separate
// operation ids, not a reuse of those, since they're satisfied a different way (a canonical outcome-source
// reader/selector, never loadPokieGame) and by a different capability (OUTCOME_SOURCE_READ_CAPABILITY/
// OUTCOME_SOURCE_SAMPLE_CAPABILITY, not RUNTIME_EXECUTE_CAPABILITY) — see those capabilities' own doc
// comments. Reusing e.g. SIM_OPERATION's id for this would incorrectly imply an "outcomeLibrary" project also
// grants DEV/CLIENT/STUDIO_OPERATION, which it does not.
export const OUTCOME_SOURCE_INSPECT_OPERATION: PokieOperation = "outcomeSource.inspect";
export const OUTCOME_SOURCE_ANALYZE_OPERATION: PokieOperation = "outcomeSource.analyze";
export const OUTCOME_SOURCE_SAMPLE_OPERATION: PokieOperation = "outcomeSource.sample";
export const OUTCOME_SOURCE_SERVE_OPERATION: PokieOperation = "outcomeSource.serve";
export const OUTCOME_SOURCE_REPLAY_OPERATION: PokieOperation = "outcomeSource.replay";
export const OUTCOME_SOURCE_SIMULATE_OPERATION: PokieOperation = "outcomeSource.simulate";
// Compares two resolved outcome-source projects' own canonical exact analyses (see
// diffOutcomeSourceProjects.ts) -- requires only OUTCOME_SOURCE_READ_CAPABILITY, the same capability
// inspect/analyze already require, since diffing never draws/samples anything and both "outcomeLibrary" and
// "stakeAdapter" already expose a canonical reader's own exact analysis (see OutcomeSourceProjectAnalyzer).
// Deliberately a single operation id covering both project types -- unlike sample/serve/replay, which split
// "outcomeLibrary" from "stakeAdapter" because only one of them can be drawn from, diffing is equally
// meaningful (and equally read-only) for either side of the comparison, in any combination.
export const OUTCOME_SOURCE_DIFF_OPERATION: PokieOperation = "outcomeSource.diff";
// Builds/verifies a certification/evidence bundle on top of an already-computed outcome-library bundle (see
// CertificationCommand) -- requires OUTCOME_LIBRARY_READ_CAPABILITY, the same capability "outcomeLibrary.build"/
// "outcomeLibrary.validate" already require, since a certification bundle is itself built by sampling an
// existing native outcome-library bundle, never a Stake Engine export (which has no
// PreGeneratedOutcomeSourcing-style draw contract of its own -- see OUTCOME_SOURCE_SAMPLE_CAPABILITY) and never
// a live package's runtime.
export const CERTIFICATION_BUILD_OPERATION: PokieOperation = "certification.build";
export const CERTIFICATION_VERIFY_OPERATION: PokieOperation = "certification.verify";

// Which single ProjectCapability each known PokieOperation requires — the one place
// describeUnsupportedProjectOperation reads from to decide whether a resolved PokieProject can perform a
// given operation. An operation absent from this map is simply not checked (treated as always supported) —
// this module has nothing to say about an operation it doesn't recognize, rather than guessing.
export const OPERATION_REQUIRED_CAPABILITY: Readonly<Record<PokieOperation, ProjectCapability>> = {
    [BUILD_OPERATION]: BLUEPRINT_BUILD_CAPABILITY,
    [EDIT_OPERATION]: BLUEPRINT_BUILD_CAPABILITY,
    [SIM_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [REPLAY_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [VALIDATE_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [INSPECT_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [SERVE_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [DEV_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [CLIENT_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [STUDIO_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [OUTCOME_LIBRARY_GENERATE_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [OUTCOME_LIBRARY_BUILD_OPERATION]: OUTCOME_LIBRARY_GENERATE_CAPABILITY,
    [OUTCOME_LIBRARY_VALIDATE_OPERATION]: OUTCOME_LIBRARY_READ_CAPABILITY,
    [STAKE_ENGINE_EXPORT_OPERATION]: STAKE_ADAPTER_EXPORT_CAPABILITY,
    [STAKE_ENGINE_IMPORT_OPERATION]: STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    [STAKE_ENGINE_ANALYZE_OPERATION]: STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    [STAKE_ENGINE_DIFF_OPERATION]: STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    [PAR_IMPORT_OPERATION]: PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    [PAR_EXPORT_OPERATION]: PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    [WASM_EXPORT_OPERATION]: WASM_EXPORT_CAPABILITY,
    [WASM_INSPECT_OPERATION]: WASM_MANIFEST_READ_CAPABILITY,
    [WASM_PACKAGING_PREFLIGHT_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [OUTCOME_SOURCE_INSPECT_OPERATION]: OUTCOME_SOURCE_READ_CAPABILITY,
    [OUTCOME_SOURCE_ANALYZE_OPERATION]: OUTCOME_SOURCE_READ_CAPABILITY,
    [OUTCOME_SOURCE_SAMPLE_OPERATION]: OUTCOME_SOURCE_SAMPLE_CAPABILITY,
    [OUTCOME_SOURCE_SERVE_OPERATION]: OUTCOME_SOURCE_SAMPLE_CAPABILITY,
    [OUTCOME_SOURCE_REPLAY_OPERATION]: OUTCOME_SOURCE_SAMPLE_CAPABILITY,
    [OUTCOME_SOURCE_SIMULATE_OPERATION]: OUTCOME_SOURCE_SAMPLE_CAPABILITY,
    [OUTCOME_SOURCE_DIFF_OPERATION]: OUTCOME_SOURCE_READ_CAPABILITY,
    [CERTIFICATION_BUILD_OPERATION]: OUTCOME_LIBRARY_READ_CAPABILITY,
    [CERTIFICATION_VERIFY_OPERATION]: OUTCOME_LIBRARY_READ_CAPABILITY,
};
