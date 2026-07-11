import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";
import type {GameSessionSerializing} from "../../net/GameSessionSerializing.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {captureBaseSessionState} from "./captureBaseSessionState.js";
import type {PokieSessionState} from "./PokieSessionState.js";

// Snapshots a session right after play() into a serializable PokieSessionState — bet/win/screen/
// featureState (see captureBaseSessionState) plus, when `serializer` is given, its
// getRoundData(session) output as `roundPayload`. Carries `previousState.initialPayload` (and
// `previousState.initialDebugPayload`, see below) forward unchanged: it was already captured once at
// session creation (see captureInitialPokieSessionState) and never needs recomputing, since a
// session's own descriptive data (paytable, availableSymbols, ...) doesn't change between rounds.
//
// When `serializer` additionally implements the optional getRoundDebugData(), its output is captured
// the same way as `roundDebugPayload` — internal/debug-only data PokieDevServer never includes in a
// public response (see its public/internal split).
export function captureRoundPokieSessionState(
    context: PokieGameContext | undefined,
    session: GameSessionHandling,
    previousState: PokieSessionState,
    serializer?: GameSessionSerializing,
): PokieSessionState {
    const state = captureBaseSessionState(context, session);

    if (previousState.initialPayload !== undefined) {
        state.initialPayload = previousState.initialPayload;
    }

    if (previousState.initialDebugPayload !== undefined) {
        state.initialDebugPayload = previousState.initialDebugPayload;
    }

    if (serializer !== undefined) {
        state.roundPayload = serializer.getRoundData(session) as unknown as Record<string, unknown>;

        if (serializer.getRoundDebugData) {
            state.roundDebugPayload = serializer.getRoundDebugData(session);
        }
    }

    return state;
}
