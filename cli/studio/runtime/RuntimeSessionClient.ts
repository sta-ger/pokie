// Same minimal Fetch subset as cli/studio-client/apiClient.ts's own FetchLike — kept structurally
// compatible with the real global `fetch` so tests can inject a trivial fake instead of needing a real
// socket.
export type RuntimeFetchLike = (
    url: string,
    init?: {method?: string; headers?: Record<string, string>; body?: string},
) => Promise<{status: number; json(): Promise<unknown>}>;

export type RuntimeHttpResult = {status: number; body: unknown};

// The task's required "small typed client/adapter that talks to the running local PokieDevServer the
// same way an external client would" — see StudioRuntimeManager's own doc comment for why this exists
// as its own class: every request here is exactly what docs/cli.md documents for `pokie serve`'s own
// POST /sessions / GET /sessions/:id / POST /sessions/:id/spin, nothing more. No business logic, no
// HTTP-status interpretation — that translation is StudioRuntimeManager's job, kept in exactly one
// place rather than duplicated per call site. Always requests `?debug=1`: that's PokieDevServer's own
// fully public, documented opt-in (not a privileged escalation) — StudioRuntimeManager is what decides
// how much of the resulting `internal` field a browser ever sees, based on the runtime's own configured
// debug flag.
export class RuntimeSessionClient {
    private readonly baseUrl: string;
    private readonly fetchImpl: RuntimeFetchLike;

    constructor(baseUrl: string, fetchImpl: RuntimeFetchLike = fetch as unknown as RuntimeFetchLike) {
        this.baseUrl = baseUrl;
        this.fetchImpl = fetchImpl;
    }

    public async createSession(seed?: string | number): Promise<RuntimeHttpResult> {
        const response = await this.fetchImpl(`${this.baseUrl}/sessions?debug=1`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(seed === undefined ? {} : {seed}),
        });
        return {status: response.status, body: await response.json()};
    }

    public async getSession(sessionId: string): Promise<RuntimeHttpResult> {
        const response = await this.fetchImpl(`${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}?debug=1`);
        return {status: response.status, body: await response.json()};
    }

    public async spin(sessionId: string, requestId?: string, expectedVersion?: number): Promise<RuntimeHttpResult> {
        const body: Record<string, unknown> = {};
        if (requestId !== undefined) {
            body.requestId = requestId;
        }
        if (expectedVersion !== undefined) {
            body.expectedSessionVersion = expectedVersion;
        }
        const response = await this.fetchImpl(`${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}/spin?debug=1`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body),
        });
        return {status: response.status, body: await response.json()};
    }

    // The pre-generated counterpart to createSession/spin -- PokieDevServer's own separate
    // `/pregenerated-sessions`/`/pregenerated-sessions/:id/spin` namespace (see that class's own doc
    // comment), only reachable at all when this runtime was started with a preGeneratedOutcomeLibrary.
    // Deliberately no `expectedVersion`/optimistic-locking parameter on the spin call here:
    // PreGeneratedSpinCommandHandler.handle() has no such parameter, unlike the live spin path.
    public async createPreGeneratedSession(seed?: string, initialBalance?: number): Promise<RuntimeHttpResult> {
        const body: Record<string, unknown> = {};
        if (seed !== undefined) {
            body.seed = seed;
        }
        if (initialBalance !== undefined) {
            body.initialBalance = initialBalance;
        }
        const response = await this.fetchImpl(`${this.baseUrl}/pregenerated-sessions`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body),
        });
        return {status: response.status, body: await response.json()};
    }

    public async spinPreGenerated(sessionId: string, requestId?: string): Promise<RuntimeHttpResult> {
        const body: Record<string, unknown> = {};
        if (requestId !== undefined) {
            body.requestId = requestId;
        }
        const response = await this.fetchImpl(`${this.baseUrl}/pregenerated-sessions/${encodeURIComponent(sessionId)}/spin?debug=1`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body),
        });
        return {status: response.status, body: await response.json()};
    }
}
