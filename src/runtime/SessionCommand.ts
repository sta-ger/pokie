import type {RoundContinuation, RoundDeliveryPolicy} from "./LogicalRound.js";

export type SessionCommand = {
    readonly kind: "spin";
    readonly bet?: number;
    readonly mode?: string;
    /** Omitted policy retains the legacy one-play command unit. */
    readonly delivery?: RoundDeliveryPolicy;
    readonly roundId?: string;
    readonly continuation?: RoundContinuation;
    readonly maxSubrounds?: number;
};

export function validateSessionCommand(command: unknown): string | undefined {
    if (typeof command !== "object" || command === null || Array.isArray(command)) return "Command must be an object.";
    const value = command as Record<string, unknown>;
    if (value.kind !== "spin") return "Unknown command kind.";
    if (value.bet !== undefined && (typeof value.bet !== "number" || !Number.isFinite(value.bet) || value.bet <= 0)) return "Bet must be a finite positive number.";
    if (value.mode !== undefined && (typeof value.mode !== "string" || value.mode.trim().length === 0)) return "Mode must be a non-empty string.";
    if (value.delivery !== undefined && value.delivery !== "stepwise" && value.delivery !== "composite") return "Unknown round delivery policy.";
    if (value.roundId !== undefined && (typeof value.roundId !== "string" || !value.roundId.trim() || value.roundId.includes("\0"))) return "roundId must be a non-empty identifier without NUL characters.";
    if (value.maxSubrounds !== undefined && (!Number.isSafeInteger(value.maxSubrounds) || (value.maxSubrounds as number) < 1 || (value.maxSubrounds as number) > 10000)) return "maxSubrounds must be an integer from 1 to 10000.";
    if (value.continuation !== undefined) {
        const next = value.continuation as Record<string, unknown>;
        if (typeof next !== "object" || next === null || typeof next.roundId !== "string" || !next.roundId.trim() || next.roundId.includes("\0") || !Number.isSafeInteger(next.cursor) || (next.cursor as number) < 1) return "Invalid logical-round continuation.";
        if (value.bet !== undefined || value.mode !== undefined || value.roundId !== undefined) return "Continuation cannot change entry selection or identity.";
    }
    return undefined;
}
