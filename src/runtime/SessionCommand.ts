export type SessionCommand = {readonly kind: "spin"; readonly bet?: number; readonly mode?: string};

export function validateSessionCommand(command: unknown): string | undefined {
    if (typeof command !== "object" || command === null || Array.isArray(command)) return "Command must be an object.";
    const value = command as Record<string, unknown>;
    if (value.kind !== "spin") return "Unknown command kind.";
    if (value.bet !== undefined && (typeof value.bet !== "number" || !Number.isFinite(value.bet) || value.bet <= 0)) return "Bet must be a finite positive number.";
    if (value.mode !== undefined && (typeof value.mode !== "string" || value.mode.trim().length === 0)) return "Mode must be a non-empty string.";
    return undefined;
}
