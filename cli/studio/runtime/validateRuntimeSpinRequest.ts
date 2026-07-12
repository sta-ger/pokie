export type RuntimeSpinRequestInput = {requestId?: unknown; expectedSessionVersion?: unknown};

export type ValidatedRuntimeSpinRequest = {requestId?: string; expectedSessionVersion?: number};

// The one place a POST /api/project/runtime/sessions/:sessionId/spins body is turned into a trusted
// request — throws a plain, client-safe Error (StudioServer catches this and maps it to 400) for
// anything malformed.
export function validateRuntimeSpinRequest(input: RuntimeSpinRequestInput): ValidatedRuntimeSpinRequest {
    const {requestId, expectedSessionVersion} = input;

    if (requestId !== undefined && typeof requestId !== "string") {
        throw new Error('"requestId" must be a string when given.');
    }
    if (
        expectedSessionVersion !== undefined &&
        (typeof expectedSessionVersion !== "number" || !Number.isInteger(expectedSessionVersion) || expectedSessionVersion < 1)
    ) {
        throw new Error('"expectedSessionVersion" must be a positive integer when given.');
    }

    return {
        requestId: requestId as string | undefined,
        expectedSessionVersion: expectedSessionVersion as number | undefined,
    };
}
