import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";
import type {GameSessionSerializing} from "../../net/GameSessionSerializing.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {captureBaseSessionState} from "./captureBaseSessionState.js";
import type {PokieSessionState} from "./PokieSessionState.js";

// Snapshots a freshly created session into a serializable PokieSessionState — bet/win/screen/
// featureState (see captureBaseSessionState) plus, when `serializer` is given, its
// getInitialData(session) output as `initialPayload` (see PokieSessionState's own doc comment for
// why this is captured once here and carried forward rather than recomputed on every spin — see
// captureRoundPokieSessionState, the counterpart used after play()).
export function captureInitialPokieSessionState(
    context: PokieGameContext | undefined,
    session: GameSessionHandling,
    serializer?: GameSessionSerializing,
): PokieSessionState {
    const state = captureBaseSessionState(context, session);

    if (serializer !== undefined) {
        state.initialPayload = serializer.getInitialData(session) as unknown as Record<string, unknown>;
    }

    return state;
}
