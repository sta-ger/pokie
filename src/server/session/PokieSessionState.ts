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
};
