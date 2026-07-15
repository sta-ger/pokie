import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import type {RoundArtifactFeatureEvent} from "../artifact/RoundArtifactFeatureEvent.js";
import type {RoundArtifactProjector} from "../artifact/RoundArtifactProjector.js";
import type {RoundStepArtifact} from "../artifact/RoundStepArtifact.js";
import type {JsonObject} from "../json/JsonValue.js";
import type {StakeEngineEvent} from "./StakeEngineEvent.js";

// An event's own fields before its final "index" (position in the sequence) is known.
type PendingStakeEngineEvent = JsonObject & {readonly type: string};

function featureEventToStakeEvent(featureEvent: RoundArtifactFeatureEvent): PendingStakeEngineEvent {
    return {...(featureEvent.data ?? {}), type: featureEvent.type};
}

// The standard RoundArtifact -> Stake Engine "events" projection, implementing the same RoundArtifactProjector
// extension point PokieJsonRoundArtifactProjector uses (see its own doc comment: "implement this directly for
// a different representation ... without touching RoundArtifact itself"). Stake's own math-sdk doesn't
// standardize an event schema — every game defines its own mechanic-specific vocabulary (anticipation,
// tumble-specific fields, ...) — so this deliberately only maps what RoundArtifact itself already models
// generically, in order:
//   1. per step (in order): a "reveal" event carrying that step's screen, then that step's own featureEvents
//      (passed through as-is, spread into the event alongside their own "type"), then a "win" event if the
//      step paid out anything.
//   2. any round-level-only featureEvents (i.e. passed directly to buildRoundArtifact's own "featureEvents"
//      option, rather than attached to a step).
//   3. exactly one "finalWin" event carrying the round's total win and payout multiplier.
// Every event is stamped with its own "index" (its position in the final sequence) last, so it always reflects
// the true position even if a passed-through featureEvent's data happened to carry its own "index" field.
//
// artifact.featureEvents is itself every step's own featureEvents flattened, followed by the round-level-only
// ones (see buildRoundArtifact: `featureEvents = [...stepFeatureEvents, ...optionFeatureEvents]`) — so once
// each step's own featureEvents have already been emitted in the loop below, only the tail past that same
// count is genuinely round-level-only; re-emitting the whole array here would double-count every step's events.
export class StakeEngineRoundEventsProjector<T extends string | number = string>
implements RoundArtifactProjector<T, readonly StakeEngineEvent[]> {
    public project(artifact: RoundArtifact<T>): readonly StakeEngineEvent[] {
        const events: PendingStakeEngineEvent[] = [];
        let stepFeatureEventCount = 0;

        artifact.steps.forEach((step: RoundStepArtifact<T>) => {
            events.push({type: "reveal", board: step.screen});
            (step.featureEvents ?? []).forEach((featureEvent) => {
                events.push(featureEventToStakeEvent(featureEvent));
                stepFeatureEventCount++;
            });
            if (step.totalWin > 0) {
                events.push({type: "win", amount: step.totalWin});
            }
        });

        (artifact.featureEvents ?? []).slice(stepFeatureEventCount).forEach((featureEvent) => {
            events.push(featureEventToStakeEvent(featureEvent));
        });

        events.push({type: "finalWin", amount: artifact.totalWin, payoutMultiplier: artifact.payoutMultiplier});

        return events.map((event, index) => ({...event, index}));
    }
}
