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

export type RuntimeHistoryEntry = {timestamp: string; action: string; summary: string};

const HISTORY_LIMIT = 20;

// Owns the Runtime tab's state -- no polling loop (state only changes on explicit action responses, or
// a manual refresh), but must survive tab switches like every other tab's state (see
// ProjectDashboardPage's own doc comment), so it's a page-level hook, not local to the tab component.
export function useRuntimeManager() {
    const fetchImpl = useStudioApi();
    const [state, setState] = useState<RuntimeStateView>({status: "idle"});
    const [session, setSession] = useState<RuntimeSessionResultView | RuntimeSpinResultView>({status: "idle"});
    const [sessionId, setSessionId] = useState<string>();
    const [history, setHistory] = useState<RuntimeHistoryEntry[]>([]);
    const [lastSpin, setLastSpin] = useState<{requestId?: string; expectedVersion?: number}>({});

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
            setState({status: "loading"});
            startRuntime(fetchImpl, options)
                .then((result) => {
                    const view = describeStartResult(result);
                    setState(view);
                    pushHistory("Start", view.status === "running" ? `running at ${view.baseUrl}` : view.status);
                })
                .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}));
        },
        [fetchImpl, pushHistory],
    );

    const stop = useCallback(() => {
        stopRuntime(fetchImpl)
            .then((result) => {
                const view = describeRuntimeState(result);
                setState(view);
                pushHistory("Stop", view.status);
                resetSession();
            })
            .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}));
    }, [fetchImpl, pushHistory, resetSession]);

    const restart = useCallback(
        (options?: StartRuntimeOptions) => {
            setState({status: "loading"});
            restartRuntime(fetchImpl, options)
                .then((result) => {
                    const view = describeRuntimeState(result);
                    setState(view);
                    pushHistory("Restart", view.status === "running" ? `running at ${view.baseUrl}` : view.status);
                    resetSession();
                })
                .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}));
        },
        [fetchImpl, pushHistory, resetSession],
    );

    const createSession = useCallback(
        (seed?: string) => {
            setSession({status: "loading"});
            createRuntimeSession(fetchImpl, seed)
                .then((result) => {
                    const view = describeSessionResult(result);
                    setSession(view);
                    setSessionId(result.status === "ok" ? result.session.sessionId : undefined);
                    pushHistory("Create Session", result.status === "ok" ? `session ${result.session.sessionId}` : result.status);
                })
                .catch((error: unknown) => setSession({status: "error", message: errorMessage(error)}));
        },
        [fetchImpl, pushHistory],
    );

    const loadSession = useCallback(
        (id: string) => {
            setSession({status: "loading"});
            getRuntimeSession(fetchImpl, id)
                .then((result) => {
                    const view = describeSessionResult(result);
                    setSession(view);
                    setSessionId(result.status === "ok" ? result.session.sessionId : undefined);
                    pushHistory("Load Session", result.status === "ok" ? `session ${result.session.sessionId}` : result.status);
                })
                .catch((error: unknown) => setSession({status: "error", message: errorMessage(error)}));
        },
        [fetchImpl, pushHistory],
    );

    const spin = useCallback(
        (requestId?: string, expectedVersion?: number) => {
            if (sessionId === undefined) {
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
                .catch((error: unknown) => setSession({status: "error", message: errorMessage(error)}));
        },
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
