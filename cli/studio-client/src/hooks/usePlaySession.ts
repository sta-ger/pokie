import {useCallback, useRef, useState} from "react";
import {createPlaySession, findAnyWinPlaySession, findFreeGamesPlaySession, findSymbolWinPlaySession, spinPlaySession} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {errorMessage} from "../domain/errorMessage";
import {describePlaySessionResult, describePlaySpinResult, type PlaySessionResultView, type PlaySpinResultView} from "../domain/interpret/Runtime";
import {useDoubleSubmitGuard} from "./useDoubleSubmitGuard";

export type PlaySessionView = PlaySessionResultView | PlaySpinResultView;

// Owns the Play tab's own state -- a page-level hook (survives tab switches), server-less: Play's own
// backend (StudioPlayService, see its own doc comment) is a genuinely separate, in-process path, so
// there's no host/port/baseUrl/repositoryMode/debug-toggle state to own here, only a session.
// "New session" and "Reset" are the exact same action from this hook's own point of view -- both just
// call newSession() again, discarding whatever was active (see StudioPlayService.newSession()'s own doc
// comment) -- PlayTab is what gives the two calls their own distinct labels/affordances.
// "onRoundRecorded", when given, fires after every successful spin/findAnyWin/findSymbolWin/findFreeGames -- Play's own
// rounds pass through the same shared StudioRoundRecorder every other Studio tab's rounds do (see
// StudioPlayService's own doc comment), so a caller wired to it (ProjectDashboardPage, passing its own
// refreshRecentSpins) sees a Play round in the Replay tab's "Session Spin" list without the user having to
// remember to click that list's own Refresh button.
export function usePlaySession(onRoundRecorded?: () => void) {
    const fetchImpl = useStudioApi();
    const [session, setSession] = useState<PlaySessionView>({status: "idle"});
    const [sessionId, setSessionId] = useState<string | undefined>(undefined);

    // Same monotonic-requestId staleness guard pattern used throughout Studio's own page-level hooks,
    // one level simpler here: Play has only ever one in-flight-mutation slot (newSession/spin), never a
    // separate state/session pair to guard against each other.
    const requestIdRef = useRef(0);
    // A Play action must target the session that was actually accepted by the session-creation
    // response, even while React is scheduling the render that exposes its Spin control. Keeping that
    // identity alongside the rendered state avoids a click being silently discarded by a callback that
    // closed over a prior render's undefined session id.
    const activeSessionIdRef = useRef<string | undefined>(undefined);
    const newSessionGuard = useDoubleSubmitGuard();
    const spinGuard = useDoubleSubmitGuard();

    const newSession = useCallback(
        (seed?: string, modeName?: string) => {
            if (!newSessionGuard.begin()) {
                return;
            }
            const requestId = ++requestIdRef.current;
            setSession({status: "loading"});
            createPlaySession(fetchImpl, seed, modeName)
                .then((result) => {
                    if (requestId !== requestIdRef.current) {
                        return;
                    }
                    setSession(describePlaySessionResult(result));
                    const nextSessionId = result.status === "ok" ? result.session.sessionId : undefined;
                    activeSessionIdRef.current = nextSessionId;
                    setSessionId(nextSessionId);
                })
                .catch((error: unknown) => {
                    if (requestId === requestIdRef.current) {
                        setSession({status: "error", message: errorMessage(error)});
                        activeSessionIdRef.current = undefined;
                        setSessionId(undefined);
                    }
                })
                .finally(() => newSessionGuard.end());
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fetchImpl],
    );

    // Shared by spin()/findAnyWin()/findSymbolWin() below -- all three are the same "call an action
    // against sessionId, describe whatever PlaySpinResultView comes back" shape, gated by the same
    // spinGuard so a user can't fire two of Play's own scenario actions against the same session at once
    // (see spinGuard's own declaration above).
    const runSpinAction = useCallback(
        (subject: string, action: (sid: string) => Promise<Parameters<typeof describePlaySpinResult>[0]>) => {
            const activeSessionId = activeSessionIdRef.current;
            if (activeSessionId === undefined || !spinGuard.begin()) {
                return;
            }
            const requestId = ++requestIdRef.current;
            setSession({status: "loading"});
            action(activeSessionId)
                .then((result) => {
                    if (requestId !== requestIdRef.current) {
                        return;
                    }
                    const described = describePlaySpinResult(result);
                    setSession(described.status === "error" ? {...described, subject} : described);
                    if (described.status === "ok") {
                        onRoundRecorded?.();
                    }
                })
                .catch((error: unknown) => {
                    if (requestId === requestIdRef.current) {
                        setSession({status: "error", message: errorMessage(error), subject});
                    }
                })
                .finally(() => spinGuard.end());
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fetchImpl, onRoundRecorded],
    );

    const spin = useCallback((bet?: number, mode?: string) => {
        runSpinAction("This spin", (sid) => spinPlaySession(fetchImpl, sid, bet, mode));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runSpinAction, fetchImpl]);

    // Studio Play's "Find any win" scenario control -- repeats real, authoritative spins server-side (see
    // StudioPlayService.findAnyWin()'s own doc comment) until one actually wins, then renders that round
    // through the exact same RoundSummary chain a plain Spin does.
    const findAnyWin = useCallback(() => {
        runSpinAction("Find any win", (sid) => findAnyWinPlaySession(fetchImpl, sid));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runSpinAction, fetchImpl]);

    // Studio Play's "Find symbol win" scenario control -- same real, authoritative search as findAnyWin()
    // above, but for a specific symbol (PlayTab's own chooser), propagated straight through to
    // StudioPlayService.findSymbolWin().
    const findSymbolWin = useCallback(
        (symbolId: string) => {
            runSpinAction("Find symbol win", (sid) => findSymbolWinPlaySession(fetchImpl, sid, symbolId));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [runSpinAction, fetchImpl],
    );

    // Studio Play's "Find free games" scenario control -- the canonical shared "custom scenario"
    // abstraction (see StudioPlayService.findFreeGames()'s own doc comment); same real, authoritative
    // search as findAnyWin() above.
    const findFreeGames = useCallback(() => {
        runSpinAction("Find free games", (sid) => findFreeGamesPlaySession(fetchImpl, sid));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runSpinAction, fetchImpl]);

    // Called from ProjectDashboardPage's own projectKey effect -- a genuinely different project must
    // never show a trace of the previous one's session. Bumps the request id first, so a newSession()/
    // spin() call still in flight from before the switch can never land afterward and repopulate what's
    // being cleared here.
    const resetForProjectSwitch = useCallback(() => {
        requestIdRef.current++;
        activeSessionIdRef.current = undefined;
        setSession({status: "idle"});
        setSessionId(undefined);
    }, []);

    return {session, sessionId, newSession, spin, findAnyWin, findSymbolWin, findFreeGames, resetForProjectSwitch};
}
