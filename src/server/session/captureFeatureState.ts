import type {ConvertableToSessionState} from "../../session/ConvertableToSessionState.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";

// Feature-detected: only games implementing ConvertableToSessionState (e.g.
// VideoSlotWithFreeGamesSession) expose more than base bet/credits/win — anything else yields
// undefined, which callers omit from PokieSessionState.featureState rather than persisting.
export function captureFeatureState(session: GameSessionHandling): unknown {
    if (!canCaptureSessionState(session)) {
        return undefined;
    }
    return session.toSessionState();
}

function canCaptureSessionState(
    session: GameSessionHandling,
): session is GameSessionHandling & ConvertableToSessionState {
    return typeof (session as Partial<ConvertableToSessionState>).toSessionState === "function";
}
