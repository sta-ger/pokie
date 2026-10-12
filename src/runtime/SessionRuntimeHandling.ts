import type {SessionCommand} from "./SessionCommand.js";

export type SessionCommandResult =
    | {readonly status: "played"; readonly win: number; readonly credits: number; readonly stake: number; readonly mode?: string}
    | {readonly status: "invalid-command" | "blocked"; readonly reason: string};

export interface SessionRuntimeHandling {
    execute(command: SessionCommand): SessionCommandResult;
}
