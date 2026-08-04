export type OutcomeSourceSampleRequestInput = {
    modeName?: unknown;
    seed?: unknown;
};

export type ValidatedOutcomeSourceSampleRequest = {
    readonly modeName: string;
    readonly seed?: string;
};

// The one place a POST /api/project/outcome-source/sample body is turned into a trusted
// ValidatedOutcomeSourceSampleRequest -- throws a plain, client-safe Error (no stack trace leaks;
// StudioServer catches this and maps it to 400) for a missing/blank `modeName`, or a `seed` that's
// present but not a non-empty string. Mirrors validateReplayRequest.ts's own shape/reasoning.
export function validateOutcomeSourceSampleRequest(input: OutcomeSourceSampleRequestInput): ValidatedOutcomeSourceSampleRequest {
    const {modeName, seed} = input;

    if (typeof modeName !== "string" || modeName.trim().length === 0) {
        throw new Error('"modeName" must be a non-empty string.');
    }

    if (seed === undefined) {
        return {modeName};
    }
    if (typeof seed !== "string" || seed.trim().length === 0) {
        throw new Error('"seed" must be a non-empty string when given.');
    }
    return {modeName, seed};
}
