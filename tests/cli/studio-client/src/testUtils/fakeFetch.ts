import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";

export type FakeCall = {url: string; init?: {method?: string; headers?: Record<string, string>; body?: string}};

// Same fake-fetch seam apiClient.test.ts uses -- component/integration tests inject this via
// StudioApiProvider instead of mocking the global fetch (see the plan's testing decision).
export function createFakeFetch(handler: (call: FakeCall) => {ok: boolean; status: number; body: unknown}): {
    fetchImpl: FetchLike;
    calls: FakeCall[];
} {
    const calls: FakeCall[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        calls.push({url, init});
        const response = handler({url, init});
        return Promise.resolve({ok: response.ok, status: response.status, json: () => Promise.resolve(response.body)});
    };
    return {fetchImpl, calls};
}

// Handler variant for tests that need per-URL routing across several endpoints in one flow.
export function createRoutedFakeFetch(
    routes: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}>,
): {fetchImpl: FetchLike; calls: FakeCall[]} {
    return createFakeFetch((call) => {
        const [path] = call.url.split("?");
        const route = routes[path];
        if (route === undefined) {
            throw new Error(`No fake route registered for ${call.url}`);
        }
        return route(call);
    });
}
