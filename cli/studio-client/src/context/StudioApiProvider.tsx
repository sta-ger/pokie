import {createContext, useContext, useMemo, type ReactNode} from "react";
import type {FetchLike} from "../api/apiClient";

// Threads a FetchLike through the component tree exactly the way every apiClient.ts function already
// expects it to be injected (see apiClient.test.ts's own fakes) -- production uses window.fetch,
// component/integration tests override `fetchImpl` with a fake, same seam, no new mocking pattern.
const StudioApiContext = createContext<FetchLike | undefined>(undefined);

// Looks up the global `fetch` lazily on each call rather than binding it once at provider-mount time,
// so a test environment without a real `fetch` (e.g. plain jsdom) only fails if a page under test
// actually makes an unmocked call, not merely by rendering the provider.
const defaultFetch: FetchLike = (url, init) => fetch(url, init as RequestInit);

export function StudioApiProvider({fetchImpl, children}: {fetchImpl?: FetchLike; children: ReactNode}) {
    const value = useMemo(() => fetchImpl ?? defaultFetch, [fetchImpl]);
    return <StudioApiContext.Provider value={value}>{children}</StudioApiContext.Provider>;
}

export function useStudioApi(): FetchLike {
    const fetchImpl = useContext(StudioApiContext);
    if (fetchImpl === undefined) {
        throw new Error("useStudioApi must be used within a StudioApiProvider");
    }
    return fetchImpl;
}
