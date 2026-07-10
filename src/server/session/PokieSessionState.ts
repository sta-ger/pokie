import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";

export type PokieSessionState = {
    context?: PokieGameContext;
    bet: number;
    win: number;
    screen?: unknown[][];
    // Opaque to PokieDevServer: whatever a session's own ConvertableToSessionState.toSessionState()
    // returned, restored via BuildableFromSessionState.fromSessionState() on the next reconstruction.
    // Absent for games that implement neither (snapshot-only fallback: bet/win/screen still restore).
    featureState?: unknown;
    // Present only when the loaded PokieGame implements the optional getSessionSerializer() — the
    // full getInitialData(session) output from that serializer, captured at session creation and
    // again after every spin (see capturePokieSessionState.ts). PokieDevServer's GET /sessions/:id
    // reads this straight back out of storage rather than re-serializing a reconstructed session:
    // a freshly reconstructed session only restores `featureState` (a game's own bespoke feature
    // state, e.g. free-games counters), never round-outcome data like the last screen/win/cascade
    // result, so re-running the serializer on it would silently produce a fresh, wrong payload.
    serializedPayload?: Record<string, unknown>;
};
