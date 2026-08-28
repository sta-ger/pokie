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

    // An empty action request is a valid Studio lifecycle input: the service
    // turns it into the planner's structured unavailable result.  Rejecting it
    // at transport validation used to make the Build/Export button silently do
    // nothing when no local selector was available.
    return {modes: validateStakeEngineExportModeInputs(input.modes, true), outDir: input.outDir, overwrite: input.overwrite === true};
}
