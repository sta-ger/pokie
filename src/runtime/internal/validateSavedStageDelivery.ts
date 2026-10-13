import type {RepositoryCommand} from "../RepositoryCommand.js";
import type {PokieSessionState} from "../../server/session/PokieSessionState.js";

/** A delivery transaction may change only the saved delivery cursor and its completion marker. */
export function validateSavedStageDelivery(previous: PokieSessionState, next: PokieSessionState, command: RepositoryCommand): boolean {
    const round = previous.logicalRound;
    if (!round || round.status !== "pending" || command.continuation?.roundId !== round.id || command.continuation.cursor !== round.deliveryCursor) return false;
    const stages = round.subrounds[round.cursor - 1].artifacts?.length ?? 0;
    if (round.stageCursor >= stages) return false;
    const stageCursor = round.stageCursor + 1;
    const expected = {...previous, logicalRound: {...round, stageCursor, deliveryCursor: round.deliveryCursor + 1,
        status: stageCursor < stages || round.mathematicalStatus === "pending" ? "pending" : "completed"}};
    return JSON.stringify(next) === JSON.stringify(expected);
}
