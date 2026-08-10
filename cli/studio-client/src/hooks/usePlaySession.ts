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
    const [sessionId, setSessionId] = useState<string>();

    // Same monotonic-requestId staleness guard pattern used throughout Studio's own page-level hooks,
    // one level simpler here: Play has only ever one in-flight-mutation slot (newSession/spin), never a
    // separate state/session pair to guard against each other.
    const requestIdRef = useRef(0);
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
                    setSessionId(result.status === "ok" ? result.session.sessionId : undefined);
                })
                .catch((error: unknown) => {
                    if (requestId === requestIdRef.current) {
                        setSession({status: "error", message: errorMessage(error)});
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
        (action: (sid: string) => Promise<Parameters<typeof describePlaySpinResult>[0]>) => {
            if (sessionId === undefined || !spinGuard.begin()) {
                return;
            }
            const requestId = ++requestIdRef.current;
            setSession({status: "loading"});
            action(sessionId)
                .then((result) => {
                    if (requestId !== requestIdRef.current) {
                        return;
                    }
                    const described = describePlaySpinResult(result);
                    setSession(described);
                    if (described.status === "ok") {
                        onRoundRecorded?.();
                    }
                })
                .catch((error: unknown) => {
                    if (requestId === requestIdRef.current) {
                        setSession({status: "error", message: errorMessage(error)});
                    }
                })
                .finally(() => spinGuard.end());
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fetchImpl, sessionId, onRoundRecorded],
    );

    const spin = useCallback(() => {
        runSpinAction((sid) => spinPlaySession(fetchImpl, sid));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runSpinAction, fetchImpl]);

    // Studio Play's "Find any win" scenario control -- repeats real, authoritative spins server-side (see
    // StudioPlayService.findAnyWin()'s own doc comment) until one actually wins, then renders that round
    // through the exact same RoundSummary chain a plain Spin does.
    const findAnyWin = useCallback(() => {
        runSpinAction((sid) => findAnyWinPlaySession(fetchImpl, sid));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runSpinAction, fetchImpl]);

    // Studio Play's "Find symbol win" scenario control -- same real, authoritative search as findAnyWin()
    // above, but for a specific symbol (PlayTab's own chooser), propagated straight through to
    // StudioPlayService.findSymbolWin().
    const findSymbolWin = useCallback(
        (symbolId: string) => {
            runSpinAction((sid) => findSymbolWinPlaySession(fetchImpl, sid, symbolId));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [runSpinAction, fetchImpl],
    );

    // Studio Play's "Find free games" scenario control -- the canonical shared "custom scenario"
    // abstraction (see StudioPlayService.findFreeGames()'s own doc comment); same real, authoritative
    // search as findAnyWin() above.
    const findFreeGames = useCallback(() => {
        runSpinAction((sid) => findFreeGamesPlaySession(fetchImpl, sid));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runSpinAction, fetchImpl]);

    // Called from ProjectDashboardPage's own projectKey effect -- a genuinely different project must
    // never show a trace of the previous one's session. Bumps the request id first, so a newSession()/
    // spin() call still in flight from before the switch can never land afterward and repopulate what's
    // being cleared here.
    const resetForProjectSwitch = useCallback(() => {
        requestIdRef.current++;
        setSession({status: "idle"});
        setSessionId(undefined);
    }, []);

    return {session, sessionId, newSession, spin, findAnyWin, findSymbolWin, findFreeGames, resetForProjectSwitch};
}
