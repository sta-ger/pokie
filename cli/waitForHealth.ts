export type WaitForHealthOptions = {
    timeoutMs?: number;
    intervalMs?: number;
    fetchImpl?: typeof fetch;
};

// Polls `healthUrl` (e.g. a PokieDevServer's GET /health) until it responds ok, or throws once
// `timeoutMs` has elapsed. Used by `pokie dev` to know the API server is actually ready to accept
// requests before it opens a browser pointed at the client.
export async function waitForHealth(healthUrl: string, options: WaitForHealthOptions = {}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 5000;
    const intervalMs = options.intervalMs ?? 50;
    const fetchImpl = options.fetchImpl ?? fetch;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
        if (await respondsOk(fetchImpl, healthUrl)) {
            return;
        }
        if (Date.now() >= deadline) {
            throw new Error(`Timed out waiting for ${healthUrl} to respond (waited ${timeoutMs}ms).`);
        }
        await new Promise((resolve) => {
            setTimeout(resolve, intervalMs);
        });
    }
}

async function respondsOk(fetchImpl: typeof fetch, url: string): Promise<boolean> {
    try {
        const response = await fetchImpl(url);
        return response.ok;
    } catch {
        return false;
    }
}
