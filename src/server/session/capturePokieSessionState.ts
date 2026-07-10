import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";
import type {GameSessionSerializing} from "../../net/GameSessionSerializing.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {captureFeatureState} from "./captureFeatureState.js";
import {captureScreen} from "./captureScreen.js";
import type {PokieSessionState} from "./PokieSessionState.js";

// Snapshots a live session's current bet/win/screen/featureState (plus, when `serializer` is
// given, its full serializedPayload — see PokieSessionState's own doc comment for why this is
// captured here rather than lazily re-derived later) into a serializable PokieSessionState, the
// shape both PokieDevServer.handleCreateSession and SpinCommandHandler persist through
// SessionRepository. `context` is passed in rather than read off the session, since it's the value
// the session was originally constructed with (game.createSession(context)), not something a
// GameSessionHandling exposes itself.
export function capturePokieSessionState(
    context: PokieGameContext | undefined,
    session: GameSessionHandling,
    serializer?: GameSessionSerializing,
): PokieSessionState {
    const state: PokieSessionState = {context, bet: session.getBet(), win: session.getWinAmount()};

    const screen = captureScreen(session);
    if (screen !== null) {
        state.screen = screen;
    }

    const featureState = captureFeatureState(session);
    if (featureState !== undefined) {
        state.featureState = featureState;
    }

    if (serializer !== undefined) {
        state.serializedPayload = serializer.getInitialData(session) as unknown as Record<string, unknown>;
    }

    return state;
}
