import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import type {PreGeneratedRoundRuntimeContext} from "./PreGeneratedRoundRuntimeContext.js";
import type {PreGeneratedRoundSelectionProvenance} from "./PreGeneratedRoundSelectionProvenance.js";

// Tracks this type's own shape — bump when PreGeneratedRoundResult's fields change, same convention as
// ROUND_ARTIFACT_SCHEMA_VERSION/WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION.
export const PRE_GENERATED_ROUND_RESULT_SCHEMA_VERSION = 1;

// The runtime materialization of one pre-generated round: a canonical RoundArtifact selected unmodified
// from a WeightedOutcomeLibrary (see WeightedOutcomeSelector), stamped with which library/outcome
// produced it (`selection`) and the runtime-only facts that only exist because a real round was served
// for a real session (`runtime`) — built once, by buildPreGeneratedRoundResult, never assembled by hand.
//
// `artifact` is always the exact same object reference the library already holds — never copied,
// re-derived, or run through a second calculation path. Deeply readonly and deeply frozen at build
// time, same as RoundArtifact/WeightedOutcomeLibrary themselves.
export type PreGeneratedRoundResult<T extends string | number = string> = {
    readonly schemaVersion: number;
    readonly selection: PreGeneratedRoundSelectionProvenance;
    readonly runtime: PreGeneratedRoundRuntimeContext;
    readonly artifact: RoundArtifact<T>;
};
