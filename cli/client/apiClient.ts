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
        if (response.status === 404) return {ok: false};
        const body = await safeJson(response) as {code?: string; error?: string} | undefined;
        throw new SessionCommandError(body?.code ?? "transport-error", body?.error ?? `Session restore failed (HTTP ${response.status}).`);
    }
    return {ok: true, body: (await response.json()) as SessionResponse};
}

export async function spin(
    fetchImpl: FetchLike,
    apiBaseUrl: string,
    sessionId: string,
    requestId?: string,
    bet?: number,
    mode?: string,
    expectedSessionVersion?: number,
): Promise<SessionResponse> {
    const payload: {requestId?: string; bet?: number; mode?: string; expectedSessionVersion?: number} = {};
    if (requestId !== undefined) {
        payload.requestId = requestId;
    }
    if (bet !== undefined) {
        payload.bet = bet;
    }
    if (mode !== undefined) {
        payload.mode = mode;
    }
    if (expectedSessionVersion !== undefined) payload.expectedSessionVersion = expectedSessionVersion;
    const body = Object.keys(payload).length === 0 ? undefined : JSON.stringify(payload);
    const response = await fetchImpl(`${apiBaseUrl}/sessions/${encodeURIComponent(sessionId)}/spin`, {
        method: "POST",
        headers: body === undefined ? undefined : {"Content-Type": "application/json"},
        body,
    });
    if (!response.ok) {
        const errorBody = (await safeJson(response)) as {error?: string; code?: string} | undefined;
        throw new SessionCommandError(errorBody?.code ?? "transport-error", errorBody?.error ?? `Spin failed (HTTP ${response.status}).`);
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

export class SessionCommandError extends Error {
    constructor(public readonly code: string, message: string) {
        super(`${code}: ${message}`);
        this.name = "SessionCommandError";
    }
}
