import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {StudioJobView} from "../../../../../../cli/studio-client/src/api/types";
import {HomeProjectJobs} from "../../../../../../cli/studio-client/src/components/home/HomeProjectJobs";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {jobFocusLayout} from "../../testUtils/jobFocusLayout";
import {renderWithProviders} from "../../testUtils/renderWithProviders";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {optimizationRequest} from "../../../../../v2/fixtures/OptimizationFixture";

const root = "/games/server-returned project";
const active: StudioJobView = {id: "optimizer", projectId: root, operation: "optimization", request: {budget: 3}, conflictKey: "optimization",
    status: "running", createdAt: 1, progress: {stage: "Evaluating candidates", current: 1, total: 3, unit: "candidates"}};

it("guards Return to project before leaving a dirty Home draft and keeps work running after Stay and Leave", async () => {
    const user = userEvent.setup();
    const {fetchImpl, calls} = createRoutedFakeFetch({
        "/api/context": () => ({ok: true, status: 200, body: {mode: "project", projectRoot: root}}),
        "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: root,
            game: {id: "server-project", name: "Server project", version: "1.0.0"}, type: "blueprint", capabilities: []}}),
        "/api/project/jobs": () => ({ok: true, status: 200, body: {projectRoot: root, jobs: [active]}}),
        "/api/project/jobs/optimizer": () => ({ok: true, status: 200, body: active}),
        "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
        "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        "/api/project/validate": () => ({ok: true, status: 200, body: {valid: true, errors: [], warnings: []}}),
    });
    const {router, unmount} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
    await screen.findByRole("button", {name: "Return to project"});
    fireEvent.change(screen.getByLabelText("Game name"), {target: {value: "Unsaved Home design"}});
    fireEvent.blur(screen.getByLabelText("Game name"));
    await user.click(screen.getByRole("button", {name: "Return to project"}));
    await user.click(await screen.findByRole("button", {name: "Stay"}));
    expect(router.state.location.pathname).toBe("/home/design");
    expect(screen.getByLabelText("Game name")).toHaveValue("Unsaved Home design");
    expect(calls.some(call => call.url === "/api/project/context")).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", {name: "Return to project"}));
    await user.click(await screen.findByRole("button", {name: "Leave"}));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(root)}/overview`));
    expect(await screen.findByRole("region", {name: "optimization job optimizer"})).toHaveTextContent("Evaluating candidates");
    expect(calls.some(call => call.url === "/api/home/projects/open" || call.url === "/api/projects/close" || call.url.endsWith("/cancel"))).toBe(false);
    unmount();
});

it("rechecks current identity on reconnect and retires the old project's delayed observation", async () => {
    const user = userEvent.setup();
    const nextRoot = "/games/another project";
    let currentRoot = root;
    let releaseOld: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    let oldReads = 0;
    const requests: string[] = [];
    const fetchImpl: FetchLike = (url) => {
        requests.push(url);
        if (url === "/api/context") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({mode: "project", projectRoot: currentRoot})});
        if (url === "/api/home/fs/native-browse/availability") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "available"})});
        if (currentRoot === root && oldReads++ === 0) return Promise.resolve({ok: false, status: 503, json: () => Promise.resolve({error: "Reconnect needed"})});
        // The retry list is already in flight when the context read switches scope.
        if (url === "/api/project/jobs" && releaseOld === undefined) return new Promise(resolve => {
            releaseOld = resolve;
        });
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({projectRoot: nextRoot, jobs: [{...active, id: "next", projectId: nextRoot}]})});
    };
    const rendered = renderWithProviders(<HomeProjectJobs />, {fetchImpl});
    await screen.findByText(/Reconnect needed/);
    currentRoot = nextRoot;
    await user.click(screen.getByRole("button", {name: "Reattach to retained work"}));
    expect(await screen.findByRole("region", {name: "optimization job next"})).toHaveTextContent("Evaluating candidates");
    await act(async () => {
        releaseOld?.({ok: true, status: 200, json: () => Promise.resolve({projectRoot: root, jobs: [active]})});
        await Promise.resolve();
    });
    expect(screen.queryByRole("region", {name: "optimization job optimizer"})).not.toBeInTheDocument();
    expect(screen.getByText(nextRoot)).toBeInTheDocument();
    expect(requests.filter(url => url === "/api/context")).toHaveLength(2);
    rendered.unmount();
});

it("aborts context discovery on unmount and never attaches a late previous Home response", async () => {
    let release: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    let signal: AbortSignal | undefined;
    const requests: string[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        requests.push(url);
        signal = init?.signal ?? undefined;
        return new Promise(resolve => {
            release = resolve;
        });
    };
    const rendered = renderWithProviders(<HomeProjectJobs />, {fetchImpl});
    expect(screen.getByText("Checking for active project work…")).toBeInTheDocument();
    rendered.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
        release?.({ok: true, status: 200, json: () => Promise.resolve({mode: "project", projectRoot: root})});
        await Promise.resolve();
    });
    expect(requests).toEqual(["/api/context"]);
});

it("distinguishes delayed context, empty Home and failed discovery, then retries the real project adapter", async () => {
    const user = userEvent.setup();
    let resolveContext: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    let resolveJobs: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    let attempt = 0;
    const requests: string[] = [];
    const fetchImpl: FetchLike = url => {
        requests.push(url);
        if (url === "/api/home/fs/native-browse/availability") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "available"})});
        if (url === "/api/context") {
            attempt++;
            if (attempt === 1) return Promise.reject(new Error("Context disconnected"));
            return new Promise(resolve => {
                resolveContext = resolve;
            });
        }
        return new Promise(resolve => {
            resolveJobs = resolve;
        });
    };
    const rendered = renderWithProviders(<HomeProjectJobs />, {fetchImpl});
    expect(await screen.findByRole("alert")).toHaveTextContent("Context disconnected");
    expect(requests).toEqual(["/api/context"]);
    await user.click(screen.getByRole("button", {name: "Retry project discovery"}));
    await act(async () => {
        resolveContext?.({ok: true, status: 200, json: () => Promise.resolve({mode: "project", projectRoot: root})});
        await Promise.resolve();
    });
    expect(await screen.findByText("Checking for retained work…")).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Cancel"})).not.toBeInTheDocument();
    await act(async () => {
        resolveJobs?.({ok: true, status: 200, json: () => Promise.resolve({projectRoot: root, jobs: [active]})});
        await Promise.resolve();
    });
    expect(await screen.findByRole("region", {name: "optimization job optimizer"})).toHaveTextContent("1 / 3 candidates");
    expect(screen.queryByText("Checking for retained work…")).not.toBeInTheDocument();
    rendered.unmount();

    const {fetchImpl: homeFetch, calls} = createRoutedFakeFetch({"/api/context": () => ({ok: true, status: 200, body: {mode: "home"}})});
    renderWithProviders(<HomeProjectJobs />, {fetchImpl: homeFetch});
    await waitFor(() => expect(screen.queryByText("Checking for active project work…")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", {name: "Current project operations"})).not.toBeInTheDocument();
    expect(calls.map(call => call.url)).toEqual(["/api/context"]);
});

it("retains work across rejected cancellation and reconnect, then restores focus to the cleanup terminal", async () => {
    const user = userEvent.setup();
    let job = active;
    let rejectCancel = true;
    let disconnected = false;
    const {fetchImpl, calls} = createRoutedFakeFetch({
        "/api/context": () => ({ok: true, status: 200, body: {mode: "project", projectRoot: root}}),
        "/api/project/jobs": () => disconnected ? {ok: false, status: 503, body: {error: "List disconnected"}} : {ok: true, status: 200, body: {projectRoot: root, jobs: [job]}},
        "/api/project/jobs/optimizer": () => ({ok: true, status: 200, body: job}),
        "/api/project/jobs/optimizer/cancel": () => {
            if (rejectCancel) return {ok: false, status: 503, body: {error: "Cancel unavailable"}};
            job = {...job, status: "cancelling"};
            return {ok: true, status: 202, body: job};
        },
    });
    const rendered = renderWithProviders(<HomeProjectJobs />, {fetchImpl});
    const card = await screen.findByRole("region", {name: "optimization job optimizer"});
    await user.click(within(card).getByRole("button", {name: "Cancel"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cancel unavailable");
    expect(within(card).getByRole("button", {name: "Cancel"})).toBeEnabled();
    disconnected = true;
    await screen.findByText(/List disconnected/);
    expect(card).toHaveTextContent("Evaluating candidates");
    disconnected = false;
    await user.click(screen.getByRole("button", {name: "Reattach to retained work"}));
    await waitFor(() => expect(screen.queryByText(/List disconnected/)).not.toBeInTheDocument());
    rejectCancel = false;
    await user.click(within(card).getByRole("button", {name: "Cancel"}));
    expect(await screen.findByText("Cancellation requested; waiting for cleanup.")).toBeInTheDocument();
    expect(within(card).getByRole("button", {name: "Cancel"})).toBeDisabled();
    job = {...job, status: "cancelled", recovery: {action: "retry", reason: "Review captured settings before starting again."}};
    await screen.findByText("optimization · Cancelled");
    expect(card).toHaveFocus();
    expect(within(card).getByRole("button", {name: "Retry"})).toBeEnabled();
    expect(screen.getByRole("button", {name: "Return to project"})).toBeEnabled();
    expect(calls.filter(call => call.init?.method === "POST").map(call => call.url)).toEqual([
        "/api/project/jobs/optimizer/cancel", "/api/project/jobs/optimizer/cancel",
    ]);
    rendered.unmount();
});

it("keeps sibling focus during completion and the actual focused control visible after reflow", async () => {
    const layout = jobFocusLayout();
    let first = active;
    const sibling = {...active, id: "artifact", operation: "artifact-build"};
    const {fetchImpl} = createRoutedFakeFetch({
        "/api/context": () => ({ok: true, status: 200, body: {mode: "project", projectRoot: root}}),
        "/api/project/jobs": () => ({ok: true, status: 200, body: {projectRoot: root, jobs: [first, sibling]}}),
        "/api/project/jobs/optimizer": () => ({ok: true, status: 200, body: first}),
        "/api/project/jobs/artifact": () => ({ok: true, status: 200, body: sibling}),
    });
    const rendered = renderWithProviders(<HomeProjectJobs />, {fetchImpl});
    try {
        const siblingCard = await screen.findByRole("region", {name: "artifact-build job artifact"});
        const cancel = within(siblingCard).getByRole("button", {name: "Cancel"});
        const bounds = layout.place(cancel, 1200);
        act(() => cancel.focus());
        expect(layout.scroll).toHaveBeenCalled();
        layout.scroll.mockClear();
        first = {...first, status: "completed", result: {summary: "Reviewed candidate ready."}};
        await screen.findByText("Reviewed candidate ready.");
        expect(cancel).toHaveFocus();
        await layout.expand(siblingCard);
        expect(layout.scroll).toHaveBeenCalled();
        expect(cancel).toHaveFocus();
        // A later notification cannot scroll on behalf of a sibling or portal.
        act(() => screen.getByRole("button", {name: "Return to project"}).focus());
        layout.scroll.mockClear();
        fireEvent(window, new Event("resize"));
        await layout.expand(siblingCard);
        expect(layout.scroll).not.toHaveBeenCalled();
        bounds.restore();
    } finally {
        rendered.unmount();
        layout.restore();
    }
});

it("uses project-scoped Resume and suppresses duplicate opening cards without replaying a request", async () => {
    const user = userEvent.setup();
    let job: StudioJobView = {...active, operation: "outcome-library-generation", status: "recovery-required", recovery: {action: "resume", reason: "Exact checkpoint retained."}};
    const {fetchImpl, calls} = createRoutedFakeFetch({
        "/api/context": () => ({ok: true, status: 200, body: {mode: "project", projectRoot: root}}),
        "/api/project/jobs": () => ({ok: true, status: 200, body: {projectRoot: root, jobs: [job, {...active, id: "opening", operation: "project-open-materialization"}]}}),
        "/api/project/jobs/optimizer": () => ({ok: true, status: 200, body: job}),
        "/api/project/jobs/optimizer/recover": () => {
            job = {...job, status: "running", createdAt: 2, recovery: undefined};
            return {ok: true, status: 202, body: job};
        },
    });
    const rendered = renderWithProviders(<HomeProjectJobs />, {fetchImpl});
    await user.click(await screen.findByRole("button", {name: "Resume"}));
    expect(await screen.findByText("outcome-library-generation · Running")).toBeInTheDocument();
    expect(screen.queryByRole("region", {name: "project-open-materialization job opening"})).not.toBeInTheDocument();
    expect(calls.filter(call => call.init?.method === "POST").map(call => call.url)).toEqual(["/api/project/jobs/optimizer/recover"]);
    rendered.unmount();
});

const recoveryRoutes = {
    "/api/context": () => ({ok: true, status: 200, body: {mode: "project", projectRoot: root}}),
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: root,
        game: {id: "a", name: "A", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]}}),
    "/api/project/gameModel": () => ({ok: true, status: 200, body: {betsAndModes: {status: "available", data: {availableBets: [0.05], betModes: []}}}}),
    "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
    "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
    "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
    "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

const cancelledSimulation: StudioJobView = {
    id: "cancelled-simulation", projectId: root, operation: "simulation", status: "cancelled", createdAt: 1,
    conflictKey: `simulation:${root}`, request: {rounds: 2000000, workers: 1},
    result: {summary: "Simulation cancelled after the observed accepted prefix."},
    recovery: {action: "retry", reason: "Run the simulation again with the captured parameters."},
};

it("V37 Home cancelled simulation Retry guards the draft, restores captured Configure and permits explicit rejection then repeated reuse", async () => {
    const user = userEvent.setup();
    const submissions: unknown[] = [];
    const {fetchImpl, calls} = createRoutedFakeFetch({
        ...recoveryRoutes,
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [cancelledSimulation]}}),
        "/api/project/simulations/cancelled-simulation": () => ({ok: true, status: 200, body: {
            id: cancelledSimulation.id, status: "cancelled", rounds: 2000000, workers: 1, roundsCompleted: 2000,
            startedAt: "2026-10-29T22:05:12.238Z", durationMs: 30000,
        }}),
        "/api/project/simulations": call => {
            submissions.push(JSON.parse(call.init!.body!));
            return submissions.length === 1 ? {ok: false, status: 503, body: {error: "Execution unavailable"}} : {ok: true, status: 201, body: {
                id: "replacement", status: "queued", rounds: 3, workers: 1, roundsCompleted: 0,
                startedAt: "2026-10-29T22:07:00.000Z",
            }};
        },
        "/api/project/simulations/replacement": () => ({ok: true, status: 200, body: {
            id: "replacement", status: "cancelled", rounds: 3, workers: 1, roundsCompleted: 1,
            startedAt: "2026-10-29T22:07:00.000Z", durationMs: 2,
        }}),
    });
    const {router, unmount} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
    const card = await screen.findByRole("region", {name: "simulation job cancelled-simulation"});
    expect(card).toHaveTextContent("Next: retry");
    fireEvent.change(screen.getByLabelText("Game name"), {target: {value: "Keep my draft"}});
    fireEvent.blur(screen.getByLabelText("Game name"));
    await user.click(within(card).getByRole("button", {name: "Retry"}));
    await user.click(await screen.findByRole("button", {name: "Stay"}));
    expect(screen.getByLabelText("Game name")).toHaveValue("Keep my draft");
    expect(router.state.location.pathname).toBe("/home/design");
    expect(submissions).toEqual([]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(within(card).getByRole("button", {name: "Retry"}));
    await user.click(await screen.findByRole("button", {name: "Leave"}));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(root)}/simulation`));
    expect(await screen.findByLabelText(/^Rounds/)).toHaveValue("2000000");
    expect(screen.getByLabelText(/^Workers/)).toHaveValue("1");
    expect(submissions).toEqual([]);
    await user.clear(screen.getByLabelText(/^Rounds/));
    await user.type(screen.getByLabelText(/^Rounds/), "3");
    await user.click(screen.getByRole("button", {name: "Run Simulation"}));
    await screen.findByText("This simulation request couldn't be completed. Try again. If it continues, reopen the project and retry.");
    expect(screen.getByLabelText(/^Rounds/)).toHaveValue("3");
    for (const count of [2, 3]) {
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));
        await waitFor(() => expect(submissions).toHaveLength(count));
        const terminal = await screen.findByText(/^Simulation cancelled —/);
        expect(terminal.parentElement).toHaveAttribute("data-pokie-lifecycle-result-durable-job", "replacement");
        await user.click(screen.getByRole("button", {name: "Back to configuration"}));
        expect(screen.getByLabelText(/^Rounds/)).toHaveValue("3");
    }
    expect(submissions).toEqual(Array.from({length: 3}, () => ({rounds: 3, workers: 1})));
    expect(router.state.location.search).toBe("");
    expect(calls.some(call => call.url === "/api/home/projects/open" || call.url === "/api/projects/close" || call.url.endsWith("/recover"))).toBe(false);
    unmount();
});

it.each(["missing", "active", "no-recovery", "resume"])("V37 refuses a %s recovery handoff without executing retained work", async kind => {
    const job: StudioJobView = {...active, id: "handoff", operation: "artifact-build", status: kind === "active" ? "running" : "cancelled",
        recovery: kind === "no-recovery" ? undefined : {action: kind === "resume" ? "resume" : "retry", reason: "Retained settings"}};
    const {fetchImpl, calls} = createRoutedFakeFetch({
        ...recoveryRoutes,
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: kind === "missing" ? [] : [job]}}),
        "/api/project/jobs/handoff": () => ({ok: true, status: 200, body: job}),
    });
    const {router, unmount} = renderRoutedApp({fetchImpl, initialEntries: [`/project/${encodeURIComponent(root)}/overview?recoverJob=handoff`]});
    await screen.findByText(/This retained job is no longer available for retry/);
    expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(root)}/overview`);
    expect(calls.filter(call => call.init?.method === "POST")).toEqual([]);
    unmount();
});

it.each([13, 5000000])("V37 re-reads captured settings after Home handoff, including invalid rounds %s without coercion", async rounds => {
    const user = userEvent.setup();
    let returnedJob = cancelledSimulation;
    const {fetchImpl, calls} = createRoutedFakeFetch({
        ...recoveryRoutes,
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [returnedJob]}}),
        "/api/project/simulations/cancelled-simulation": () => ({ok: true, status: 200, body: {
            id: cancelledSimulation.id, status: "cancelled", rounds: 2000000, workers: 1, roundsCompleted: 2000,
            startedAt: "2026-10-29T22:05:12.238Z", durationMs: 30000,
        }}),
    });
    const {unmount} = renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});
    const card = await screen.findByRole("region", {name: "simulation job cancelled-simulation"});
    // The next read has different captured fields; Home must carry only the
    // selected identity, never its old request or a constructed result.
    returnedJob = {...cancelledSimulation, request: {rounds, seed: "fresh server settings", workers: 2}};
    await user.click(within(card).getByRole("button", {name: "Retry"}));
    const roundsInput = await screen.findByLabelText(/^Rounds/);
    await waitFor(() => expect(roundsInput).toHaveValue(String(rounds)));
    expect(screen.getByLabelText("Seed (optional)")).toHaveValue("fresh server settings");
    expect(screen.getByLabelText(/^Workers/)).toHaveValue("2");
    if (rounds === 5000000) {
        expect(roundsInput).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeDisabled();
        fireEvent.submit(screen.getByRole("button", {name: "Run Simulation"}).closest("form")!);
        await user.clear(roundsInput);
        await user.type(roundsInput, "13");
    }
    expect(screen.getByRole("button", {name: "Run Simulation"})).toBeEnabled();
    expect(calls.filter(call => call.init?.method === "POST")).toEqual([]);
    unmount();
});

it("V37 keeps Home output availability honest while retaining its download", async () => {
    const {fetchImpl} = createRoutedFakeFetch({
        ...recoveryRoutes,
        "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "unavailable", reason: "Remote Studio session"}}),
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [{...active, status: "completed", result: {
            summary: "Complete", outputs: [{label: "Artifact", path: "/server/output", downloadPath: "/retained/download"}],
        }}]}}),
    });
    const rendered = renderWithProviders(<HomeProjectJobs />, {fetchImpl});
    await screen.findByText("Open and reveal are unavailable: Remote Studio session");
    expect(screen.queryByRole("button", {name: "Open Artifact"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Reveal Artifact"})).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Download Artifact"})).toHaveAttribute("href", "/retained/download");
    rendered.unmount();
});

it("V37 Home optimization Retry selects its owning policy form and exact retained job instead of a newer sibling", async () => {
    const user = userEvent.setup();
    const request = optimizationRequest();
    const older: StudioJobView = {...active, id: "older", status: "cancelled", request: {request},
        recovery: {action: "retry", reason: "Check support and submit explicitly."}};
    const newer = {...older, id: "newer", createdAt: 2, request: {request: {...request, policy: {...request.policy, seed: "newer-policy"}}}};
    const {fetchImpl, calls} = createRoutedFakeFetch({
        ...recoveryRoutes,
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [newer, older]}}),
        "/api/project/optimization/support": () => ({ok: true, status: 200, body: {supported: true, reason: "Policy supported", sourceRevision: "sha256:source"}}),
        "/api/project/optimization/start": () => ({ok: true, status: 200, body: {job: {...older, id: "explicit-new", status: "running",
            progress: {stage: "New policy execution", current: 1, total: 3, unit: "candidates"}}}}),
    });
    const {router, unmount} = renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});
    const card = await screen.findByRole("region", {name: "optimization job older"});
    await user.click(within(card).getByRole("button", {name: "Retry"}));
    const policy = await screen.findByLabelText("Math targets and optimization policy (JSON)");
    await waitFor(() => expect(JSON.parse((policy as HTMLTextAreaElement).value)).toEqual(request));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(root)}/overview`);
    expect(screen.getByRole("button", {name: "Run optimization"})).toBeDisabled();
    expect(calls.filter(call => call.init?.method === "POST")).toEqual([]);
    await user.click(screen.getByRole("button", {name: "Check tuning support"}));
    await screen.findByText("Policy supported");
    await user.click(screen.getByRole("button", {name: "Run optimization"}));
    await screen.findByText(/New policy execution/);
    expect(JSON.parse(calls.find(call => call.url === "/api/project/optimization/start")!.init!.body!)).toEqual({request, sourceRevision: "sha256:source", expectedProjectRoot: root});
    expect(screen.getByRole("button", {name: "Cancel optimization"})).toBeEnabled();
    unmount();
});

it("V37 Home completed outputs retain downloads, pending controls and host errors before successful Open and Reveal", async () => {
    const user = userEvent.setup();
    const outputPath = "/outputs/server returned artifact";
    const complete: StudioJobView = {...active, id: "completed", operation: "artifact-build", status: "completed", result: {
        summary: "Build completed.", outputs: [{label: "Artifact", path: outputPath, downloadPath: "/retained/download"}],
    }};
    let finish: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    const base = createRoutedFakeFetch({
        ...recoveryRoutes,
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: [complete]}}),
        "/api/home/fs/reveal-path": () => ({ok: true, status: 200, body: {status: "ok"}}),
    });
    const opens: unknown[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/home/fs/open-folder") {
            opens.push(JSON.parse(init!.body!));
            if (opens.length === 1) return Promise.reject(new Error("Host temporarily disconnected"));
            return new Promise(resolve => {
                finish = resolve;
            });
        }
        return base.fetchImpl(url, init);
    };
    const rendered = renderWithProviders(<HomeProjectJobs />, {fetchImpl});
    const card = await screen.findByRole("region", {name: "artifact-build job completed"});
    expect(within(card).getByRole("link", {name: "Download Artifact"})).toHaveAttribute("href", "/retained/download");
    await user.click(within(card).getByRole("button", {name: "Open Artifact"}));
    await screen.findByText("Host temporarily disconnected");
    await user.dblClick(within(card).getByRole("button", {name: "Open Artifact"}));
    expect(opens).toEqual([{path: outputPath}, {path: outputPath}]);
    expect(within(card).getByRole("button", {name: "Open Artifact"})).toBeDisabled();
    expect(within(card).getByRole("button", {name: "Reveal Artifact"})).toBeDisabled();
    expect(within(card).getByRole("link", {name: "Download Artifact"})).toBeEnabled();
    await act(async () => {
        finish?.({ok: true, status: 200, json: () => Promise.resolve({status: "ok"})});
        await Promise.resolve();
    });
    await screen.findByText("Opened job output.");
    await user.click(within(card).getByRole("button", {name: "Reveal Artifact"}));
    await screen.findByText("Revealed job output.");
    expect(base.calls.find(call => call.url === "/api/home/fs/reveal-path")?.init?.body).toBe(JSON.stringify({path: outputPath}));
    rendered.unmount();
});
