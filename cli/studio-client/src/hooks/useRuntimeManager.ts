import {useCallback, useRef, useState} from "react";
import {
    createRuntimeSession,
    getRuntimeSession,
    getRuntimeState,
    restartRuntime,
    spinRuntimeSession,
    startRuntime,
    stopRuntime,
    type StartRuntimeOptions,
} from "../api/apiClient";
import {useStudioApi} from "../context/StudioApiProvider";
import {errorMessage} from "../domain/errorMessage";
import {formatTimestamp} from "../domain/formatTimestamp";
import {
    describeRuntimeState,
    describeSessionResult,
    describeSpinResult,
    describeStartResult,
    isRuntimeRunning,
    type RuntimeSessionResultView,
    type RuntimeSpinResultView,
    type RuntimeStateView,
} from "../domain/interpret/Runtime";
import {useDoubleSubmitGuard} from "./useDoubleSubmitGuard";

export type RuntimeHistoryEntry = {timestamp: string; action: string; summary: string};
export type RuntimeLastSpin = {requestId?: string; expectedVersion?: number};

const HISTORY_LIMIT = 20;

// Owns the Runtime tab's state -- no polling loop (state only changes on explicit action responses, or
// a manual refresh), but must survive tab switches like every other tab's state (see
// ProjectDashboardPage's own doc comment), so it's a page-level hook, not local to the tab component.
// Every mutating action (start/stop/restart/create-load session/spin) is double-submit-guarded, on top
// of whatever `state.status`/`session.status === "loading"` already surfaces in the UI as a disabled/
// loading button -- see useDoubleSubmitGuard's own doc comment for why both layers matter.
export function useRuntimeManager() {
    const fetchImpl = useStudioApi();
    const [state, setState] = useState<RuntimeStateView>({status: "idle"});
    const [session, setSession] = useState<RuntimeSessionResultView | RuntimeSpinResultView>({status: "idle"});
    const [sessionId, setSessionId] = useState<string>();
    const [history, setHistory] = useState<RuntimeHistoryEntry[]>([]);
    const [lastSpin, setLastSpin] = useState<RuntimeLastSpin>({});

    // Monotonic request id guarding createSession/loadSession/spin against a stale response landing
    // after a newer one -- same requestId/isStale() pattern ProjectDashboardPage.tsx already uses for
    // report/replay/compare fetches. Unlike those, this hook owns its own session-related state
    // directly (not split between a page-level requestId ref and page-level state), so the ref lives
    // here instead. Bumped by each of the three actions' own new call (so switching from Session A to
    // Session B only ever lands B's result) and by resetForProjectSwitch() (so a fetch in flight before
    // a project switch can never repopulate what that reset just cleared).
    const sessionRequestIdRef = useRef(0);

    const startGuard = useDoubleSubmitGuard();
    const stopGuard = useDoubleSubmitGuard();
    const restartGuard = useDoubleSubmitGuard();
    const createSessionGuard = useDoubleSubmitGuard();
    const loadSessionGuard = useDoubleSubmitGuard();
    const spinGuard = useDoubleSubmitGuard();

    const pushHistory = useCallback((action: string, summary: string) => {
        setHistory((prev) => [{timestamp: formatTimestamp(Date.now()), action, summary}, ...prev].slice(0, HISTORY_LIMIT));
    }, []);

    const refresh = useCallback(() => {
        setState({status: "loading"});
        getRuntimeState(fetchImpl)
            .then((result) => setState(describeRuntimeState(result)))
            .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}));
    }, [fetchImpl]);

    // Called from stop()/restart() -- the runtime instance itself just changed (a new/no server), so any
    // createSession/loadSession/spin call still in flight from *before* this ran is now against a
    // session that no longer means anything. Bumping the request id here (not just in
    // resetForProjectSwitch()) is what stops that stale response from landing afterward and silently
    // repopulating sessionId/session with a session tied to the runtime instance that was just torn
    // down -- a real gap the previous pass left unclosed. lastSpin is cleared for the same reason
    // requestId/expectedVersion no longer refer to anything retriable once the session is gone (see
    // repeatSpin's own doc comment).
    const resetSession = useCallback(() => {
        sessionRequestIdRef.current++;
        setSessionId(undefined);
        setSession({status: "idle"});
        setLastSpin({});
    }, []);

    // Called from ProjectDashboardPage's own projectKey effect -- a genuinely different project must
    // never show a trace of the previous one's session, same reasoning as every other tab's own
    // project-switch reset. Bumps the request id first (so anything still in flight from before the
    // switch can never land afterward and repopulate what's being cleared here), then clears every
    // piece of session-scoped state, including the request/response history (a runtime-instance-wide
    // log that's meaningless across a project switch, unlike Stop/Restart's own resetSession() above,
    // which deliberately leaves history alone since that's still the same project/runtime instance).
    const resetForProjectSwitch = useCallback(() => {
        sessionRequestIdRef.current++;
        setSessionId(undefined);
        setSession({status: "idle"});
        setHistory([]);
        setLastSpin({});
    }, []);

    const start = useCallback(
        (options: StartRuntimeOptions) => {
            if (!startGuard.begin()) {
                return;
            }
            setState({status: "loading"});
            startRuntime(fetchImpl, options)
                .then((result) => {
                    const view = describeStartResult(result);
                    setState(view);
                    pushHistory("Start", view.status === "running" ? `running at ${view.baseUrl}` : view.status);
                })
                .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}))
                .finally(() => startGuard.end());
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fetchImpl, pushHistory],
    );

    const stop = useCallback(() => {
        if (!stopGuard.begin()) {
            return;
        }
        stopRuntime(fetchImpl)
            .then((result) => {
                const view = describeRuntimeState(result);
                setState(view);
                pushHistory("Stop", view.status);
                resetSession();
            })
            .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}))
            .finally(() => stopGuard.end());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchImpl, pushHistory, resetSession]);

    const restart = useCallback(
        (options?: StartRuntimeOptions) => {
            if (!restartGuard.begin()) {
                return;
            }
            setState({status: "loading"});
            restartRuntime(fetchImpl, options)
                .then((result) => {
                    const view = describeRuntimeState(result);
                    setState(view);
                    pushHistory("Restart", view.status === "running" ? `running at ${view.baseUrl}` : view.status);
                    resetSession();
                })
                .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}))
                .finally(() => restartGuard.end());
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fetchImpl, pushHistory, resetSession],
    );

    const createSession = useCallback(
        (seed?: string, initialBalance?: number) => {
            if (!createSessionGuard.begin()) {
                return;
            }
            const requestId = ++sessionRequestIdRef.current;
            setSession({status: "loading"});
            createRuntimeSession(fetchImpl, seed, initialBalance)
                .then((result) => {
                    if (requestId !== sessionRequestIdRef.current) {
                        return;
                    }
                    const view = describeSessionResult(result);
                    setSession(view);
                    setSessionId(result.status === "ok" ? result.session.sessionId : undefined);
                    // A freshly created session has no "last spin" of its own yet -- carrying over
                    // whatever a *previous* session's last requestId/expectedVersion was would let
                    // Retry silently resend it against this new session (see repeatSpin's own doc
                    // comment for why that must never happen).
                    setLastSpin({});
                    pushHistory("Create Session", result.status === "ok" ? `session ${result.session.sessionId}` : result.status);
                })
                .catch((error: unknown) => {
                    if (requestId === sessionRequestIdRef.current) {
                        setSession({status: "error", message: errorMessage(error)});
                    }
                })
                .finally(() => createSessionGuard.end());
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fetchImpl, pushHistory],
    );

    const loadSession = useCallback(
        (id: string) => {
            if (!loadSessionGuard.begin()) {
                return;
            }
            const requestId = ++sessionRequestIdRef.current;
            setSession({status: "loading"});
            getRuntimeSession(fetchImpl, id)
                .then((result) => {
                    if (requestId !== sessionRequestIdRef.current) {
                        return;
                    }
                    const view = describeSessionResult(result);
                    setSession(view);
                    setSessionId(result.status === "ok" ? result.session.sessionId : undefined);
                    // Same reasoning as createSession() above -- restoring a session (even the same id
                    // again) starts this UI's own "last spin" tracking over, never carrying a previous
                    // session's requestId/expectedVersion into it.
                    setLastSpin({});
                    pushHistory("Load Session", result.status === "ok" ? `session ${result.session.sessionId}` : result.status);
                })
                .catch((error: unknown) => {
                    if (requestId === sessionRequestIdRef.current) {
                        setSession({status: "error", message: errorMessage(error)});
                    }
                })
                .finally(() => loadSessionGuard.end());
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fetchImpl, pushHistory],
    );

    const spin = useCallback(
        (requestId?: string, expectedVersion?: number) => {
            if (sessionId === undefined || !spinGuard.begin()) {
                return;
            }
            const staleGuardRequestId = ++sessionRequestIdRef.current;
            setLastSpin({requestId, expectedVersion});
            setSession({status: "loading"});
            spinRuntimeSession(fetchImpl, sessionId, requestId, expectedVersion)
                .then((result) => {
                    if (staleGuardRequestId !== sessionRequestIdRef.current) {
                        return;
                    }
                    const view = describeSpinResult(result);
                    setSession(view);
                    pushHistory("Spin", result.status === "ok" ? `credits ${result.session.credits}, win ${result.session.win ?? 0}` : result.status);
                })
                .catch((error: unknown) => {
                    if (staleGuardRequestId === sessionRequestIdRef.current) {
                        setSession({status: "error", message: errorMessage(error)});
                    }
                })
                .finally(() => spinGuard.end());
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fetchImpl, pushHistory, sessionId],
    );

    const repeatSpin = useCallback(() => {
        spin(lastSpin.requestId, lastSpin.expectedVersion);
    }, [spin, lastSpin]);

    return {
        state,
        session,
        sessionId,
        history,
        lastSpin,
        running: isRuntimeRunning(state),
        refresh,
        start,
        stop,
        restart,
        createSession,
        loadSession,
        spin,
        repeatSpin,
        resetForProjectSwitch,
    };
}
