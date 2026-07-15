import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import type {RoundArtifactFeatureEvent} from "../artifact/RoundArtifactFeatureEvent.js";
import type {RoundStepArtifact} from "../artifact/RoundStepArtifact.js";
import type {JsonObject} from "../json/JsonValue.js";
import {convertRatioToStakeUnits} from "./internal/convertRatioToStakeUnits.js";
import type {StakeEngineEvent} from "./StakeEngineEvent.js";
import type {StakeEngineRoundEventsProjecting, StakeEngineRoundProjectionContext} from "./StakeEngineRoundEventsProjecting.js";

// An event's own fields before its final "index" (position in the sequence) is known.
type PendingStakeEngineEvent = JsonObject & {readonly type: string};

// "reveal"/"win"/"finalWin" are this projector's own structural vocabulary — StakeEngineRoundEventsImporter
// relies on them to unambiguously tell a real feature event apart from a reveal/win/finalWin marker while
// reconstructing a book line's events. A featureEvent whose own type happened to collide with one of these
// would be silently misread as the structural event on import (see the "reserved by convention" limitation this
// closes) — so it's rejected outright here, at the one place such a collision could ever be introduced.
const RESERVED_STAKE_EVENT_TYPES: ReadonlySet<string> = new Set(["reveal", "win", "finalWin"]);

function featureEventToStakeEvent(featureEvent: RoundArtifactFeatureEvent): PendingStakeEngineEvent {
    if (RESERVED_STAKE_EVENT_TYPES.has(featureEvent.type)) {
        throw new Error(
            `featureEvent type "${featureEvent.type}" is reserved by the Stake events encoding ("reveal"/"win"/"finalWin" are structural markers, ` +
                "never a real feature event) — rename this feature event's type before exporting.",
        );
    }
    return {...(featureEvent.data ?? {}), type: featureEvent.type};
}

// Converts a raw currency amount (a step's or the round's own totalWin) into Stake Engine's integer unit
// convention: (amount / stake) * cost * 100 — the same convertRatioToStakeUnits every other Stake amount in
// this package goes through, so a win event and the round's own payoutMultiplier can never silently disagree on
// units. Throws (rather than silently emitting a fractional or rounded value) when the exact result isn't a
// non-negative safe integer — see convertRatioToStakeUnits's own doc comment on why this never rounds.
function stakeAmount(rawAmount: number, stake: number, cost: number, description: string): number {
    const converted = convertRatioToStakeUnits(rawAmount / stake, cost);
    if (converted === undefined) {
        throw new Error(
            `${description} (${rawAmount} / ${stake} stake * ${cost} cost * 100) is not representable as a non-negative safe integer in Stake units.`,
        );
    }
    return converted;
}

// The standard RoundArtifact -> Stake Engine "events" projection (see StakeEngineRoundEventsProjecting for the
// interface this implements and why it takes an explicit context). Stake's own math-sdk doesn't standardize an
// event schema — every game defines its own mechanic-specific vocabulary (anticipation, tumble-specific fields,
// ...) — so this deliberately only maps what RoundArtifact itself already models generically, in order:
//   1. per step (in order): a "reveal" event carrying that step's screen, then that step's own featureEvents
//      (passed through as-is, spread into the event alongside their own "type"), then a "win" event — its
//      amount converted to Stake units — if the step paid out anything.
//   2. any round-level-only featureEvents (i.e. passed directly to buildRoundArtifact's own "featureEvents"
//      option, rather than attached to a step).
//   3. exactly one "finalWin" event carrying the round's total win and payout multiplier, both converted to
//      Stake units.
// Every event is stamped with its own "index" (its position in the final sequence) last, so it always reflects
// the true position even if a passed-through featureEvent's data happened to carry its own "index" field.
//
// artifact.featureEvents is itself every step's own featureEvents flattened, followed by the round-level-only
// ones (see buildRoundArtifact: `featureEvents = [...stepFeatureEvents, ...optionFeatureEvents]`) — so once
// each step's own featureEvents have already been emitted in the loop below, only the tail past that same
// count is genuinely round-level-only; re-emitting the whole array here would double-count every step's events.
export class StakeEngineRoundEventsProjector<T extends string | number = string> implements StakeEngineRoundEventsProjecting<T> {
    public project(artifact: RoundArtifact<T>, context: StakeEngineRoundProjectionContext): readonly StakeEngineEvent[] {
        const events: PendingStakeEngineEvent[] = [];
        let stepFeatureEventCount = 0;

        artifact.steps.forEach((step: RoundStepArtifact<T>) => {
            events.push({type: "reveal", board: step.screen});
            (step.featureEvents ?? []).forEach((featureEvent) => {
                events.push(featureEventToStakeEvent(featureEvent));
                stepFeatureEventCount++;
            });
            if (step.totalWin > 0) {
                events.push({type: "win", amount: stakeAmount(step.totalWin, artifact.stake, context.cost, `step ${step.index}'s win amount`)});
            }
        });

        (artifact.featureEvents ?? []).slice(stepFeatureEventCount).forEach((featureEvent) => {
            events.push(featureEventToStakeEvent(featureEvent));
        });

        const finalPayoutMultiplier = convertRatioToStakeUnits(artifact.payoutMultiplier, context.cost);
        if (finalPayoutMultiplier === undefined) {
            throw new Error(
                `round ${artifact.roundId}'s payoutMultiplier (${artifact.payoutMultiplier} * ${context.cost} cost * 100) is not representable as a non-negative safe integer in Stake units.`,
            );
        }
        events.push({
            type: "finalWin",
            amount: stakeAmount(artifact.totalWin, artifact.stake, context.cost, "the round's final win amount"),
            payoutMultiplier: finalPayoutMultiplier,
        });

        return events.map((event, index) => ({...event, index}));
    }
}
