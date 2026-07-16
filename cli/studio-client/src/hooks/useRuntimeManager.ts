import {useCallback, useState} from "react";
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
    const [lastSpin, setLastSpin] = useState<{requestId?: string; expectedVersion?: number}>({});

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

    const resetSession = useCallback(() => {
        setSessionId(undefined);
        setSession({status: "idle"});
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
        (seed?: string) => {
            if (!createSessionGuard.begin()) {
                return;
            }
            setSession({status: "loading"});
            createRuntimeSession(fetchImpl, seed)
                .then((result) => {
                    const view = describeSessionResult(result);
                    setSession(view);
                    setSessionId(result.status === "ok" ? result.session.sessionId : undefined);
                    pushHistory("Create Session", result.status === "ok" ? `session ${result.session.sessionId}` : result.status);
                })
                .catch((error: unknown) => setSession({status: "error", message: errorMessage(error)}))
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
            setSession({status: "loading"});
            getRuntimeSession(fetchImpl, id)
                .then((result) => {
                    const view = describeSessionResult(result);
                    setSession(view);
                    setSessionId(result.status === "ok" ? result.session.sessionId : undefined);
                    pushHistory("Load Session", result.status === "ok" ? `session ${result.session.sessionId}` : result.status);
                })
                .catch((error: unknown) => setSession({status: "error", message: errorMessage(error)}))
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
            setLastSpin({requestId, expectedVersion});
            setSession({status: "loading"});
            spinRuntimeSession(fetchImpl, sessionId, requestId, expectedVersion)
                .then((result) => {
                    const view = describeSpinResult(result);
                    setSession(view);
                    pushHistory("Spin", result.status === "ok" ? `credits ${result.session.credits}, win ${result.session.win ?? 0}` : result.status);
                })
                .catch((error: unknown) => setSession({status: "error", message: errorMessage(error)}))
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
        running: isRuntimeRunning(state),
        refresh,
        start,
        stop,
        restart,
        createSession,
        loadSession,
        spin,
        repeatSpin,
    };
}
