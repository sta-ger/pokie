import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {captureFeatureState} from "./captureFeatureState.js";
import {captureScreen} from "./captureScreen.js";
import type {PokieSessionState} from "./PokieSessionState.js";

// The bet/win/screen/featureState snapshot shared by both captureInitialPokieSessionState (session
// creation) and captureRoundPokieSessionState (after a spin) — the part of PokieSessionState that
// doesn't depend on whether a serializer is involved at all. `context` is passed in rather than
// read off the session, since it's the value the session was originally constructed with
// (game.createSession(context)), not something a GameSessionHandling exposes itself.
export function captureBaseSessionState(
    context: PokieGameContext | undefined,
    session: GameSessionHandling,
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

    return state;
}
