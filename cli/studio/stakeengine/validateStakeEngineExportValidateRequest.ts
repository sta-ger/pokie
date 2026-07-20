import type {StudioStakeEngineExportModeInput} from "./StudioStakeEngineExportModeInput.js";
import {validateStakeEngineExportModeInputs} from "./validateStakeEngineExportModeInputs.js";

export type StakeEngineExportValidateRequestInput = {modes?: unknown};
export type ValidatedStakeEngineExportValidateRequest = {readonly modes: readonly StudioStakeEngineExportModeInput[]};

// The Stake Engine Export tab's "Validate diagnostics" step — never writes anything, so the request
// carries only `modes`, unlike the Export request below which also needs an outDir/overwrite.
export function validateStakeEngineExportValidateRequest(input: StakeEngineExportValidateRequestInput): ValidatedStakeEngineExportValidateRequest {
    return {modes: validateStakeEngineExportModeInputs(input.modes)};
}
