import type {BuildableFromSessionState} from "../../session/BuildableFromSessionState.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";

// The restoring half of captureFeatureState(): a no-op unless both featureState was actually
// captured (undefined otherwise, e.g. a fresh session with no prior persisted state) and the
// reconstructed session implements BuildableFromSessionState.
export function restoreFeatureState(session: GameSessionHandling, featureState: unknown): void {
    if (featureState === undefined || !canRestoreSessionState(session)) {
        return;
    }
    session.fromSessionState(featureState);
}

function canRestoreSessionState(
    session: GameSessionHandling,
): session is GameSessionHandling & BuildableFromSessionState {
    return typeof (session as Partial<BuildableFromSessionState>).fromSessionState === "function";
}
