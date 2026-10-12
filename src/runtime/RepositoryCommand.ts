import type {SessionCommand} from "./SessionCommand.js";
import type {SpinCommandResult} from "../server/spin/SpinCommandResult.js";

export type RepositoryCommand = SessionCommand & {
    readonly sessionId: string;
    readonly requestId?: string;
    readonly expectedVersion?: number;
};

export interface RepositoryCommandHandling {
    execute(command: RepositoryCommand): Promise<SpinCommandResult>;
}

export function validateRepositoryCommand(value: unknown): string | undefined {
    if (typeof value !== "object" || value === null) return "Command must be an object.";
    const command = value as Record<string, unknown>;
    for (const key of ["sessionId", "requestId"] as const) {
        if ((key === "sessionId" || command[key] !== undefined) &&
            (typeof command[key] !== "string" || !(command[key] as string).trim() || (command[key] as string).includes("\0"))) {
            return `${key} must be a non-empty identifier without NUL characters.`;
        }
    }
    if (command.expectedVersion !== undefined && (!Number.isSafeInteger(command.expectedVersion) || (command.expectedVersion as number) < 0)) return "expectedVersion must be a non-negative safe integer.";
    return undefined;
}
