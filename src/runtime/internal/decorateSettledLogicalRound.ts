import type {LogicalRound} from "../LogicalRound.js";
import type {RepositoryCommand} from "../RepositoryCommand.js";

/**
 * Keep the portable runtime's logical round, but give each newly accepted subround the repository
 * identity of the settlement that produced it. Without this, a one-shot composite would either lose
 * request identity on recovery or force the handler to re-dispatch (and audit) every free spin.
 */
export function decorateSettledLogicalRound(round: LogicalRound, command: RepositoryCommand | {kind: "spin"; bet?: number; mode?: string}, priorCursor: number): LogicalRound {
    const repository = command as Partial<RepositoryCommand>;
    const sessionId = repository.sessionId;
    const requestId = repository.requestId;
    if (typeof sessionId !== "string" || typeof requestId !== "string") return round;
    const entry = command as LogicalRound["entry"] & RepositoryCommand;
    const subrounds: LogicalRound["subrounds"] = round.subrounds.map((subround, index) => {
        if (index < priorCursor) return subround;
        if (index === 0) return {...subround, command: entry};
        const continuation = (subround.command as {continuation?: {roundId: string; cursor: number}}).continuation;
        return {...subround, command: {kind: "spin" as const, sessionId, requestId, delivery: "stepwise" as const,
            ...(continuation === undefined ? {} : {continuation})}};
    });
    return {...round, ...(priorCursor === 0 ? {entry} : {}), subrounds};
}
