import type {SessionResponse} from "./types.js";

// The subset of the Fetch API this client needs — kept minimal and structurally compatible with
// the real global `fetch`, so tests can inject a trivial fake instead of needing a real network or
// jsdom.
export type FetchLike = (
    url: string,
    init?: {method?: string; headers?: Record<string, string>; body?: string},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

export async function createSession(
    fetchImpl: FetchLike,
    apiBaseUrl: string,
    seed?: string | number,
): Promise<SessionResponse> {
    const body = seed === undefined ? undefined : JSON.stringify({seed});
    const response = await fetchImpl(`${apiBaseUrl}/sessions`, {
        method: "POST",
        headers: body === undefined ? undefined : {"Content-Type": "application/json"},
        body,
    });
    if (!response.ok) {
        throw new Error(`Failed to create a session (HTTP ${response.status}).`);
    }
    return (await response.json()) as SessionResponse;
}

export async function getSession(
    fetchImpl: FetchLike,
    apiBaseUrl: string,
    sessionId: string,
): Promise<{ok: boolean; body?: SessionResponse}> {
    const response = await fetchImpl(`${apiBaseUrl}/sessions/${encodeURIComponent(sessionId)}`);
    if (!response.ok) {
        return {ok: false};
    }
    return {ok: true, body: (await response.json()) as SessionResponse};
}

export async function spin(
    fetchImpl: FetchLike,
    apiBaseUrl: string,
    sessionId: string,
    requestId?: string,
): Promise<SessionResponse> {
    const body = requestId === undefined ? undefined : JSON.stringify({requestId});
    const response = await fetchImpl(`${apiBaseUrl}/sessions/${encodeURIComponent(sessionId)}/spin`, {
        method: "POST",
        headers: body === undefined ? undefined : {"Content-Type": "application/json"},
        body,
    });
    if (!response.ok) {
        const errorBody = (await safeJson(response)) as {error?: string} | undefined;
        throw new Error(errorBody?.error ?? `Spin failed (HTTP ${response.status}).`);
    }
    return (await response.json()) as SessionResponse;
}

async function safeJson(response: {json(): Promise<unknown>}): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return undefined;
    }
}
