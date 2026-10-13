import {validateRepositoryCommand, validateSessionCommand, type SessionCommand} from "@fromstan/pokie";
export type PlaySpinRequestInput = {bet?: unknown; mode?: unknown; requestId?: unknown; delivery?: unknown; roundId?: unknown; continuation?: unknown; maxSubrounds?: unknown; expectedVersion?: unknown};

export type ValidatedPlaySpinRequest = Omit<SessionCommand, "kind"> & {requestId?: string; expectedVersion?: number};

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
    const invalid = validateSessionCommand({kind: "spin", ...input}) ?? validateRepositoryCommand({sessionId: "play", ...input});
    if (invalid) throw new Error(invalid);
    return input as ValidatedPlaySpinRequest;
}
