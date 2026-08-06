import {buildRoundArtifactFromSession} from "../../artifact/buildRoundArtifactFromSession.js";
import {RoundArtifactBuildError} from "../../artifact/RoundArtifactBuildError.js";
import type {RoundArtifactProvenance} from "../../artifact/RoundArtifactProvenance.js";
import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";
import type {GameSessionSerializing} from "../../net/GameSessionSerializing.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import type {VideoSlotSessionHandling} from "../../session/videoslot/VideoSlotSessionHandling.js";
import {captureBaseSessionState} from "./captureBaseSessionState.js";
import type {PokieSessionState} from "./PokieSessionState.js";
import {buildSessionCapturePolicy, type SessionCapturePolicy} from "./SessionCapturePolicy.js";

// What a caller (SpinCommandHandler, or any other captureRoundPokieSessionState caller that wants full
// capture) supplies about *this specific round* so a "full" SessionCapturePolicy can build a real
// RoundArtifact from it — never inferred from session/wallet state, same "caller supplies it, this
// library never guesses" discipline buildRoundArtifactFromSession's own doc comment already documents
// for betMode/stake.
export type RoundArtifactCaptureRequest = {
    roundId: string;
    provenance: RoundArtifactProvenance;
    betMode?: string;
    stake?: number;
    // The operation that produced this round (e.g. "spin") — carried into the built artifact's own
    // `debug` bag (see buildFullRoundArtifact below), since RoundArtifact itself has no dedicated field
    // for "what command ran this".
    command?: string;
    // The wallet's own authoritative balance right after this round settled — same reasoning as
    // `command` above, carried into `debug` rather than invented as a new top-level RoundArtifact field.
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
// `capturePolicy.mode === "full"` additionally builds and persists a complete RoundArtifact (see
// buildRoundArtifactFromSession) as `roundArtifact` — but only when `roundArtifactRequest` was actually
// supplied (a caller must have a roundId/provenance to give it) AND `session` has the
// VideoSlotSessionHandling shape buildRoundArtifactFromSession requires. Either gap is recorded as
// `roundArtifactUnavailableReason` — an honest diagnostic, never a fabricated artifact — so a reader can
// tell "this round genuinely has no RoundArtifact" apart from "something went wrong capturing one".
export function captureRoundPokieSessionState(
    context: PokieGameContext | undefined,
    session: GameSessionHandling,
    previousState: PokieSessionState,
    serializer?: GameSessionSerializing,
    capturePolicy: SessionCapturePolicy = buildSessionCapturePolicy("partial", true),
    roundArtifactRequest: RoundArtifactCaptureRequest | undefined = undefined,
): PokieSessionState {
    const state = captureBaseSessionState(context, session);
    state.capturePolicy = capturePolicy;

    if (previousState.initialPayload !== undefined) {
        state.initialPayload = previousState.initialPayload;
    }

    if (previousState.initialDebugPayload !== undefined && capturePolicy.captureDebugPayloads) {
        state.initialDebugPayload = previousState.initialDebugPayload;
    }

    if (serializer !== undefined) {
        state.roundPayload = serializer.getRoundData(session) as unknown as Record<string, unknown>;

        if (serializer.getRoundDebugData && capturePolicy.captureDebugPayloads) {
            state.roundDebugPayload = serializer.getRoundDebugData(session);
        }
    }

    if (capturePolicy.mode === "full") {
        captureFullRoundArtifact(context, state, previousState, session, capturePolicy, roundArtifactRequest);
    }

    return state;
}

function captureFullRoundArtifact(
    context: PokieGameContext | undefined,
    state: PokieSessionState,
    previousState: PokieSessionState,
    session: GameSessionHandling,
    capturePolicy: SessionCapturePolicy,
    roundArtifactRequest: RoundArtifactCaptureRequest | undefined,
): void {
    if (roundArtifactRequest === undefined) {
        state.roundArtifactUnavailableReason =
            "SessionCapturePolicy.mode is \"full\", but no RoundArtifactCaptureRequest (roundId/provenance) was supplied for this round.";
        return;
    }
    if (!hasVideoSlotShape(session)) {
        state.roundArtifactUnavailableReason =
            "SessionCapturePolicy.mode is \"full\", but this session does not implement the VideoSlotSessionHandling " +
            "shape (getSymbolsCombination/getWinEvaluationResult) buildRoundArtifactFromSession requires.";
        return;
    }

    try {
        state.roundArtifact = buildRoundArtifactFromSession(session, {
            roundId: roundArtifactRequest.roundId,
            provenance: roundArtifactRequest.provenance,
            betMode: roundArtifactRequest.betMode,
            stake: roundArtifactRequest.stake,
            debug: buildRoundArtifactDebugSummary(context, state, previousState, roundArtifactRequest, capturePolicy),
        });
    } catch (error) {
        state.roundArtifactUnavailableReason =
            error instanceof RoundArtifactBuildError
                ? `buildRoundArtifactFromSession failed (${error.getCode()}): ${error.message}`
                : `buildRoundArtifactFromSession failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}

// Everything a "full" capture owes the round beyond what RoundArtifact already has dedicated top-level
// fields for (screen/wins/steps/betMode/stake/provenance) — command, credits, the session context's own
// seed (when the session was actually given one — see PokieGameContext.seed — never fabricated when it
// wasn't), and a before/after state summary — has no field of its own on RoundArtifact, so it's carried
// in `debug` instead (a plain, caller-defined JsonObject — see RoundArtifact's own doc comment). The
// serializer's own debug-only payload (initialDebugPayload/roundDebugPayload) is merged in under
// `debugPayloads`, but only when this policy still wants debug payloads captured at all.
function buildRoundArtifactDebugSummary(
    context: PokieGameContext | undefined,
    state: PokieSessionState,
    previousState: PokieSessionState,
    roundArtifactRequest: RoundArtifactCaptureRequest,
    capturePolicy: SessionCapturePolicy,
): Record<string, unknown> {
    const debugPayloads =
        capturePolicy.captureDebugPayloads && (state.initialDebugPayload !== undefined || state.roundDebugPayload !== undefined)
            ? {...state.initialDebugPayload, ...state.roundDebugPayload}
            : undefined;

    return {
        command: roundArtifactRequest.command ?? "spin",
        ...(roundArtifactRequest.credits !== undefined ? {credits: roundArtifactRequest.credits} : {}),
        ...(context?.seed !== undefined ? {seed: context.seed} : {}),
        stateBefore: summarizeStateForDebug(previousState),
        stateAfter: summarizeStateForDebug(state),
        ...(debugPayloads !== undefined ? {debugPayloads} : {}),
    };
}

// `screen` is optional on PokieSessionState (see captureBaseSessionState — omitted for a game with no
// getSymbolsCombination()), so it's only included here when actually present; an explicit `undefined`
// value would otherwise fail buildRoundArtifact's own JSON-safety check (see toCanonicalJson).
function summarizeStateForDebug(state: PokieSessionState): Record<string, unknown> {
    return {bet: state.bet, win: state.win, ...(state.screen !== undefined ? {screen: state.screen} : {})};
}

function hasVideoSlotShape(session: GameSessionHandling): session is VideoSlotSessionHandling {
    const candidate = session as Partial<VideoSlotSessionHandling>;
    return typeof candidate.getSymbolsCombination === "function" && typeof candidate.getWinEvaluationResult === "function";
}
