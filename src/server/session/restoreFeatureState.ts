import type {BuildableFromSessionState} from "../../session/BuildableFromSessionState.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";

// Restore a validated executable snapshot. Missing data or a missing codec is an error,
// never permission to continue from a constructor's default state.
export function restoreFeatureState(session: GameSessionHandling, featureState: unknown): void {
    if (featureState === undefined || !canRestoreSessionState(session)) {
        throw new Error("Required executable state or restoration codec is missing.");
    }
    session.fromSessionState(featureState);
}

function canRestoreSessionState(
    session: GameSessionHandling,
): session is GameSessionHandling & BuildableFromSessionState {
    return typeof (session as Partial<BuildableFromSessionState>).fromSessionState === "function";
}
