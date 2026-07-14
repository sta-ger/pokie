import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import type {PreGeneratedRoundRuntimeContext} from "./PreGeneratedRoundRuntimeContext.js";
import type {PreGeneratedRoundSelectionProvenance} from "./PreGeneratedRoundSelectionProvenance.js";

// The internal/audit projection of a PreGeneratedRoundResult — everything PreGeneratedRoundPublicView
// deliberately omits: which library/outcome/weight selected this round, every runtime/transaction
// detail, and the full canonical RoundArtifact. Never sent to a client unless it explicitly opts in
// (see PokieDevServer's public/internal split, same `?debug=1` convention as the live spin path).
export type PreGeneratedRoundInternalView<T extends string | number = string> = {
    readonly selection: PreGeneratedRoundSelectionProvenance;
    readonly runtime: PreGeneratedRoundRuntimeContext;
    readonly artifact: RoundArtifact<T>;
};
