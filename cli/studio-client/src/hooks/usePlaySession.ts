import {useCallback, useRef, useState} from "react";
import {createPlaySession, spinPlaySession} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {errorMessage} from "../domain/errorMessage";
import {describePlaySessionResult, describePlaySpinResult, type PlaySessionResultView, type PlaySpinResultView} from "../domain/interpret/Runtime";
import {useDoubleSubmitGuard} from "./useDoubleSubmitGuard";

export type PlaySessionView = PlaySessionResultView | PlaySpinResultView;

// Owns the Play tab's own state -- a page-level hook (survives tab switches, same reasoning as
// useRuntimeManager), but never shares any of it: Play's own backend (StudioPlayService, see its own
// doc comment) is a genuinely separate, server-less path from the Runtime tab's PokieDevServer-backed
// one, so there's no host/port/baseUrl/repositoryMode/debug-toggle state to own here, only a session.
// "New session" and "Reset" are the exact same action from this hook's own point of view -- both just
// call newSession() again, discarding whatever was active (see StudioPlayService.newSession()'s own doc
// comment) -- PlayTab is what gives the two calls their own distinct labels/affordances.
export function usePlaySession() {
    const fetchImpl = useStudioApi();
    const [session, setSession] = useState<PlaySessionView>({status: "idle"});
    const [sessionId, setSessionId] = useState<string>();

    // Same monotonic-requestId staleness guard useRuntimeManager's own session state uses, one level
    // simpler: Play has only ever one in-flight-mutation slot (newSession/spin), never a separate
    // state/session pair to guard against each other.
    const requestIdRef = useRef(0);
    const newSessionGuard = useDoubleSubmitGuard();
    const spinGuard = useDoubleSubmitGuard();

    const newSession = useCallback(
        (seed?: string) => {
            if (!newSessionGuard.begin()) {
                return;
            }
            const requestId = ++requestIdRef.current;
            setSession({status: "loading"});
            createPlaySession(fetchImpl, seed)
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

    const spin = useCallback(() => {
        if (sessionId === undefined || !spinGuard.begin()) {
            return;
        }
        const requestId = ++requestIdRef.current;
        setSession({status: "loading"});
        spinPlaySession(fetchImpl, sessionId)
            .then((result) => {
                if (requestId !== requestIdRef.current) {
                    return;
                }
                setSession(describePlaySpinResult(result));
            })
            .catch((error: unknown) => {
                if (requestId === requestIdRef.current) {
                    setSession({status: "error", message: errorMessage(error)});
                }
            })
            .finally(() => spinGuard.end());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchImpl, sessionId]);

    // Called from ProjectDashboardPage's own projectKey effect -- a genuinely different project must
    // never show a trace of the previous one's session (same reasoning as useRuntimeManager's own
    // resetForProjectSwitch()). Bumps the request id first, so a newSession()/spin() call still in
    // flight from before the switch can never land afterward and repopulate what's being cleared here.
    const resetForProjectSwitch = useCallback(() => {
        requestIdRef.current++;
        setSession({status: "idle"});
        setSessionId(undefined);
    }, []);

    return {session, sessionId, newSession, spin, resetForProjectSwitch};
}
