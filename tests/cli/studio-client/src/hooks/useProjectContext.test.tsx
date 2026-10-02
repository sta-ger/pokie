import {act, renderHook, waitFor} from "@testing-library/react";
import type {ReactNode} from "react";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";
import {useProjectContext} from "../../../../../cli/studio-client/src/hooks/useProjectContext";

function wrapper(fetchImpl: FetchLike) {
    return function StudioWrapper({children}: {children: ReactNode}) {
        return <StudioApiProvider fetchImpl={fetchImpl}>{children}</StudioApiProvider>;
    };
}

describe("useProjectContext refresh acknowledgement", () => {
    it("does not acknowledge a generation while the context is loading, then acknowledges its rendered terminal context", async () => {
        let requests = 0;
        const fetchImpl: FetchLike = (url) => {
            expect(url).toBe("/api/project/context");
            requests += 1;
            const body = requests === 1 ? {status: "loading", projectRoot: "/games/valera"} : {status: "loaded", projectRoot: "/games/valera", game: {id: "valera", name: "Valera", version: "1.0.0"}};
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
        };
        const {result, rerender} = renderHook(({generation}) => useProjectContext(undefined, generation), {initialProps: {generation: 7}, wrapper: wrapper(fetchImpl)});

        await waitFor(() => expect(result.current.header.status).toBe("loading"));
        expect(result.current.completedRefreshGeneration).toBe(0);

        // A caller-owned refresh starts a new immediate request. Its terminal
        // receipt may release the new generation, whereas the first loading
        // placeholder could not release generation 7.
        rerender({generation: 8});
        await waitFor(() => expect(result.current.completedRefreshGeneration).toBe(8));
        expect(result.current.header.status).toBe("loaded");
        // A dependent route needs the terminal header that React committed
        // for this exact generation, not merely a reusable numeric receipt.
        expect(result.current.renderedTerminal).toEqual(expect.objectContaining({generation: 8, outcome: "completed", header: result.current.header}));
        expect(result.current.renderedTerminal?.header).toBe(result.current.header);
    });

    it.each([undefined, "/games/valera"])("retains live same-project controls during a loading refresh on route %s without acknowledging it", async (route) => {
        let requests = 0;
        const loaded = {status: "loaded", projectRoot: "/games/valera", game: {id: "valera", name: "Valera", version: "1.0.0"}};
        const fetchImpl: FetchLike = () => {
            requests++;
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(requests === 2 ? {status: "loading", projectRoot: loaded.projectRoot} : loaded)});
        };
        const {result, rerender} = renderHook(({generation}) => useProjectContext(route, generation), {initialProps: {generation: 1}, wrapper: wrapper(fetchImpl)});
        await waitFor(() => expect(result.current.completedRefreshGeneration).toBe(1));
        const retained = result.current.header;
        rerender({generation: 2});
        await waitFor(() => expect(requests).toBe(2));
        expect(result.current.header).toBe(retained);
        expect(result.current.completedRefreshGeneration).toBe(1);
        expect(result.current.renderedTerminal?.generation).toBe(1);
        rerender({generation: 3});
        await waitFor(() => expect(result.current.completedRefreshGeneration).toBe(3));
        expect(result.current.renderedTerminal?.header).toBe(result.current.header);
    });

    it("reports a failed generation without releasing it as completed", async () => {
        const fetchImpl: FetchLike = () => Promise.reject(new Error("context unavailable"));
        const {result} = renderHook(() => useProjectContext(undefined, 9), {wrapper: wrapper(fetchImpl)});

        await waitFor(() => expect(result.current.failedRefreshGeneration).toBe(9));
        expect(result.current.completedRefreshGeneration).toBe(0);
        expect(result.current.header.status).toBe("error");
        expect(result.current.renderedTerminal).toEqual(expect.objectContaining({generation: 9, outcome: "failed", header: result.current.header}));
    });

    it("ignores a superseded terminal response while retaining the current project's last rendered context", async () => {
        const context = {status: "loaded", projectRoot: "/games/valera", game: {id: "valera", name: "Valera", version: "1.0.0"}};
        const pending: (() => void)[] = [];
        let requests = 0;
        const fetchImpl: FetchLike = () => {
            requests += 1;
            const response = {ok: true, status: 200, json: () => Promise.resolve(context)};
            return requests === 1 ? Promise.resolve(response) : new Promise((resolve) => {
                pending.push(() => resolve(response));
            });
        };
        const {result, rerender} = renderHook(({generation}) => useProjectContext(context.projectRoot, generation), {initialProps: {generation: 1}, wrapper: wrapper(fetchImpl)});
        await waitFor(() => expect(result.current.completedRefreshGeneration).toBe(1));
        const retainedHeader = result.current.header;
        rerender({generation: 2});
        await waitFor(() => expect(pending).toHaveLength(1));
        rerender({generation: 3});
        await waitFor(() => expect(pending).toHaveLength(2));

        await act(() => Promise.resolve(pending[0]()));
        expect(result.current.header).toBe(retainedHeader);
        expect(result.current.completedRefreshGeneration).toBe(1);
        expect(result.current.renderedTerminal?.generation).toBe(1);

        await act(() => Promise.resolve(pending[1]()));
        await waitFor(() => expect(result.current.completedRefreshGeneration).toBe(3));
        expect(result.current.renderedTerminal).toEqual(expect.objectContaining({generation: 3, outcome: "completed", header: result.current.header}));
    });
});
