import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";
import type {GameSessionSerializing} from "../../net/GameSessionSerializing.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {captureBaseSessionState} from "./captureBaseSessionState.js";
import type {PokieSessionState} from "./PokieSessionState.js";

// Snapshots a freshly created session into a serializable PokieSessionState — bet/win/screen/
// featureState (see captureBaseSessionState) plus, when `serializer` is given, its
// getInitialData(session) output as `initialPayload` (see PokieSessionState's own doc comment for
// why this is captured once here and carried forward rather than recomputed on every spin — see
// captureRoundPokieSessionState, the counterpart used after play()). When `serializer` additionally
// implements the optional getInitialDebugData(), its output is captured the same way as
// `initialDebugPayload` — internal/debug-only data PokieDevServer never includes in a public
// response (see its public/internal split).
//
// `captureDebugData` (default true, matching every caller/behavior that predates this parameter) is
// the one knob that decides whether `initialDebugPayload` is captured into the *persisted*
// PokieSessionState at all — see PokieDevServerOptions.captureDebugSessionData's own doc comment for
// why a production deployment may want this off even though `?debug=1` itself stays a per-request
// concern: a durable SessionRepository (e.g. FileSessionRepository) persists whatever this function
// returns regardless of whether any individual request ever asks for `internal` data, so this is the
// only place that can actually stop debug-only content (RNG seeds, reel stops, evaluator traces) from
// ever reaching disk.
export function captureInitialPokieSessionState(
    context: PokieGameContext | undefined,
    session: GameSessionHandling,
    serializer?: GameSessionSerializing,
    captureDebugData = true,
): PokieSessionState {
    const state = captureBaseSessionState(context, session);

    if (serializer !== undefined) {
        state.initialPayload = serializer.getInitialData(session) as unknown as Record<string, unknown>;

        if (serializer.getInitialDebugData && captureDebugData) {
            state.initialDebugPayload = serializer.getInitialDebugData(session);
        }
    }

    return state;
}
