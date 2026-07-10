import type {GameSessionHandling} from "../../session/GameSessionHandling.js";

type SessionWithScreen = GameSessionHandling & {
    getSymbolsCombination(): {toMatrix(transposed?: boolean): unknown[][]};
};

// Feature-detected: only games exposing getSymbolsCombination() (e.g. VideoSlotSession) have a
// screen to capture — anything else yields null, which callers omit from PokieSessionState rather
// than persisting.
export function captureScreen(session: GameSessionHandling): unknown[][] | null {
    if (!hasSymbolsCombination(session)) {
        return null;
    }
    return session.getSymbolsCombination().toMatrix();
}

function hasSymbolsCombination(session: GameSessionHandling): session is SessionWithScreen {
    return typeof (session as Partial<SessionWithScreen>).getSymbolsCombination === "function";
}
