import {captureCoordinatePublicPayload} from "./internal/captureCoordinatePublicPayload.js";
import {cloneSessionData} from "../../runtime/internal/cloneSessionData.js";
import {buildRoundRecordFromSession} from "../../roundrecord/buildRoundRecordFromSession.js";
import {RoundRecordBuildError} from "../../roundrecord/RoundRecordBuildError.js";
import type {RoundRecordOrigin} from "../../roundrecord/RoundRecordOrigin.js";
import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";
import type {GameSessionSerializing} from "../../net/GameSessionSerializing.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import type {VideoSlotSessionHandling} from "../../session/videoslot/VideoSlotSessionHandling.js";
import {captureBaseSessionState} from "./captureBaseSessionState.js";
import type {PokieSessionState} from "./PokieSessionState.js";
import {buildSessionCapturePolicy, type SessionCapturePolicy} from "./SessionCapturePolicy.js";

// What a caller (SpinCommandHandler, or any other captureRoundPokieSessionState caller that wants full
// capture) supplies about *this specific round* so a "full" SessionCapturePolicy can build a real
// RoundRecord from it — never inferred from session/wallet state, same "caller supplies it, this
// library never guesses" discipline buildRoundRecordFromSession's own doc comment already documents
// for betMode/stake.
export type RoundRecordCaptureRequest = {
    roundId: string;
    origin: RoundRecordOrigin;
    betMode?: string;
    stake?: number;
    // The operation that produced this round (e.g. "spin") — carried into the built artifact's own
    // `debug` bag (see buildFullRoundRecord below), since RoundRecord itself has no dedicated field
    // for "what command ran this".
    command?: string;
    // The wallet's own authoritative balance right after this round settled — same reasoning as
    // `command` above, carried into `debug` rather than invented as a new top-level RoundRecord field.
    credits?: number;
};

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
//
// `capturePolicy` (default: partial, with debug payloads captured — matching every caller/behavior that
// predates this policy) is the versioned SessionCapturePolicy (see SessionCapturePolicy.ts) this capture
// runs under. `capturePolicy.captureDebugPayloads` mirrors the old standalone `captureDebugData` boolean
// this function used to take directly: when false, neither `previousState.initialDebugPayload` is
// carried forward nor a fresh `roundDebugPayload` captured, so a session started under a "don't persist
// debug data" policy never accumulates any regardless of how many rounds it plays.
//
// `capturePolicy.mode === "full"` additionally builds and persists a complete RoundRecord (see
// buildRoundRecordFromSession) as `roundRecord` — but only when `roundRecordRequest` was actually
// supplied (a caller must have a roundId/origin to give it) AND `session` has the
// VideoSlotSessionHandling shape buildRoundRecordFromSession requires. Either gap is recorded as
// `roundRecordUnavailableReason` — an honest diagnostic, never a fabricated artifact — so a reader can
// tell "this round genuinely has no RoundRecord" apart from "something went wrong capturing one".
export function captureRoundPokieSessionState(
    context: PokieGameContext | undefined,
    session: GameSessionHandling,
    previousState: PokieSessionState,
    serializer?: GameSessionSerializing,
    capturePolicy: SessionCapturePolicy = buildSessionCapturePolicy("partial", true),
    roundRecordRequest: RoundRecordCaptureRequest | undefined = undefined,
): PokieSessionState {
    const state = captureBaseSessionState(context, session);
    state.capturePolicy = capturePolicy;
    state.identity = previousState.identity;
    // The validated record may restrict the model's selections for this session.
    // Carry that authority through settlement, retries and captured recovery state.
    if (previousState.commandCapabilities !== undefined) state.commandCapabilities = previousState.commandCapabilities;
    if (previousState.executionState === "live-only") state.executionState = "live-only";

    if (previousState.initialPayload !== undefined) {
        state.initialPayload = previousState.initialPayload;
    }

    if (previousState.initialDebugPayload !== undefined && capturePolicy.captureDebugPayloads) {
        state.initialDebugPayload = previousState.initialDebugPayload;
    }

    if (serializer !== undefined) {
        state.roundPayload = captureCoordinatePublicPayload(state, serializer.getRoundData(session));

        if (serializer.getRoundDebugData && capturePolicy.captureDebugPayloads) {
            state.roundDebugPayload = serializer.getRoundDebugData(session);
        }
    }

    if (capturePolicy.mode === "full") {
        captureFullRoundRecord(context, state, previousState, session, capturePolicy, roundRecordRequest);
    }

    return cloneSessionData(state);
}

function captureFullRoundRecord(
    context: PokieGameContext | undefined,
    state: PokieSessionState,
    previousState: PokieSessionState,
    session: GameSessionHandling,
    capturePolicy: SessionCapturePolicy,
    roundRecordRequest: RoundRecordCaptureRequest | undefined,
): void {
    if (roundRecordRequest === undefined) {
        state.roundRecordUnavailableReason =
            "SessionCapturePolicy.mode is \"full\", but no RoundRecordCaptureRequest (roundId/origin) was supplied for this round.";
        return;
    }
    if (!hasVideoSlotShape(session)) {
        state.roundRecordUnavailableReason =
            "SessionCapturePolicy.mode is \"full\", but this session does not implement the VideoSlotSessionHandling " +
            "shape (getSymbolsCombination/getWinEvaluationResult) buildRoundRecordFromSession requires.";
        return;
    }

    try {
        state.roundRecord = buildRoundRecordFromSession(session, {
            roundId: roundRecordRequest.roundId,
            origin: roundRecordRequest.origin,
            betMode: roundRecordRequest.betMode,
            stake: roundRecordRequest.stake,
            debug: buildRoundRecordDebugSummary(context, state, previousState, roundRecordRequest, capturePolicy),
        });
    } catch (error) {
        if (state.coordinates) throw error;
        state.roundRecordUnavailableReason =
            error instanceof RoundRecordBuildError
                ? `buildRoundRecordFromSession failed (${error.getCode()}): ${error.message}`
                : `buildRoundRecordFromSession failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}

// Everything a "full" capture owes the round beyond what RoundRecord already has dedicated top-level
// fields for (screen/wins/steps/betMode/stake/origin) — command, credits, the session context's own
// seed (when the session was actually given one — see PokieGameContext.seed — never fabricated when it
// wasn't), and a before/after state summary — has no field of its own on RoundRecord, so it's carried
// in `debug` instead (a plain, caller-defined JsonObject — see RoundRecord's own doc comment). The
// serializer's own debug-only payload (initialDebugPayload/roundDebugPayload) is merged in under
// `debugPayloads`, but only when this policy still wants debug payloads captured at all.
function buildRoundRecordDebugSummary(
    context: PokieGameContext | undefined,
    state: PokieSessionState,
    previousState: PokieSessionState,
    roundRecordRequest: RoundRecordCaptureRequest,
    capturePolicy: SessionCapturePolicy,
): Record<string, unknown> {
    const debugPayloads =
        capturePolicy.captureDebugPayloads && (state.initialDebugPayload !== undefined || state.roundDebugPayload !== undefined)
            ? {...state.initialDebugPayload, ...state.roundDebugPayload}
            : undefined;

    return {
        command: roundRecordRequest.command ?? "spin",
        ...(roundRecordRequest.credits !== undefined ? {credits: roundRecordRequest.credits} : {}),
        ...(context?.seed !== undefined ? {seed: context.seed} : {}),
        stateBefore: summarizeStateForDebug(previousState),
        stateAfter: summarizeStateForDebug(state),
        ...(debugPayloads !== undefined ? {debugPayloads} : {}),
    };
}

// `screen` is optional on PokieSessionState (see captureBaseSessionState — omitted for a game with no
// getSymbolsCombination()), so it's only included here when actually present; an explicit `undefined`
// value would otherwise fail buildRoundRecord's own JSON-safety check (see toCanonicalJson).
function summarizeStateForDebug(state: PokieSessionState): Record<string, unknown> {
    return {bet: state.bet, win: state.win, ...(state.screen !== undefined ? {screen: state.screen} : {})};
}

function hasVideoSlotShape(session: GameSessionHandling): session is VideoSlotSessionHandling {
    const candidate = session as Partial<VideoSlotSessionHandling>;
    return typeof candidate.getSymbolsCombination === "function" && typeof candidate.getWinEvaluationResult === "function";
}
