// Studio's own session response DTO for the Runtime tab's Session Tools — built from
// RuntimeSessionClient's raw PokieDevServer response by StudioRuntimeManager (see its own doc
// comment): every public field PokieDevServer returned is spread through as-is (including any rich
// serializer-specific fields — paytable, reelsSymbols, etc. — hence the index signature, same escape
// hatch PokieDevSessionResponse itself uses), `sessionVersion` is hoisted to the top level
// unconditionally (whenever the configured repository is versioned, regardless of debug mode — central
// to demonstrating optimistic locking in the tab), and `debug` is attached only when the runtime was
// started with debug mode on. Never the raw PokieSessionState/repository/wallet objects themselves —
// only what PokieDevServer's own public+internal JSON already exposes over HTTP.
export type StudioRuntimeSessionView = {
    sessionId: string;
    game: {id: string; name: string; version: string};
    credits: number;
    bet?: number;
    win?: number;
    screen?: unknown[][];
    sessionVersion?: number;
    // Studio's own bookkeeping, not part of the game/public wire contract at all -- the client-supplied
    // requestId a spin was called with, recorded by StudioRuntimeManager.spin() directly from its own
    // parameter (not read back out of `internal`), so it's present on every recorded recent spin
    // regardless of debug mode. This is what lets "Debug this round"/the Session Spin find method locate
    // one exact spin among several recent ones even when debug mode is off -- unlike `debug.requestId`
    // below (the game server's own echoed value, only ever present alongside the rest of the debug
    // bundle).
    studioRequestId?: string;
    debug?: {
        stateAfter: unknown;
        stateBefore?: unknown;
        debugData?: Record<string, unknown>;
        requestId?: string;
    };
} & Record<string, unknown>;
