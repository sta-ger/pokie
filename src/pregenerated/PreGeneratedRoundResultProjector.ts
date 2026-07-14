import type {PreGeneratedRoundInternalView} from "./PreGeneratedRoundInternalView.js";
import type {PreGeneratedRoundPublicView} from "./PreGeneratedRoundPublicView.js";
import type {PreGeneratedRoundResult} from "./PreGeneratedRoundResult.js";

// Splits a PreGeneratedRoundResult into the same public/internal shape PokieDevServer's own spin
// response already uses (see PokieDevSessionResponse/PokieInternalSessionData): projectPublic() is
// exactly what a client needs to render a round, projectInternal() is the full audit trail (which
// library/outcome/weight selected it, every runtime/transaction detail, and the raw RoundArtifact) —
// never sent unless a caller explicitly asks for it.
export class PreGeneratedRoundResultProjector<T extends string | number = string> {
    public projectPublic(result: PreGeneratedRoundResult<T>): PreGeneratedRoundPublicView<T> {
        const {runtime, artifact} = result;
        return {
            roundId: runtime.roundId,
            sessionId: runtime.sessionId,
            ...(runtime.requestId !== undefined ? {requestId: runtime.requestId} : {}),
            credits: runtime.balanceAfter,
            win: artifact.totalWin,
            payoutMultiplier: artifact.payoutMultiplier,
            screen: artifact.screen,
            wins: artifact.wins,
        };
    }

    public projectInternal(result: PreGeneratedRoundResult<T>): PreGeneratedRoundInternalView<T> {
        return {
            selection: result.selection,
            runtime: result.runtime,
            artifact: result.artifact,
        };
    }
}
