import {ScreenProjection} from "./videoslot/coordinates/ScreenProjection.js";
import type {ScreenGeometry} from "./videoslot/coordinates/ScreenGeometry.js";
import type {GameSessionHandling} from "./GameSessionHandling.js";

type SessionWithScreen = GameSessionHandling & {
    getScreenGeometry?(): ScreenGeometry | undefined;
    getVisibleSymbolsCombination?(): {toMatrix(): unknown[][]};
    getSymbolsCombination(): {toMatrix(transposed?: boolean): unknown[][]};
};

// Feature-detected: only games exposing getSymbolsCombination() (e.g. VideoSlotSession) have a
// screen to capture — anything else yields null, which callers omit from PokieSessionState rather
// than persisting.
export function captureScreen(session: GameSessionHandling): unknown[][] | null {
    if (!hasSymbolsCombination(session)) {
        return null;
    }
    if (session.getVisibleSymbolsCombination) return session.getVisibleSymbolsCombination().toMatrix();
    const generated = session.getSymbolsCombination().toMatrix();
    const geometry = session.getScreenGeometry?.();
    return geometry ? new ScreenProjection(geometry).project(generated, "visible") : generated;
}

function hasSymbolsCombination(session: GameSessionHandling): session is SessionWithScreen {
    return typeof (session as Partial<SessionWithScreen>).getSymbolsCombination === "function";
}
