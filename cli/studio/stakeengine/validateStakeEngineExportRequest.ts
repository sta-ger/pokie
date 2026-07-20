import type {StudioStakeEngineExportModeInput} from "./StudioStakeEngineExportModeInput.js";
import {validateStakeEngineExportModeInputs} from "./validateStakeEngineExportModeInputs.js";

export type StakeEngineExportRequestInput = {modes?: unknown; outDir?: unknown; overwrite?: unknown};
export type ValidatedStakeEngineExportRequest = {
    readonly modes: readonly StudioStakeEngineExportModeInput[];
    readonly outDir: string;
    readonly overwrite: boolean;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// `overwrite` defaults to false when omitted — same "never silently replace existing output" convention
// as validateParSheetExportRequest.
export function validateStakeEngineExportRequest(input: StakeEngineExportRequestInput): ValidatedStakeEngineExportRequest {
    if (!isNonEmptyString(input.outDir)) {
        throw new Error('"outDir" must be a non-empty string.');
    }
    if (input.overwrite !== undefined && typeof input.overwrite !== "boolean") {
        throw new Error('"overwrite" must be a boolean when given.');
    }

    return {modes: validateStakeEngineExportModeInputs(input.modes), outDir: input.outDir, overwrite: input.overwrite === true};
}
