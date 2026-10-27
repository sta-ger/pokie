import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {modals} from "@mantine/modals";
import {loadPersistedProjectBlueprintDraft} from "../../../../../../cli/studio-client/src/domain/blueprintDraftStorage";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const activeJob = {
    id: "job-1", projectId: "/games/sample-slot", operation: "certification-evidence-build", request: {}, conflictKey: "evidence",
    status: "running", createdAt: 1, progress: {stage: "Writing evidence", unit: "files", current: 2, total: 4},
};


const openingSource = "/games/sample-slot/blueprint.json";
const openedRuntime = "/generated/server-returned-runtime";
const completedOpening = {
    id: "completed-open", projectId: "/games/sample-slot", operation: "project-open-materialization",
    request: {sourcePath: "/historical/request-is-not-the-output"}, conflictKey: "open", status: "completed", createdAt: 1,
    result: {summary: "Project opening and runtime materialization completed.", outputs: [{label: "Opened project", path: openingSource}]},
};

const retainedOpeningCases = (["failed", "cancelled", "recovery-required"] as const).map(status => ({
    job: {
        id: `retained-open-${status}`, projectId: "/games/sample-slot", operation: "project-open-materialization",
        request: {sourcePath: openingSource}, conflictKey: "open", status, createdAt: 1,
        recovery: {action: "retry", reason: "Runtime materialization is not resumable after restart. Reopen the same project to retry."},
    },
    actionName: "Retry",
    expectedSource: openingSource,
}));
const openingActionCases = [
    {job: completedOpening, actionName: "Open Opened project", expectedSource: openingSource},
    ...retainedOpeningCases,
];

function openingRoutes() {
    return {
        "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot",
            game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [completedOpening]}}),
        "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true}}),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        "/api/project/validate": () => ({ok: true, status: 200, body: {valid: true, errors: [], warnings: [], suggestions: []}}),
        "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "unavailable", reason: "Remote session."}}),
    };
}

describe("ProjectDashboardPage durable jobs", () => {
    it.each(["/project/gameModel", `/project/${encodeURIComponent(activeJob.projectId)}/gameModel`])("V35-DIRTY-STAY: one choice restores the rendered section after Play from %s", async initialEntry => {
        const user = userEvent.setup();
        const blueprint = {manifest: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"},
            reels: 1, rows: 1, symbols: ["A"], reelStrips: [["A"]], paylines: [[0]], paytable: {A: {1: 1}}, availableBets: [1]};
        const unavailable = {status: "unavailable", reason: "Not required for this edit"};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...openingRoutes(),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
            "/api/project/gameModel": () => ({ok: true, status: 200, body: {
                basics: {status: "available", data: blueprint.manifest}, layout: unavailable, symbols: unavailable,
                reels: unavailable, paytable: unavailable, betsAndModes: unavailable, mechanics: unavailable, limits: unavailable,
            }}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: activeJob.projectId, blueprint, blueprintHash: "h1"}}),
        });
        const opened = jest.spyOn(modals, "openConfirmModal");
        const {router, unmount} = renderRoutedApp({fetchImpl, initialEntries: [initialEntry], strictMode: true});
        try {
            const basics = (await screen.findByText("Game basics", {selector: "span"})).closest("fieldset")!;
            const editingPath = router.state.location.pathname;
            await user.click(within(basics).getByRole("button", {name: "Edit"}));
            fireEvent.change(await within(basics).findByLabelText("Description (optional)"), {target: {value: "Fresh affected navigation draft"}});
            for (const keyboard of [false, true]) {
                opened.mockClear();
                await user.click(screen.getByRole("button", {name: "Play"}));
                const stay = await screen.findByRole("button", {name: "Stay"});
                expect(screen.getAllByRole("dialog")).toHaveLength(1);
                // Play uses only the router guard. Project-action confirmation is
                // reserved for Open/Retry's server side effect before navigation.
                expect(opened).toHaveBeenCalledTimes(1);
                expect(stay).toHaveAttribute("id", "game-model-unsaved-stay");
                if (keyboard) {
                    act(() => stay.focus());
                    await user.keyboard("{Enter}");
                } else await user.click(stay);
                await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
                expect(router.state.location.pathname).toBe(editingPath);
                expect(screen.getByLabelText("Description (optional)")).toHaveValue("Fresh affected navigation draft");
                expect(opened).toHaveBeenCalledTimes(1);
                // NavTabs returns focus to the drawer toggle in this layout-less DOM.
                // The browser verifier separately owns visible desktop/mobile focus bounds.
                await waitFor(() => expect(screen.getByRole("button", {name: "Toggle navigation"})).toHaveFocus());
                expect(loadPersistedProjectBlueprintDraft(activeJob.projectId)?.blueprint.manifest).toMatchObject({description: "Fresh affected navigation draft"});
                expect(document.querySelector('[data-pokie-lifecycle-result-control="project-tab:gameModel"]')).toHaveTextContent("Game Model ready");
                expect(document.querySelector('[data-pokie-lifecycle-result-control="project-tab:gameModel"]')).toHaveAttribute("data-pokie-lifecycle-terminal", "rendered");
                const unload = new Event("beforeunload", {cancelable: true});
                window.dispatchEvent(unload);
                expect(unload.defaultPrevented).toBe(true);
            }
            await user.click(screen.getByRole("button", {name: "Overview"}));
            await user.click(await screen.findByRole("button", {name: "Leave"}));
            await waitFor(() => expect(router.state.location.pathname).toMatch(/\/overview$/));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            expect(screen.getByText("Overview ready")).toBeVisible();
            expect(loadPersistedProjectBlueprintDraft(activeJob.projectId)).toBeUndefined();
            await act(async () => {
                await router.navigate(-1);
            });
            await waitFor(() => expect(router.state.location.pathname).toBe(editingPath));
            expect(await screen.findByText("Game Model ready")).toBeVisible();
            expect(screen.queryByText(/unsaved game model draft/)).not.toBeInTheDocument();
            expect(screen.queryByRole("button", {name: "Restore", exact: true})).not.toBeInTheDocument();
            expect(screen.queryByRole("button", {name: "Discard", exact: true})).not.toBeInTheDocument();
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
            await act(async () => {
                await router.navigate(1);
            });
            expect(await screen.findByText("Overview ready")).toBeVisible();
            expect(calls.some(call => call.url === "/api/home/blueprints/save" || call.url === "/api/projects/close" || call.url.endsWith("/cancel") || call.url === "/api/home/projects/open")).toBe(false);
        } finally {
            unmount();
            opened.mockRestore();
        }
    });

    it.each(["Your projects", "FromStan/POKIE Studio"])("V35-HOME-PROJECT-JOB: %s preserves active work through Home sections and scoped return", async launcher => {
        const user = userEvent.setup();
        let optimization = {...activeJob, operation: "optimization", status: "running"};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...openingRoutes(),
            "/api/context": () => ({ok: true, status: 200, body: {mode: "project", projectRoot: activeJob.projectId}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {projectRoot: activeJob.projectId, jobs: [optimization]}}),
            "/api/project/jobs/job-1": () => ({ok: true, status: 200, body: optimization}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        });
        const {router, unmount} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("region", {name: "optimization job job-1"});
        await user.click(screen.getByRole("button", {name: launcher}));
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/projects"));
        const homeCard = await screen.findByRole("region", {name: "optimization job job-1"});
        expect(homeCard).toHaveTextContent("2 / 4 files");
        expect(within(homeCard).getByRole("button", {name: "Cancel"})).toBeEnabled();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Start a game"}));
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/design"));
        expect(screen.getByRole("region", {name: "optimization job job-1"})).toBe(homeCard);
        await user.click(screen.getByRole("button", {name: "Projects"}));
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/projects"));
        act(() => within(homeCard).getByRole("button", {name: "Cancel"}).focus());
        optimization = {...optimization, status: "completed"};
        await screen.findByText("optimization · Completed");
        expect(homeCard).toHaveFocus();
        await user.click(screen.getByRole("button", {name: "Return to project"}));
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(activeJob.projectId)}/overview`));
        expect(await screen.findByRole("region", {name: "optimization job job-1"})).toHaveTextContent("Completed");
        expect(calls.filter(call => call.url === "/api/projects/close" || call.url === "/api/home/projects/open" || call.url.endsWith("/cancel") || call.url.endsWith("/recover"))).toEqual([]);
        unmount();
    });

    it("V35-HOME-DIRTY-NAVIGATION: Stay retains the edit and Leave visits Home without cancelling work", async () => {
        const user = userEvent.setup();
        const blueprint = {manifest: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"},
            reels: 1, rows: 1, symbols: ["A"], reelStrips: [["A"]], paylines: [[0]], paytable: {A: {1: 1}}, availableBets: [1]};
        const unavailable = {status: "unavailable", reason: "Not required for this edit"};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...openingRoutes(),
            "/api/context": () => ({ok: true, status: 200, body: {mode: "project", projectRoot: activeJob.projectId}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {projectRoot: activeJob.projectId, jobs: [activeJob]}}),
            "/api/project/jobs/job-1": () => ({ok: true, status: 200, body: activeJob}),
            "/api/project/gameModel": () => ({ok: true, status: 200, body: {
                basics: {status: "available", data: blueprint.manifest}, layout: unavailable, symbols: unavailable,
                reels: unavailable, paytable: unavailable, betsAndModes: unavailable, mechanics: unavailable, limits: unavailable,
            }}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: activeJob.projectId, blueprint, blueprintHash: "h1"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        });
        const {router, unmount} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Game Model"}));
        const basics = (await screen.findByText("Game basics", {selector: "span"})).closest("fieldset")!;
        await user.click(within(basics).getByRole("button", {name: "Edit"}));
        fireEvent.change(await within(basics).findByLabelText("Game name"), {target: {value: "Unsaved name"}});
        await user.click(screen.getByRole("button", {name: "Your projects"}));
        await user.click(await screen.findByRole("button", {name: "Stay"}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Unsaved name");
        expect(router.state.location.pathname).toMatch(/\/gameModel$/);
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "FromStan/POKIE Studio"}));
        await user.click(await screen.findByRole("button", {name: "Leave"}));
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/projects"));
        expect(await screen.findByRole("region", {name: "certification-evidence-build job job-1"})).toHaveTextContent("Writing evidence");
        expect(calls.some(call => call.url === "/api/projects/close" || call.url.endsWith("/cancel") || call.url === "/api/home/blueprints/save")).toBe(false);
        unmount();
    });

    it.each([true, false])("opens a completed Blueprint through Studio (native host available: %s), preserving Reveal semantics", async (nativeAvailable) => {
        const user = userEvent.setup();
        let currentRoot = "/games/sample-slot";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...openingRoutes(),
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: currentRoot,
                game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: nativeAvailable ? {status: "available"} : {status: "unavailable", reason: "Remote session."}}),
            "/api/home/fs/reveal-path": () => ({ok: true, status: 200, body: {status: "ok"}}),
            "/api/home/projects/open": () => {
                currentRoot = openedRuntime;
                return {ok: true, status: 200, body: {context: {mode: "project", projectRoot: currentRoot}}};
            },
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("button", {name: "Open Opened project"});
        await waitFor(() => expect(calls.some(call => call.url === "/api/home/fs/native-browse/availability")).toBe(true));
        if (nativeAvailable) {
            await user.click(await screen.findByRole("button", {name: "Reveal Opened project"}));
            expect(calls.filter(call => call.url === "/api/home/fs/reveal-path").map(call => JSON.parse(call.init!.body!))).toEqual([{path: openingSource}]);
        } else {
            await waitFor(() => expect(screen.queryByRole("button", {name: "Reveal Opened project"})).not.toBeInTheDocument());
        }
        await user.click(screen.getByRole("button", {name: "Open Opened project"}));
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(openedRuntime)}/overview`));
        expect(calls.filter(call => call.url === "/api/home/projects/open").map(call => JSON.parse(call.init!.body!))).toEqual([{projectRoot: openingSource}]);
        expect(calls.some(call => call.url === "/api/home/fs/open-folder")).toBe(false);
    });

    it.each(openingActionCases)("confirms active operations for $job.status opening $actionName, preserves Cancel and retries with server permission", async ({job, actionName, expectedSource}) => {
        const user = userEvent.setup();
        let currentRoot = "/games/sample-slot";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...openingRoutes(),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [job]}}),
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: currentRoot,
                game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/home/projects/open": call => {
                if (!JSON.parse(call.init!.body!).confirmActiveJobs) return {ok: false, status: 409, body: {code: "active-jobs-require-confirmation", operations: ["certification-evidence-build"]}};
                currentRoot = openedRuntime;
                return {ok: true, status: 200, body: {context: {mode: "project", projectRoot: currentRoot}}};
            },
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: actionName}));
        await screen.findByText(/Active operations: certification-evidence-build/);
        await user.click(screen.getByRole("button", {name: "Cancel"}));
        expect(await screen.findByText(/Project switch cancelled/)).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText(/Active operations: certification-evidence-build/)).not.toBeInTheDocument());
        expect(router.state.location.pathname).toMatch(/sample-slot.*overview$/);
        expect(calls.filter(call => call.url === "/api/home/projects/open")).toHaveLength(1);
        expect(screen.getByRole("region", {name: `project-open-materialization job ${job.id}`})).toHaveTextContent(JSON.stringify(job.request));
        expect(screen.getByRole("button", {name: actionName})).toBeEnabled();
        await user.click(screen.getByRole("button", {name: actionName}));
        await screen.findByText(/Active operations: certification-evidence-build/);
        await user.click(screen.getByRole("button", {name: "Confirm"}));
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(openedRuntime)}/overview`));
        expect(calls.filter(call => call.url === "/api/home/projects/open").map(call => JSON.parse(call.init!.body!))).toEqual([
            {projectRoot: expectedSource}, {projectRoot: expectedSource}, {projectRoot: expectedSource, confirmActiveJobs: true},
        ]);
        expect(calls.some(call => call.url === "/api/home/fs/open-folder" || call.url === "/api/project/artifacts/build" || call.url.endsWith("/recover"))).toBe(false);
    });

    it.each(openingActionCases)("guards dirty edits for $job.status opening $actionName, preserves Stay and rejection, then recovers explicitly", async ({job, actionName, expectedSource}) => {
        let currentRoot = "/games/sample-slot";
        let rejectOpen = true;
        const blueprint = {manifest: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"},
            reels: 1, rows: 1, symbols: ["A"], reelStrips: [["A"]], paylines: [[0]], paytable: {A: {1: 1}}, availableBets: [1]};
        const unavailable = {status: "unavailable", reason: "Not required for this edit"};
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...openingRoutes(),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [job]}}),
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: currentRoot,
                game: blueprint.manifest, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/gameModel": () => ({ok: true, status: 200, body: {
                basics: {status: "available", data: blueprint.manifest}, layout: unavailable, symbols: unavailable,
                reels: unavailable, paytable: unavailable, betsAndModes: unavailable, mechanics: unavailable, limits: unavailable,
            }}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: currentRoot, blueprint, blueprintHash: "h1"}}),
            "/api/home/projects/open": () => {
                if (rejectOpen) return {ok: false, status: 400, body: {error: "Source temporarily unavailable."}};
                currentRoot = openedRuntime;
                return {ok: true, status: 200, body: {context: {mode: "project", projectRoot: currentRoot}}};
            },
        });
        const user = userEvent.setup();
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Game Model"}));
        const basics = (await screen.findByText("Game basics", {selector: "span"})).closest("fieldset")!;
        await user.click(within(basics).getByRole("button", {name: "Edit"}));
        fireEvent.change(await within(basics).findByLabelText("Game name"), {target: {value: "Unsaved producer edit"}});
        const confirmation = "You have unsaved changes to this game model section. Leave and lose them?";
        const opens = () => calls.filter(call => call.url === "/api/home/projects/open");
        if (actionName === "Retry") expect(screen.queryByRole("button", {name: "Open Opened project"})).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: actionName}));
        await screen.findByText(confirmation);
        expect(opens()).toHaveLength(0);
        await user.click(screen.getByRole("button", {name: "Stay"}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Unsaved producer edit");
        expect(loadPersistedProjectBlueprintDraft(activeJob.projectId)?.blueprint.manifest).toMatchObject({name: "Unsaved producer edit"});
        await waitFor(() => expect(screen.queryByText(confirmation)).not.toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: actionName}));
        await screen.findByText(confirmation);
        expect(opens()).toHaveLength(0);
        await user.click(screen.getByRole("button", {name: "Leave"}));
        const openingError = await screen.findByText(/Source temporarily unavailable/);
        expect(openingError).toHaveTextContent(expectedSource);
        expect(openingError).toHaveTextContent(/Retry.*Projects to Relocate/);
        await waitFor(() => expect(screen.queryByText(confirmation)).not.toBeInTheDocument());
        expect(opens()).toHaveLength(1);
        expect(screen.getByRole("region", {name: `project-open-materialization job ${job.id}`})).toHaveTextContent(JSON.stringify(job.request));
        expect(screen.getByRole("button", {name: actionName})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Find retained project in Projects"})).toBeEnabled();
        expect(router.state.location.pathname).toMatch(/\/gameModel$/);
        expect(screen.getByLabelText("Game name")).toHaveValue("Unsaved producer edit");
        expect(loadPersistedProjectBlueprintDraft(activeJob.projectId)?.blueprint.manifest).toMatchObject({name: "Unsaved producer edit"});
        // A failed action must not leave a navigation allowance armed.
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await screen.findByText(confirmation);
        await user.click(screen.getByRole("button", {name: "Stay"}));
        await waitFor(() => expect(screen.queryByText(confirmation)).not.toBeInTheDocument());
        expect(router.state.location.pathname).toMatch(/\/gameModel$/);
        rejectOpen = false;
        await user.click(screen.getByRole("button", {name: actionName}));
        await screen.findByText(confirmation);
        expect(opens()).toHaveLength(1);
        await user.click(screen.getByRole("button", {name: "Leave"}));
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(openedRuntime)}/overview`));
        await waitFor(() => expect(screen.queryByText(confirmation)).not.toBeInTheDocument());
        expect(loadPersistedProjectBlueprintDraft(activeJob.projectId)).toBeUndefined();
        expect(opens().map(call => JSON.parse(call.init!.body!))).toEqual([
            {projectRoot: expectedSource}, {projectRoot: expectedSource},
        ]);
        expect(calls.some(call => call.url === "/api/home/fs/open-folder" || call.url === "/api/project/artifacts/build" || call.url.endsWith("/recover"))).toBe(false);
    });

    it("withholds missing project actions and reaches Projects recovery without replaying an open", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...openingRoutes(),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [{...completedOpening, result: {...completedOpening.result,
                outputs: [{label: "Opened project", path: openingSource, unavailableReason: "The retained project is missing. Use Projects to Relocate it to its current location, or add the game again."}]}}]}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByText(/Use Projects to Relocate/);
        expect(screen.getByText("project-open-materialization · Completed")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Open Opened project"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Reveal Opened project"})).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Find retained project in Projects"}));
        expect(await screen.findByRole("heading", {name: "Projects"})).toBeInTheDocument();
        expect(calls.some(call => call.url === "/api/home/projects/open" || call.url === "/api/home/fs/open-folder")).toBe(false);
    });

    it("keeps artifact folder actions and Outcome Library inspection on their existing paths", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...openingRoutes(),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [
                {...completedOpening, id: "artifact", operation: "artifact-build", result: {outputs: [{label: "Artifact", path: "/output/artifact"}]}},
                {...completedOpening, id: "outcomes", operation: "outcome-library-generation", result: {outputs: [{label: "Library", path: "/output/library"}]}},
            ]}}),
            "/api/home/fs/open-folder": () => ({ok: true, status: 200, body: {status: "ok"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Open Artifact"}));
        await user.click(screen.getByRole("button", {name: "Open Library"}));
        expect(screen.getByRole("button", {name: "Inspect Library"})).toBeEnabled();
        expect(calls.filter(call => call.url === "/api/home/fs/open-folder").map(call => JSON.parse(call.init!.body!))).toEqual([{path: "/output/artifact"}, {path: "/output/library"}]);
        expect(calls.some(call => call.url === "/api/home/projects/open")).toBe(false);
    });

    it("shows a rejected common simulation cancellation outside Simulation while retaining the active job", async () => {
        const user = userEvent.setup();
        const simulationJob = {...activeJob, id: "observed-simulation", operation: "simulation"};
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [simulationJob]}}),
            "/api/project/jobs/observed-simulation": () => ({ok: true, status: 200, body: simulationJob}),
            "/api/project/simulations/observed-simulation": (call) => call.init?.method === "DELETE"
                ? {ok: false, status: 503, body: {error: "Cancellation unavailable"}}
                : {ok: true, status: 200, body: {id: "observed-simulation", status: "running", rounds: 10, roundsCompleted: 2, workers: 1, durationMs: 100, startedAt: new Date().toISOString()}},
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Cancel"}));
        expect(await screen.findByText(/Simulation control failed/)).toHaveTextContent("Cancellation unavailable");
        expect(screen.getByText("simulation · Running")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Reattach to retained work"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Cancel"})).toBeEnabled();
    });
    it("discovers a simulation started after mount, retains its report outside the feature panel, and leaves the user's selected task and focus in place", async () => {
        const user = userEvent.setup();
        let started = false;
        let completed = false;
        const durable = () => ({id: "new-simulation", projectId: "/games/sample-slot", operation: "simulation", request: {rounds: 10}, conflictKey: "simulation", createdAt: 1,
            status: completed ? "completed" : "running", result: completed ? {summary: "Ten real rounds completed.", outputs: [{label: "simulation report", downloadPath: "/api/project/reports/new-simulation/download?format=json"}]} : undefined});
        const simulation = () => ({id: "new-simulation", status: completed ? "completed" : "running", rounds: 10, roundsCompleted: completed ? 10 : 2, workers: 1, durationMs: 100, startedAt: new Date().toISOString()});
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: started ? [durable()] : []}}),
            "/api/project/jobs/new-simulation": () => ({ok: true, status: 200, body: durable()}),
            "/api/project/simulations": () => {
                started = true;
                return {ok: true, status: 201, body: simulation()};
            },
            "/api/project/simulations/new-simulation": () => ({ok: true, status: 200, body: simulation()}),
            "/api/project/reports/new-simulation": () => ({ok: true, status: 200, body: {report: {game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, requestedRounds: 10, rounds: 10, totalBet: 10, totalWin: 2, rtp: 0.2, hitFrequency: 0.1, maxWin: 2, workers: 1, durationMs: 100, spinsPerSecond: 100, warnings: [], recommendations: []}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Simulation"}));
        await user.click(await screen.findByRole("button", {name: "Run Simulation"}));
        await user.click(screen.getByRole("button", {name: "Overview"}));
        await waitFor(() => expect(router.state.location.pathname).toMatch(/\/overview$/));
        expect(await screen.findByText("simulation · Running")).toBeInTheDocument();
        // Focus belongs to the rendered destination, after its navigation
        // effect settles, rather than the router's earlier location update.
        await screen.findByText("Overview ready");
        const copyControl = screen.getByRole("button", {name: "Close project"});
        copyControl.focus();
        completed = true;
        expect(await screen.findByRole("link", {name: "Download simulation report"})).toHaveAttribute("href", "/api/project/reports/new-simulation/download?format=json");
        expect(router.state.location.pathname).toMatch(/\/overview$/);
        expect(copyControl).toHaveFocus();
        expect(calls.filter((call) => call.url === "/api/project/simulations" && call.init?.method === "POST")).toHaveLength(1);
    });
    it.each(["held", "loading", "failed"])("holds a dependent workflow selection through its exact %s context refresh in StrictMode", async (refreshState) => {
        const user = userEvent.setup();
        const projectContext = {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]};
        let holdNextContext = false;
        let loadingPublished = false;
        let resolveHeldContext: (() => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            const [pathname] = url.split("?");
            const response = (body: unknown) => ({ok: true, status: 200, json: () => Promise.resolve(body)});
            if (pathname === "/api/project/context") {
                if (holdNextContext) {
                    if (refreshState === "loading" && !loadingPublished) {
                        loadingPublished = true;
                        return Promise.resolve(response({status: "loading", projectRoot: projectContext.projectRoot}));
                    }
                    holdNextContext = false;
                    return new Promise((resolve) => {
                        resolveHeldContext = () => resolve(refreshState === "failed"
                            ? {ok: false, status: 503, json: () => Promise.resolve({error: "Fresh context unavailable"})}
                            : response(projectContext));
                    });
                }
                return Promise.resolve(response(projectContext));
            }
            if (pathname === "/api/project/jobs") return Promise.resolve(response({jobs: []}));
            if (pathname === "/api/project/inspect") return Promise.resolve(response({packageRoot: "/games/sample-slot", valid: true, generated: false}));
            if (pathname === "/api/project/reports" || pathname === "/api/project/replays" || pathname === "/api/project/deployment/targets") return Promise.resolve(response([]));
            if (pathname === "/api/project/validate") return Promise.resolve(response({packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}));
            throw new Error(`Unexpected request: ${pathname}`);
        };

        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"], strictMode: true});
        await screen.findByRole("heading", {name: "Sample Slot"});
        expect(screen.getByRole("button", {name: "Your projects"})).toHaveAttribute("id", "project-breadcrumb-projects");
        expect(screen.getByText("Overview ready")).toHaveAttribute("tabindex", "-1");
        const overviewPath = router.state.location.pathname;
        holdNextContext = true;

        await user.click(screen.getByRole("button", {name: "Simulation"}));

        await waitFor(() => expect(resolveHeldContext).toBeDefined());
        expect(router.state.location.pathname).toBe(overviewPath);
        expect(screen.queryByRole("button", {name: "Run Simulation"})).not.toBeInTheDocument();

        await act(() => Promise.resolve(resolveHeldContext?.()));

        if (refreshState === "failed") {
            expect(await screen.findByText(/Fresh context unavailable/)).toBeInTheDocument();
            expect(router.state.location.pathname).toBe(overviewPath);
            expect(screen.queryByRole("button", {name: "Run Simulation"})).not.toBeInTheDocument();
        } else {
            expect(await screen.findByRole("button", {name: "Run Simulation"})).toBeInTheDocument();
            expect(router.state.location.pathname).toMatch(/\/simulation$/);
        }
    });

    it("revalidates context for every rendered terminal durable receipt", async () => {
        let contextRequests = 0;
        const completedArtifactJob = {
            id: "artifact-job-completed", projectId: "/games/sample-slot", operation: "artifact-build", request: {}, conflictKey: "artifact-build:/games/sample-slot",
            status: "completed", createdAt: 1, result: {summary: "Artifact build completed.", outputs: [{label: "PAR workbook", path: "/games/sample-slot/output.xlsx"}]},
        };
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => {
                contextRequests += 1;
                return {ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}};
            },
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [completedArtifactJob]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        const receipt = await screen.findByRole("status", {name: /artifact-build · completed/i});
        expect(receipt).toHaveAttribute("data-pokie-lifecycle-result", "artifact-build");
        expect(receipt).toHaveAttribute("data-pokie-lifecycle-terminal", "completed");
        expect(receipt.querySelector('[data-pokie-lifecycle-artifact="PAR workbook"]')).toBeInTheDocument();
        await screen.findByText("Artifact build completed.");
        expect(contextRequests).toBeGreaterThanOrEqual(2);
    });

    it("revalidates the rendered project context after an Outcome Library terminal receipt enables Certification", async () => {
        let contextRequests = 0;
        const completedOutcomeLibraryJob = {
            id: "outcome-job-completed", projectId: "/games/sample-slot", operation: "outcome-library-generation", request: {}, conflictKey: "outcome-library:/games/sample-slot/outcomelibrary",
            status: "completed", createdAt: 1,
        };
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => {
                contextRequests += 1;
                return contextRequests === 1
                    ? {ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}
                    : {ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "outcomeLibrary", capabilities: ["outcomeLibrary.read"]}};
            },
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [completedOutcomeLibraryJob]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        expect(await screen.findByRole("button", {name: "Certification"})).toBeEnabled();
        expect(contextRequests).toBeGreaterThanOrEqual(2);
    });

    it("keeps retained generation receipts discoverable when an outcome artifact only offers republishing", async () => {
        const user = userEvent.setup();
        const job = {id: "previous-generation", projectId: "/games/sample-slot", operation: "outcome-library-generation",
            request: {}, conflictKey: "outcomes", status: "completed", createdAt: 1, result: {summary: "Published the retained outcomes."}};
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot",
                game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "outcomeLibrary", capabilities: ["outcomeLibrary.read"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [job]}}),
            "/api/project/outcome-libraries/generate/jobs": () => ({ok: true, status: 200, body: {status: "ok", jobs: [{id: job.id, status: "completed"}]}}),
            "/api/project/artifacts/targets": () => ({ok: true, status: 200, body: [{target: "outcomeLibrary", supported: true,
                state: "supported", unsupportedNotes: [], plan: {status: "planned", source: {kind: "outcomeLibrary", capabilities: []},
                    target: {kind: "outcomeLibrary", capabilities: []}, steps: [],
                    preflight: {destinationKind: "directory", estimatedWork: "copy", losses: [], oneWay: false}}}]}),
            "/api/project/artifacts/preview": () => ({ok: true, status: 200, body: {status: "ok", target: "outcomeLibrary",
                destination: "/games/copied-outcomes", destinationKind: "directory", plannedOutputs: [], sourceType: "outcomeLibrary"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Build/Export"}));
        await screen.findByText("Outcome library");
        await screen.findByText("outcome-library-generation · Completed");
        expect(screen.queryByText("Outcome library generator")).not.toBeInTheDocument();
        expect(screen.getAllByText("Published the retained outcomes.")).toHaveLength(1);
    });

    it("keeps an Outcome Library durable job visible through the common card outside Build/Export", async () => {
        const outcomeJob = {
            id: "outcome-job-1", projectId: "/games/sample-slot", operation: "outcome-library-generation", request: {}, conflictKey: "outcome-library:/games/sample-slot/outcomelibrary",
            status: "running", createdAt: 1, progress: {stage: "Analyzing outcomes", unit: "records", current: "2", total: "4"},
        };
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [outcomeJob]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        expect(await screen.findByText("Analyzing outcomes")).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Studio operations"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Cancel"})).toBeInTheDocument();
    });

    it("discovers active common jobs and obtains server-validated confirmation with the affected operation before Close", async () => {
        const user = userEvent.setup();
        let closeAttempts = 0;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/sample-slot", game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
            "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [activeJob]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/sample-slot", valid: true, game: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"}, errors: [], warnings: [], suggestions: []}}),
            "/api/projects/close": (call) => {
                closeAttempts += 1;
                if (closeAttempts === 1) return {ok: false, status: 409, body: {code: "active-jobs-require-confirmation", operations: ["certification-evidence-build"]}};
                expect(call.init?.body).toBe(JSON.stringify({confirmActiveJobs: true}));
                return {ok: true, status: 200, body: {context: {mode: "home"}}};
            },
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "Sample Slot"});
        expect(await screen.findByText("Writing evidence")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Close project"}));

        // The local warning identifies the active operation before any close
        // request can be sent. The card is intentionally not part of this
        // assertion: Mantine's alert title is an accessible label rather than
        // a second rendered text node in every supported version.
        expect(await screen.findByText(/active Studio operations \(certification-evidence-build\)/i)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Confirm"}));
        expect(await screen.findByText(/Active operations: certification-evidence-build/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Confirm"}));
        expect(await screen.findByRole("heading", {name: "Projects"})).toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/projects/close").map((call) => call.init?.body)).toEqual([undefined, JSON.stringify({confirmActiveJobs: true})]);
    });
});
