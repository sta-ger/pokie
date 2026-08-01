import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    RUNTIME_EXECUTE_CAPABILITY,
    STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    WASM_EXPORT_CAPABILITY,
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

// Which single ProjectCapability each known PokieOperation requires — the one place
// describeUnsupportedProjectOperation reads from to decide whether a resolved PokieProject can perform a
// given operation. An operation absent from this map is simply not checked (treated as always supported) —
// this module has nothing to say about an operation it doesn't recognize, rather than guessing.
export const OPERATION_REQUIRED_CAPABILITY: Readonly<Record<PokieOperation, ProjectCapability>> = {
    [BUILD_OPERATION]: BLUEPRINT_BUILD_CAPABILITY,
    [SIM_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [REPLAY_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [VALIDATE_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [INSPECT_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [SERVE_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [DEV_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [CLIENT_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [STUDIO_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [OUTCOME_LIBRARY_GENERATE_OPERATION]: RUNTIME_EXECUTE_CAPABILITY,
    [OUTCOME_LIBRARY_BUILD_OPERATION]: OUTCOME_LIBRARY_READ_CAPABILITY,
    [OUTCOME_LIBRARY_VALIDATE_OPERATION]: OUTCOME_LIBRARY_READ_CAPABILITY,
    [STAKE_ENGINE_EXPORT_OPERATION]: STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    [STAKE_ENGINE_IMPORT_OPERATION]: STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    [STAKE_ENGINE_ANALYZE_OPERATION]: STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    [STAKE_ENGINE_DIFF_OPERATION]: STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    [PAR_IMPORT_OPERATION]: PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    [PAR_EXPORT_OPERATION]: PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    [WASM_EXPORT_OPERATION]: WASM_EXPORT_CAPABILITY,
};
