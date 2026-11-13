import http from "http";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient.js";

/** Own every request/socket until the real HTTP response or abort has settled. */
export function createStudioHttpTestClient(baseUrl: string) {
    const pending = new Set<ReturnType<FetchLike>>();
    const timings: Array<{url: string; elapsedMs: number; outcome: number | string}> = [];
    const fetchImpl: FetchLike = (url, init) => {
        const started = performance.now();
        const operation = new Promise<Awaited<ReturnType<FetchLike>>>((resolve, reject) => {
            const signal = init?.signal;
            const release = () => signal?.removeEventListener("abort", abort);
            const fail = (error: Error) => {
                release();
                reject(error);
            };
            const request = http.request(`${baseUrl}${url}`, {
                method: init?.method, headers: {...init?.headers, Connection: "close"}, agent: false,
            }, response => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk: Buffer) => chunks.push(chunk));
                response.on("error", fail);
                response.on("end", () => {
                    release();
                    try {
                        const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                        const status = response.statusCode ?? 500;
                        resolve({ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body)});
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            const abort = () => request.destroy(Object.assign(new Error("Studio test request aborted"), {name: "AbortError"}));
            request.on("error", fail);
            if (signal?.aborted) abort();
            else signal?.addEventListener("abort", abort, {once: true});
            request.end(init?.body);
        });
        pending.add(operation);
        const settled = (outcome: number | string) => {
            pending.delete(operation);
            timings.push({url, elapsedMs: Math.round(performance.now() - started), outcome});
        };
        operation.then(response => settled(response.status), error => settled(String(error)));
        return operation;
    };
    return {
        fetchImpl,
        pending,
        timings,
        async drain(): Promise<void> {
            // Call after unmount, while Studio can still complete accepted HTTP work.
            while (pending.size > 0) await Promise.allSettled([...pending]);
        },
    };
}
