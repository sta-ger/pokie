export type PlaySessionRequestInput = {seed?: unknown};

export type ValidatedPlaySessionRequest = {seed?: string | number};

// The one place a POST /api/project/play/session body is turned into a trusted request — throws a
// plain, client-safe Error (StudioServer catches this and maps it to 400) for anything malformed. Just
// `seed` -- a Play session's starting credits always come from the game's own session initialization
// (see StudioPlayService.newSession()'s own doc comment), so there's no "fund it up front" case to
// accept a field for here.
export function validatePlaySessionRequest(input: PlaySessionRequestInput): ValidatedPlaySessionRequest {
    const {seed} = input;
    if (seed !== undefined && typeof seed !== "string" && typeof seed !== "number") {
        throw new Error('"seed" must be a string or number when given.');
    }
    return {seed: seed as string | number | undefined};
}
