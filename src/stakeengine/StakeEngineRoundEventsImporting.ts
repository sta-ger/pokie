import type {RoundArtifactFeatureEventInput} from "../artifact/RoundArtifactFeatureEvent.js";
import type {StakeEngineEvent} from "./StakeEngineEvent.js";

// Everything StakeEngineRoundEventsImporter needs beyond the raw events themselves: neither the mode's own Stake
// "cost" nor the round's own "stake" is recoverable from the event data alone (see
// StakeEngineRoundEventsProjecting's own StakeEngineRoundProjectionContext, whose forward-direction conversions
// this reverses).
export type StakeEngineRoundImportContext = {
    readonly cost: number;
    readonly stake: number;
};

// One reconstructed step: "screen" is exactly what the forward projector's "reveal" event carried; "totalWin" is
// the reversed (never rounded) raw currency amount; "featureEvents" is whatever passed-through feature events
// belonged to this step, in order.
export type StakeEngineImportedStep<T extends string | number = string> = {
    readonly screen: readonly (readonly T[])[];
    readonly totalWin: number;
    readonly featureEvents: readonly RoundArtifactFeatureEventInput[];
};

// The generic, mechanic-agnostic shape StakeEngineRoundEventsImporter reconstructs from one book line's events —
// deliberately not a RoundArtifact itself (mirrors the forward split exactly: StakeEngineRoundEventsProjector
// only ever consumes an already-built RoundArtifact, never builds one; symmetrically, this only reconstructs the
// generic steps/features/totals shape — assembling a RoundArtifact, including the synthetic win components a
// step's own totalWin requires, is StakeEngineImporter's own job).
export type StakeEngineImportedRound<T extends string | number = string> = {
    readonly steps: readonly StakeEngineImportedStep<T>[];
    readonly roundFeatureEvents: readonly RoundArtifactFeatureEventInput[];
    readonly totalWin: number;
    readonly payoutMultiplier: number;
};

// RoundArtifact "events" -> Stake Engine reconstruction, the reverse of StakeEngineRoundEventsProjecting<T>. Its
// own interface, not a generic one, for the same reason the forward direction has its own: the mode's own
// cost/stake are required, explicit context, not something an importer would otherwise have to reach for out of
// band. May throw StakeEngineImportEventsError for any structurally invalid input (missing/misplaced
// reveal/finalWin, an amount that isn't representable without hidden rounding, ...) — StakeEngineImporter treats
// any thrown error, from this standard implementation or a custom one, as a validation failure that blocks the
// import, never as a crash.
export interface StakeEngineRoundEventsImporting<T extends string | number = string> {
    importEvents(events: readonly StakeEngineEvent[], context: StakeEngineRoundImportContext): StakeEngineImportedRound<T>;
}
