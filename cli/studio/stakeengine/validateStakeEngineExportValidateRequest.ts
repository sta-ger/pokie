import type {StudioStakeEngineExportModeInput} from "./StudioStakeEngineExportModeInput.js";
import {validateStakeEngineExportModeInputs} from "./validateStakeEngineExportModeInputs.js";

export type StakeEngineExportValidateRequestInput = {modes?: unknown; outDir?: unknown};
export type ValidatedStakeEngineExportValidateRequest = {readonly modes: readonly StudioStakeEngineExportModeInput[]; readonly outDir?: string};

// The Stake Engine Export tab's "Validate diagnostics" step — never writes anything, so the request
// carries only `modes`, unlike the Export request below which also needs an outDir/overwrite.
export function validateStakeEngineExportValidateRequest(input: StakeEngineExportValidateRequestInput): ValidatedStakeEngineExportValidateRequest {
    // Empty means the canonical Blueprint/package goal. A non-empty list is
    // the explicit advanced Outcome Library input flow.
    if (input.outDir !== undefined && (typeof input.outDir !== "string" || input.outDir.trim().length === 0)) {
        throw new Error('"outDir" must be a non-empty string when given.');
    }
    return {
        modes: validateStakeEngineExportModeInputs(input.modes, true),
        ...(input.outDir === undefined ? {} : {outDir: input.outDir}),
    };
}
