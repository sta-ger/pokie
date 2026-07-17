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
        expect(result.current.targetsView).toEqual({status: "loading"});
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

// A DeploymentTargetsListView must never claim "nothing is registered" before the very first request has
// actually resolved -- "loading" (not "empty") is the state both before refreshTargets() is ever called
// and while its own request is still in flight.
describe("useDeploymentManager - initial targets loading", () => {
    it("starts loading and never shows empty until the first request actually resolves", async () => {
        let resolveTargets: ((response: unknown) => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            if (url.split("?")[0] === "/api/project/deployment/targets") {
                return new Promise((resolve) => {
                    resolveTargets = resolve;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useDeploymentManager(), {wrapper: wrapper(fetchImpl)});

        expect(result.current.targetsView).toEqual({status: "loading"});

        act(() => {
            result.current.refreshTargets();
        });
        expect(result.current.targetsView).toEqual({status: "loading"});

        act(() => {
            resolveTargets?.({ok: true, status: 200, json: () => Promise.resolve([])});
        });
        await waitFor(() => expect(result.current.targetsView).toEqual({status: "empty"}));
    });
});

describe("useDeploymentManager - stale targets response after project switch", () => {
    it("discards a targets response for the old project once it resolves after resetForProjectSwitch", async () => {
        let resolveTargets: ((response: unknown) => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            if (url.split("?")[0] === "/api/project/deployment/targets") {
                return new Promise((resolve) => {
                    resolveTargets = resolve;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useDeploymentManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.refreshTargets(); // project A's own request, still in flight
        });

        act(() => {
            result.current.resetForProjectSwitch(); // switched to project B before A's response landed
        });
        expect(result.current.targetsView).toEqual({status: "loading"});

        // Project A's targets finally arrive -- must never repopulate project B's own targets list.
        act(() => {
            resolveTargets?.({ok: true, status: 200, json: () => Promise.resolve([TARGET])});
        });
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(result.current.targetsView).toEqual({status: "loading"});
        expect(result.current.selectedTarget).toBeUndefined();
    });
});

describe("useDeploymentManager - two out-of-order Refresh calls", () => {
    it("only applies the response matching the latest Refresh, discarding an older one that resolves later", async () => {
        const resolvers: ((response: unknown) => void)[] = [];
        const fetchImpl: FetchLike = (url) => {
            if (url.split("?")[0] === "/api/project/deployment/targets") {
                return new Promise((resolve) => {
                    resolvers.push(resolve);
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useDeploymentManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.refreshTargets(); // first Refresh
        });
        act(() => {
            result.current.refreshTargets(); // second Refresh, clicked before the first resolved
        });
        expect(resolvers).toHaveLength(2);

        const firstTarget = {id: "target-first", version: "1.0.0", requirements: {}, capabilities: []};
        const secondTarget = {id: "target-second", version: "1.0.0", requirements: {}, capabilities: []};

        // The second (later) Refresh's own response resolves first...
        act(() => {
            resolvers[1]({ok: true, status: 200, json: () => Promise.resolve([secondTarget])});
        });
        await waitFor(() => expect(result.current.targetsView).toEqual({status: "loaded", targets: [secondTarget]}));

        // ...then the first (older) Refresh's response finally arrives -- it must be discarded, not
        // overwrite the newer, already-rendered list.
        act(() => {
            resolvers[0]({ok: true, status: 200, json: () => Promise.resolve([firstTarget])});
        });
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(result.current.targetsView).toEqual({status: "loaded", targets: [secondTarget]});
    });
});

describe("useDeploymentManager - rebinding the selected target after Refresh", () => {
    it("rebinds selectedTarget to the fresh object when its descriptor is unchanged, keeping any existing run result", async () => {
        const v1 = {id: "target-1", version: "1.0.0", requirements: {}, capabilities: ["multiMode"]};
        // Same content as v1, but a distinct object -- proves the rebind is about reference identity, not
        // merely "was anything different".
        const v1Fresh = {id: "target-1", version: "1.0.0", requirements: {}, capabilities: ["multiMode"]};
        let targetsResponse = [v1];
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/deployment/targets") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(targetsResponse)});
            }
            if (path === "/api/project/deployment/runs") {
                return Promise.resolve(okRunResponse());
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useDeploymentManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.refreshTargets();
        });
        await waitFor(() => expect(result.current.targetsView).toEqual({status: "loaded", targets: [v1]}));
        act(() => {
            result.current.selectTarget(v1);
        });
        act(() => {
            result.current.run(false);
        });
        await waitFor(() => expect(result.current.runResult).toBeDefined());

        targetsResponse = [v1Fresh];
        act(() => {
            result.current.refreshTargets();
        });
        await waitFor(() => expect(result.current.selectedTarget).toBe(v1Fresh));

        // Same version/capabilities/requirements -- the existing preview result is still accurate and
        // must not be thrown away just because Refresh returned a new object reference for the same
        // descriptor.
        expect(result.current.runResult).toBeDefined();
    });

    it("invalidates the existing run result when the selected target's own descriptor changed underneath it", async () => {
        const v1 = {id: "target-1", version: "1.0.0", requirements: {}, capabilities: []};
        const v2 = {id: "target-1", version: "2.0.0", requirements: {}, capabilities: []};
        let targetsResponse = [v1];
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/deployment/targets") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(targetsResponse)});
            }
            if (path === "/api/project/deployment/runs") {
                return Promise.resolve(okRunResponse());
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useDeploymentManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.refreshTargets();
        });
        await waitFor(() => expect(result.current.targetsView).toEqual({status: "loaded", targets: [v1]}));
        act(() => {
            result.current.selectTarget(v1);
        });
        act(() => {
            result.current.run(false);
        });
        await waitFor(() => expect(result.current.runResult).toBeDefined());

        targetsResponse = [v2];
        act(() => {
            result.current.refreshTargets();
        });
        await waitFor(() => expect(result.current.selectedTarget).toEqual(v2));

        // version changed (1.0.0 -> 2.0.0) -- the preview result was computed against the old descriptor
        // and must be invalidated rather than kept looking current.
        expect(result.current.runResult).toBeUndefined();
    });

    it("clears the selection and invalidates the run result when the target disappears from the registry", async () => {
        let targetsResponse = [TARGET];
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/deployment/targets") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(targetsResponse)});
            }
            if (path === "/api/project/deployment/runs") {
                return Promise.resolve(okRunResponse());
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
            result.current.run(false);
        });
        await waitFor(() => expect(result.current.runResult).toBeDefined());

        targetsResponse = [];
        act(() => {
            result.current.refreshTargets();
        });
        await waitFor(() => expect(result.current.targetsView).toEqual({status: "empty"}));

        expect(result.current.selectedTarget).toBeUndefined();
        expect(result.current.runResult).toBeUndefined();
    });
});

describe("useDeploymentManager - runError clears on the next attempt/success", () => {
    it("clears a previous transport error once a retry is started, and stays clear once it succeeds", async () => {
        let shouldFail = true;
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/deployment/targets") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([TARGET])});
            }
            if (path === "/api/project/deployment/runs") {
                if (shouldFail) {
                    return Promise.resolve({ok: false, status: 502, json: () => Promise.resolve({message: "Bad Gateway"})});
                }
                return Promise.resolve(okRunResponse());
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
            result.current.run(true);
        });
        await waitFor(() => expect(result.current.runError).toBeDefined());
        expect(result.current.runResult).toBeUndefined();

        shouldFail = false;
        act(() => {
            result.current.run(true); // retry
        });
        // Cleared as soon as the retry starts, not only once it resolves.
        expect(result.current.runError).toBeUndefined();

        await waitFor(() => expect(result.current.runResult).toBeDefined());
        expect(result.current.runError).toBeUndefined();
    });
});

describe("useDeploymentManager - project switch immediately followed by refresh, same target id in the new project", () => {
    it("keeps the selection empty and never resurrects the previous project's preview/deploy result", async () => {
        // Same id as the old project's own selected target, but a different descriptor -- a different
        // project's registry that just happens to reuse the id.
        const oldProjectTarget = {id: "shared-id", version: "1.0.0", requirements: {}, capabilities: []};
        const newProjectTarget = {id: "shared-id", version: "9.9.9", requirements: {}, capabilities: ["multiMode"]};
        let targetsResponse = [oldProjectTarget];
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/deployment/targets") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(targetsResponse)});
            }
            if (path === "/api/project/deployment/runs") {
                return Promise.resolve(okRunResponse());
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useDeploymentManager(), {wrapper: wrapper(fetchImpl)});

        // Old project: select the target and run a preview, so there is a real result that could leak.
        act(() => {
            result.current.refreshTargets();
        });
        await waitFor(() => expect(result.current.targetsView).toEqual({status: "loaded", targets: [oldProjectTarget]}));
        act(() => {
            result.current.selectTarget(oldProjectTarget);
        });
        act(() => {
            result.current.run(false);
        });
        await waitFor(() => expect(result.current.runResult).toBeDefined());

        targetsResponse = [newProjectTarget];

        // The exact sequence ProjectDashboardPage's own projectKey effect performs: reset, then
        // immediately (synchronously, in the same tick, before any re-render) refresh the new project's
        // targets -- reproducing the closure-staleness window the fix addresses, since
        // result.current.refreshTargets here is still the closure formed *before* resetForProjectSwitch's
        // own state updates have been applied.
        act(() => {
            result.current.resetForProjectSwitch();
            result.current.refreshTargets();
        });

        await waitFor(() => expect(result.current.targetsView).toEqual({status: "loaded", targets: [newProjectTarget]}));

        // The coincidentally-same id in the new project must never be silently re-adopted, and the old
        // project's preview/deploy result must not resurface.
        expect(result.current.selectedTarget).toBeUndefined();
        expect(result.current.runResult).toBeUndefined();
        expect(result.current.runError).toBeUndefined();
    });
});
