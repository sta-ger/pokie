import {renderHook, waitFor} from "@testing-library/react";
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
    });

    it("reports a failed generation without releasing it as completed", async () => {
        const fetchImpl: FetchLike = () => Promise.reject(new Error("context unavailable"));
        const {result} = renderHook(() => useProjectContext(undefined, 9), {wrapper: wrapper(fetchImpl)});

        await waitFor(() => expect(result.current.failedRefreshGeneration).toBe(9));
        expect(result.current.completedRefreshGeneration).toBe(0);
        expect(result.current.header.status).toBe("error");
    });
});
