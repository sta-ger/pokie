export type RuntimeSessionRequestInput = {seed?: unknown; initialBalance?: unknown};

export type ValidatedRuntimeSessionRequest = {seed?: string | number; initialBalance?: number};

// The one place a POST /api/project/runtime/sessions body is turned into a trusted request — throws a
// plain, client-safe Error (StudioServer catches this and maps it to 400) for anything malformed.
// "initialBalance" is only meaningful for a runtime started against a pre-generated outcome library --
// a live session's own initial credits come entirely from the game's own session initialization, never
// from this request (see StudioRuntimeManager.createSession()'s own doc comment) -- but it's accepted
// here unconditionally rather than needing the caller to know which mode is active.
export function validateRuntimeSessionRequest(input: RuntimeSessionRequestInput): ValidatedRuntimeSessionRequest {
    const {seed, initialBalance} = input;
    if (seed !== undefined && typeof seed !== "string" && typeof seed !== "number") {
        throw new Error('"seed" must be a string or number when given.');
    }
    if (initialBalance !== undefined && (typeof initialBalance !== "number" || !Number.isFinite(initialBalance))) {
        throw new Error('"initialBalance" must be a finite number when given.');
    }
    return {seed: seed as string | number | undefined, initialBalance: initialBalance as number | undefined};
}
