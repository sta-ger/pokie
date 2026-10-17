import {createContext, useContext, useMemo, type ReactNode} from "react";
import type {FetchLike} from "../api/apiClient";

// Threads a FetchLike through the component tree exactly the way every apiClient.ts function already
// expects it to be injected (see apiClient.test.ts's own fakes) -- production uses window.fetch,
// component/integration tests override `fetchImpl` with a fake, same seam, no new mocking pattern.
const StudioApiContext = createContext<FetchLike | undefined>(undefined);

// Looks up the global `fetch` lazily on each call rather than binding it once at provider-mount time,
// so a test environment without a real `fetch` (e.g. plain jsdom) only fails if a page under test
// actually makes an unmocked call, not merely by rendering the provider.
const networkFetch: FetchLike = (url, init) => fetch(url, init as RequestInit);
let productionFetch: Promise<FetchLike> | undefined;
const workerlessState = {wasm: false, contextRequest: 0};
const defaultFetch: FetchLike = async (url, init) => {
    if (typeof Worker === "undefined") {
        if (workerlessState.wasm && init?.method === "POST" && (/^\/api\/project\/(?:play\/|simulations$|replays$)/).test(url)) return {ok: false, status: 400, json: () => Promise.resolve({error: "This browser does not support Web Workers. Open Studio in a browser with module Worker support to execute this Project."})};
        const contextRequest = url === "/api/project/context" ? ++workerlessState.contextRequest : 0;
        const result = await networkFetch(url, init);
        if (url === "/api/project/context" && result.ok) {
            const body = await result.json() as {status: string; type?: string};
            if (contextRequest === workerlessState.contextRequest) Object.assign(workerlessState, {wasm: body.status === "loaded" && body.type === "wasm"});
            return {ok: true, status: result.status, json: () => Promise.resolve(body)};
        }
        return result;
    }
    productionFetch ??= import("../wasm/createProductionWasmStudioApi").then(module => module.createProductionWasmStudioApi(networkFetch));
    return (await productionFetch)(url, init);
};

export function StudioApiProvider({fetchImpl, children}: {fetchImpl?: FetchLike; children: ReactNode}) {
    const value = useMemo(() => fetchImpl ?? defaultFetch, [fetchImpl]);
    return <StudioApiContext.Provider value={value}>{children}</StudioApiContext.Provider>;
}

export function useOptionalStudioApi(): FetchLike | undefined {
    return useContext(StudioApiContext);
}

export function useStudioApi(): FetchLike {
    const fetchImpl = useOptionalStudioApi();
    if (fetchImpl === undefined) {
        throw new Error("useStudioApi must be used within a StudioApiProvider");
    }
    return fetchImpl;
}
