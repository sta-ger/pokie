import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";
import type {GameSessionSerializing} from "../../net/GameSessionSerializing.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {captureBaseSessionState} from "./captureBaseSessionState.js";
import type {PokieSessionState} from "./PokieSessionState.js";

// Snapshots a session right after play() into a serializable PokieSessionState — bet/win/screen/
// featureState (see captureBaseSessionState) plus, when `serializer` is given, its
// getRoundData(session) output as `roundPayload`. Carries `previousState.initialPayload` forward
// unchanged: it was already captured once at session creation (see
// captureInitialPokieSessionState) and never needs recomputing, since a session's own descriptive
// data (paytable, availableSymbols, ...) doesn't change between rounds.
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

    if (serializer !== undefined) {
        state.roundPayload = serializer.getRoundData(session) as unknown as Record<string, unknown>;
    }

    return state;
}
