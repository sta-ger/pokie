export type PlaySessionRequestInput = {seed?: unknown; modeName?: unknown};

export type ValidatedPlaySessionRequest = {seed?: string | number; modeName?: string};

// The one place a POST /api/project/play/session body is turned into a trusted request — throws a
// plain, client-safe Error (StudioServer catches this and maps it to 400) for anything malformed. `seed`
// -- a Play session's starting credits always come from the game's own session initialization (see
// StudioPlayService.newSession()'s own doc comment), so there's no "fund it up front" case to accept a
// field for here. `modeName` is only meaningful for a resolved "outcomeLibrary" project (see
// StudioPlayService.newOutcomeSourceSession's own doc comment) -- undefined here means "no explicit
// choice", resolved to the manifest's own first mode by resolveOutcomeLibraryModeName, same as before
// this field existed; harmlessly ignored for an ordinary "tsPackage"/"blueprint" session.
export function validatePlaySessionRequest(input: PlaySessionRequestInput): ValidatedPlaySessionRequest {
    const {seed, modeName} = input;
    if (seed !== undefined && typeof seed !== "string" && typeof seed !== "number") {
        throw new Error('"seed" must be a string or number when given.');
    }
    if (typeof seed === "string" && seed.trim().length === 0) {
        throw new Error('"seed" must be a non-empty string when given. Omit it for an unseeded best-effort Play session.');
    }
    if (modeName !== undefined && (typeof modeName !== "string" || modeName.trim().length === 0)) {
        throw new Error('"modeName" must be a non-empty string when given.');
    }
    return {seed: seed as string | number | undefined, modeName: modeName as string | undefined};
}
