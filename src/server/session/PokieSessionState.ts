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
    // Present only when the loaded PokieGame implements the optional getSessionSerializer() —
    // captured once, at session creation, from that serializer's getInitialData(session) (see
    // captureInitialPokieSessionState.ts). Carried forward unchanged on every subsequent spin (see
    // captureRoundPokieSessionState.ts) — a session's descriptive data (paytable, availableSymbols,
    // linesDefinitions, ...) doesn't change between rounds, so it's never recomputed after creation.
    initialPayload?: Record<string, unknown>;
    // Present only when the loaded PokieGame implements getSessionSerializer() AND at least one spin
    // has happened — that serializer's getRoundData(session) output from the *last* spin (see
    // captureRoundPokieSessionState.ts). Replaced on every spin; never present on a freshly created
    // session's own state.
    roundPayload?: Record<string, unknown>;
};
