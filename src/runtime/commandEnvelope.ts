import type {RepositoryCommand} from "./RepositoryCommand.js";

/** Canonical binding used by both durable settlement stores. */
export function commandEnvelope(command: RepositoryCommand): string {
    const legacy = [command.sessionId, command.requestId ?? null, command.kind, command.bet ?? null,
        command.mode ?? null, command.expectedVersion ?? null];
    // Existing V2C-05 identities keep their original binding bytes. New semantics add a suffix.
    if (command.delivery === undefined && command.roundId === undefined && command.continuation === undefined && command.maxSubrounds === undefined) return JSON.stringify(legacy);
    return JSON.stringify([...legacy, command.delivery ?? null, command.roundId ?? null,
        command.continuation?.roundId ?? null, command.continuation?.cursor ?? null, command.maxSubrounds ?? null]);
}
