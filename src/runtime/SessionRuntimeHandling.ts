import type {LogicalRound} from "./LogicalRound.js";
import type {SessionCommand} from "./SessionCommand.js";

export type SessionCommandResult =
    | {readonly status: "played"; readonly win: number; readonly credits: number; readonly stake: number; readonly mode?: string; readonly payout?: number; readonly logicalRound?: LogicalRound; readonly deliveryOnly?: boolean}
    | {readonly status: "invalid-command" | "blocked"; readonly reason: string};

export interface SessionRuntimeHandling {
    execute(command: SessionCommand, signal?: AbortSignal): SessionCommandResult;
}
