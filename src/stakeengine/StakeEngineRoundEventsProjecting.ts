import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import type {StakeEngineEvent} from "./StakeEngineEvent.js";

// Everything a round-level projection needs beyond the RoundArtifact itself: the mode's own Stake "cost", since
// converting a win amount/payoutMultiplier into Stake Engine's integer unit convention (see
// convertRatioToStakeUnits) depends on which mode this outcome belongs to, not just the artifact's own stake.
export type StakeEngineRoundProjectionContext = {
    readonly cost: number;
};

// RoundArtifact -> Stake Engine "events" projection. Deliberately its own interface rather than reusing the
// generic RoundArtifactProjector<T, TOutput> (see RoundArtifactProjector.ts): a Stake projection needs the
// mode's own cost to convert amounts into Stake's integer unit convention, so "context" is an explicit, required
// second argument here rather than something a projector would have to reach for out of band. May throw for any
// reason a projection can legitimately fail (most commonly: an amount that isn't representable as a non-negative
// safe integer once converted, see convertRatioToStakeUnits) — StakeEngineExporter treats any thrown error, from
// this standard implementation or any custom one, as a validation failure that blocks the export, never as a
// crash.
export interface StakeEngineRoundEventsProjecting<T extends string | number = string> {
    project(artifact: RoundArtifact<T>, context: StakeEngineRoundProjectionContext): readonly StakeEngineEvent[];
}
