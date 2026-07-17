import {act, renderHook, waitFor} from "@testing-library/react";
import type {ReactNode} from "react";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";
import {useDeploymentManager} from "../../../../../cli/studio-client/src/hooks/useDeploymentManager";

function wrapper(fetchImpl: FetchLike) {
    return function Wrapper({children}: {children: ReactNode}) {
        return <StudioApiProvider fetchImpl={fetchImpl}>{children}</StudioApiProvider>;
    };
}

const TARGET = {id: "target-1", version: "1.0.0", requirements: {}, capabilities: []};

function okRunResponse() {
    return {
        ok: true,
        status: 200,
        json: () =>
            Promise.resolve({
                targetId: "target-1",
                publish: false,
                stages: [{key: "descriptor", label: "Descriptor", status: "ok", issues: []}],
                descriptorIssues: [],
                compatibilityIssues: [],
                projectionIssues: [],
                artifactIssues: [],
                generation: {artifacts: [{relativePath: "a.json", content: "{}"}], issues: []},
            }),
    };
}

// Mirrors useRuntimeManager's own resetForProjectSwitch test -- a genuinely different project must never
// show a trace of the previous one's target selection, modes, or run result, and a run still in flight
// from before the switch must be silently discarded once it resolves (there is nothing to cancel over
// plain fetch; the DeploymentRunTracker's own revision bump is what makes the late response stale).
describe("useDeploymentManager - resetForProjectSwitch", () => {
    it("clears target/modes/targets-list/run state, and discards a run response that arrives after the switch", async () => {
        let resolveRun: ((response: unknown) => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/deployment/targets") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([TARGET])});
            }
            if (path === "/api/project/deployment/runs") {
                return new Promise((resolve) => {
                    resolveRun = resolve;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useDeploymentManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.refreshTargets();
        });
        await waitFor(() => expect(result.current.targetsView).toEqual({status: "loaded", targets: [TARGET]}));

        act(() => {
            result.current.selectTarget(TARGET);
        });
        act(() => {
            result.current.updateMode(0, {modeName: "base", libraryPath: "lib.json"});
        });
        expect(result.current.selectedTarget).toEqual(TARGET);

        act(() => {
            result.current.run(false);
        });
        expect(result.current.runLoading).toBe(true);

        act(() => {
            result.current.resetForProjectSwitch();
        });

        expect(result.current.selectedTarget).toBeUndefined();
        expect(result.current.modes).toEqual([{modeName: "", libraryPath: ""}]);
        expect(result.current.targetsView).toEqual({status: "empty"});
        expect(result.current.runResult).toBeUndefined();
        expect(result.current.runError).toBeUndefined();

        // The stale run response from the previous project finally lands -- must never repopulate what
        // the reset just cleared, and must release the in-flight slot so a fresh run in the new project
        // isn't blocked by it.
        act(() => {
            resolveRun?.(okRunResponse());
        });
        await waitFor(() => expect(result.current.runLoading).toBe(false));

        expect(result.current.runResult).toBeUndefined();
    });
});
