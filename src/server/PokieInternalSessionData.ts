import type {PokieSessionState} from "./session/PokieSessionState.js";

// The internal/debug companion to a public PokieDevSessionResponse — audit/dev-only data
// PokieDevServer never includes in a response unless a request explicitly opts in (the `debug` query
// parameter — see PokieDevServer's public/internal split, docs/cli.md "pokie serve"). POKIE is still
// not an RGS: this is a dev-friendly window into normally-hidden state, not an audit-grade guarantee.
export type PokieInternalSessionData = {
    // The session's raw, persisted PokieSessionState right after this response's round (or, for
    // POST /sessions and GET /sessions/:id, the state as it currently stands) — context, bet, win,
    // screen, featureState, and the serializer's own initialPayload/roundPayload, unfiltered.
    stateAfter: PokieSessionState;
    // The same, but as it stood immediately before this round was played — only present on a spin
    // response, since session creation and a GET restore have no "before" to compare against.
    stateBefore?: PokieSessionState;
    // The serializer's own getInitialDebugData()/getRoundDebugData() output, when it implements
    // either — RNG info, reel stops, evaluator traces, anything a game author chose to expose for
    // local debugging (see GameSessionSerializing's own doc comment). Absent for a serializer that
    // implements neither, or when there's no serializer at all (legacy game package fallback).
    debugData?: Record<string, unknown>;
    // The requestId this spin was made (or replayed) with, when one was given — idempotency
    // metadata, only meaningful on a spin response.
    requestId?: string;
};
