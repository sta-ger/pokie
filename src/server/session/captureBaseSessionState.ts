import {SessionRuntime} from "../../runtime/SessionRuntime.js";
import {ScreenProjection} from "../../session/videoslot/coordinates/ScreenProjection.js";
import type {VideoSlotSessionHandling} from "../../session/videoslot/VideoSlotSessionHandling.js";
import {cloneSessionData} from "../../runtime/internal/cloneSessionData.js";
import {supportsBetModeSelecting} from "../../session/videoslot/betmode/supportsBetModeSelecting.js";
import {isSessionStateRestorable, resolveSessionStateSchema} from "../../session/SessionStateRestoring.js";
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
    const state: PokieSessionState = {
        context,
        logicalRoundDeliverySupported: SessionRuntime.supportsLogicalRoundDelivery(session),
        stateSchema: resolveSessionStateSchema(session),
        bet: session.getBet(),
        win: session.getWinAmount(),
        credits: session.getCreditsAmount(),
        commandCapabilities: {bets: [...session.getAvailableBets()], ...(supportsBetModeSelecting(session) ? {modes: [...session.getAvailableBetModeIds()]} : {})},
        // A snapshot-only session is safe while its executable object remains
        // live, but is not evidence that a later reconstruction can continue
        // the same RNG/feature stream.  Mark that distinction at capture time
        // so a cache miss never silently turns into a reset.
        executionState: isSessionStateRestorable(session) ? "durably-restorable" : "live-only",
    };

    const screen = captureScreen(session);
    if (screen !== null) {
        state.screen = screen;
    }

    const slot = session as Partial<VideoSlotSessionHandling>;
    const geometry = slot.getScreenGeometry?.();
    if (geometry && !new ScreenProjection(geometry).isIdentity()) {
        state.coordinates = {geometry, generatedScreen: slot.getSymbolsCombination!().toMatrix()};
    }
    const featureState = captureFeatureState(session);
    if (featureState !== undefined) {
        state.featureState = featureState;
    }

    return cloneSessionData(state);
}
