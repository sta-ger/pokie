export type PlaySpinRequestInput = {bet?: unknown; mode?: unknown};

export type ValidatedPlaySpinRequest = {bet?: number; mode?: string};

// A Play spin accepts only the two choices the game's live session can apply immediately before
// evaluating this exact round.  The session/SpinCommandHandler remains the authority for whether a
// supplied value is actually available; this boundary only rejects malformed wire input.
export function validatePlaySpinRequest(input: PlaySpinRequestInput): ValidatedPlaySpinRequest {
    const {bet, mode} = input;
    if (bet !== undefined && (typeof bet !== "number" || !Number.isFinite(bet))) {
        throw new Error('"bet" must be a finite number when given.');
    }
    if (mode !== undefined && (typeof mode !== "string" || mode.trim().length === 0)) {
        throw new Error('"mode" must be a non-empty string when given.');
    }
    return {bet: bet as number | undefined, mode: mode as string | undefined};
}
