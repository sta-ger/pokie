import {MantineProvider} from "@mantine/core";
import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {OptimizationPanel} from "../../../../../../cli/studio-client/src/components/project/OptimizationPanel";
import {StudioApiProvider, useStudioApi} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import {useProjectJobs} from "../../../../../../cli/studio-client/src/hooks/useProjectJobs";
import {JobCard} from "../../../../../../cli/studio-client/src/components/common/JobCard";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {StudioJobView} from "../../../../../../cli/studio-client/src/api/types";
import {optimizationRequest} from "../../../../../v2/fixtures/OptimizationFixture";

function ObservedPanel({projectRoot, onApplied, showOperations = false}: {
    projectRoot: string; onApplied?: () => void; showOperations?: boolean;
}) {
    const jobs = useProjectJobs(useStudioApi(), projectRoot, 0);
    return <>
        <OptimizationPanel projectRoot={projectRoot} jobs={jobs} onApplied={onApplied} />
        {showOperations && jobs.jobs.map(job => <JobCard key={job.id} job={job} onCancel={jobs.cancel} cancellationPending={jobs.pendingIds.includes(job.id)} />)}
    </>;
}

function setup(supported = true) {
    const calls: {url: string; body?: string}[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        calls.push({url, body: init?.body as string | undefined});
        let body: unknown = {jobs: []};
        if (url.endsWith("support")) body = {
            supported,
            reason: supported ? "Finite workflow available" : "Opaque WASM: missing source/build contract",
            sourceRevision: "sha256:source",
            writable: ["/paytable/A/2"],
        };
        if (url.endsWith("start")) body = {
            job: {
                id: "opt1",
                operation: "optimization",
                status: "running",
                createdAt: 1,
                projectId: "/project",
                request: {},
                conflictKey: "opt",
            },
        };
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
    };
    const view = render(
        <MantineProvider>
            <StudioApiProvider fetchImpl={fetchImpl}>
                <ObservedPanel projectRoot="/project" />
            </StudioApiProvider>
        </MantineProvider>,
    );
    fireEvent.change(screen.getByLabelText("Math targets and optimization policy (JSON)"), {
        target: {value: JSON.stringify(optimizationRequest())},
    });
    return {calls, view};
}
it("checks real policy validation, submits reviewed revision, and exposes cancellation", async () => {
    const {calls} = setup();
    const user = userEvent.setup();
    expect(screen.getByRole("button", {name: "Run optimization"})).toBeDisabled();
    await user.click(screen.getByRole("button", {name: "Check tuning support"}));
    await screen.findByText("Finite workflow available");
    await user.click(screen.getByRole("button", {name: "Run optimization"}));
    await screen.findByRole("button", {name: "Cancel optimization"});
    expect(screen.getByRole("status")).toHaveTextContent("Preparing optimization; waiting for execution progress.");
    expect(screen.queryByText(/unknown work/)).not.toBeInTheDocument();
    expect(JSON.parse(calls.find((call) => call.url.endsWith("start"))!.body!)).toMatchObject({
        sourceRevision: "sha256:source",
        expectedProjectRoot: "/project",
        request: {policy: {budget: 3}},
    });
});
it("preserves invalid inputs for correction and refuses to submit a zero budget", async () => {
    const {calls} = setup();
    const request = optimizationRequest();
    request.policy.budget = 0;
    const text = JSON.stringify(request);
    fireEvent.change(screen.getByLabelText("Math targets and optimization policy (JSON)"), {target: {value: text}});
    await userEvent.click(screen.getByRole("button", {name: "Check tuning support"}));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("policy/budget"));
    expect(screen.getByLabelText("Math targets and optimization policy (JSON)")).toHaveValue(text);
    expect(calls.some((call) => call.url.endsWith("support"))).toBe(false);
});
it("shows unsupported source reasons and invalidates support after policy edits", async () => {
    setup(false);
    await userEvent.click(screen.getByRole("button", {name: "Check tuning support"}));
    await screen.findByText("Opaque WASM: missing source/build contract");
    expect(screen.getByRole("button", {name: "Run optimization"})).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Math targets and optimization policy (JSON)"), {target: {value: "{}"}});
    expect(screen.queryByText("Opaque WASM: missing source/build contract")).not.toBeInTheDocument();
});

function panel(fetchImpl: FetchLike, projectRoot = "/project") {
    return <MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><ObservedPanel projectRoot={projectRoot} /></StudioApiProvider></MantineProvider>;
}
function completedJob(status: StudioJobView["status"] = "completed"): StudioJobView {
    return {id: "saved-job", projectId: "/project", operation: "optimization", conflictKey: "opt", status, createdAt: 1, request: {request: optimizationRequest()}, result: {summary: "Optimization result", detail: {status: "success", diagnostics: [], evidence: {measured: [0.75]}, candidate: {path: "/scratch/candidate"}}}};
}
function response(body: unknown, ok = true) {
    return Promise.resolve({ok, status: ok ? 200 : 409, json: () => Promise.resolve(body)});
}

it.each(["attained", "inconclusive", "exhausted"])("keeps a completed job separate from mathematical %s and labels candidate saves", async verdict => {
    const job = completedJob();
    job.result!.detail = {...job.result!.detail, status: verdict};
    render(panel(() => response({jobs: [job]})));
    await screen.findByText(`Verdict: ${verdict}`);
    expect(await screen.findByLabelText("Candidate destination")).toBeInTheDocument();
    if (verdict !== "attained") expect(screen.getByText(/Best-so-far candidate; targets are not approved/)).toBeInTheDocument();
});
it("reattaches terminal evidence after reload and saves the reviewed candidate with project identity", async () => {
    const calls: {url: string; body?: unknown}[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        calls.push({url, body: init?.body ? JSON.parse(init.body as string) : undefined});
        return response(url.endsWith("save") ? {outputPath: "/output/saved.json"} : {jobs: [completedJob()]});
    };
    const view = render(panel(fetchImpl));
    await screen.findByText("Verdict: success");
    expect(screen.getByText(/"measured"/)).toHaveTextContent("0.75");
    view.unmount();
    render(panel(fetchImpl));
    await screen.findByText("Verdict: success");
    fireEvent.change(screen.getByLabelText("Candidate destination"), {target: {value: "/output/saved.json"}});
    await userEvent.click(screen.getByRole("button", {name: "Save reviewed candidate"}));
    await screen.findByText("Candidate saved: /output/saved.json");
    expect(calls.find((call) => call.url.endsWith("save"))?.body).toEqual({expectedProjectRoot: "/project", jobId: "saved-job", request: optimizationRequest(), destination: "/output/saved.json"});
});
it("renders failure diagnostics, evidence, job error and recovery guidance together", async () => {
    const job = completedJob("recovery-required");
    job.result!.detail = {status: "failure", diagnostics: [{path: "cleanup", message: "Runtime cleanup failed"}], evidence: {evaluated: 1}};
    job.error = "Evaluation failed while closing runtime";
    job.recovery = {action: "retry", reason: "Inspect retained scratch before retrying"};
    render(panel(() => response({jobs: [job]})));
    await screen.findByText("Verdict: failure");
    expect(screen.getByText(/cleanup: Runtime cleanup failed/)).toBeInTheDocument();
    expect(screen.getByText(/"evaluated"/)).toBeInTheDocument();
    expect(screen.getByText(job.error)).toBeInTheDocument();
    expect(screen.getByText(/Recovery \(retry\): Inspect retained scratch before retrying/)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Save reviewed candidate"})).not.toBeInTheDocument();
});
it("retains terminal evidence when saving fails with a stale or unavailable candidate", async () => {
    render(panel((url) => response(url.endsWith("save") ? {error: "Candidate unavailable. Optimize again."} : {jobs: [completedJob()]}, !url.endsWith("save"))));
    await screen.findByText("Verdict: success");
    fireEvent.change(screen.getByLabelText("Candidate destination"), {target: {value: "/output/retry.json"}});
    await userEvent.click(screen.getByRole("button", {name: "Save reviewed candidate"}));
    await screen.findByText("Candidate unavailable. Optimize again.");
    expect(screen.getByText("Verdict: success")).toBeInTheDocument();
    expect(screen.getByLabelText("Candidate destination")).toHaveValue("/output/retry.json");
});
it("shows job observation and cancellation errors without losing known work", async () => {
    let connectionFailed = false;
    const job = completedJob("running");
    job.result = undefined;
    const fetchImpl: FetchLike = (url) => {
        if (url.endsWith("cancel")) return response({error: "Cancel transport failed"}, false);
        if (connectionFailed) return Promise.reject(new Error("Network disconnected"));
        return response(url.endsWith("jobs") ? {jobs: [job]} : {job});
    };
    render(panel(fetchImpl));
    await screen.findByRole("button", {name: "Cancel optimization"});
    await userEvent.click(screen.getByRole("button", {name: "Cancel optimization"}));
    await screen.findByText(/Could not cancel job saved-job/);
    connectionFailed = true;
    await screen.findByText(/Network disconnected/);
    expect(screen.getByRole("button", {name: "Cancel optimization"})).toBeInTheDocument();
});
it("ignores foreign jobs and an old support response after switching Projects", async () => {
    let finishSupport: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    const fetchImpl: FetchLike = (url) => url.endsWith("support") ? new Promise((resolve) => {
        finishSupport = resolve;
    }) : response({projectRoot: "/project", jobs: [completedJob()]});
    const view = render(panel(fetchImpl));
    await screen.findByText("Verdict: success");
    await userEvent.click(screen.getByRole("button", {name: "Check tuning support"}));
    view.rerender(panel(fetchImpl, "/second-project"));
    finishSupport!({ok: true, status: 200, json: () => Promise.resolve({supported: true, reason: "Old Project support", sourceRevision: "identical"})});
    await waitFor(() => expect(screen.queryByText("Old Project support")).not.toBeInTheDocument());
    expect(screen.queryByText("Verdict: success")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Save reviewed candidate"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Run optimization"})).toBeDisabled();
});

it("renders held-out estimates, CI, population, constraints and parameter changes, and sends the reviewed policy on apply", async () => {
    const request = optimizationRequest();
    request.policy.strategy = "seeded-search-v1";
    request.policy.sampling = {confidence: 0.95, searchSamples: 100, searchBudget: 100, assessmentSamples: 1000, minSamples: 100, minEventCount: 5, chunkSize: 100, workers: 1};
    const job = completedJob();
    job.request.request = request;
    job.result!.detail = {status: "attained", diagnostics: [], candidate: {type: "blueprint"}, evidence: {
        request, strategy: "seeded-search-v1", sourceRevision: "sha256:reviewed", measured: [99],
        numericRepresentation: "IEEE-754 binary64 moments; native integer weights preserved",
        constraintChecks: ["locked subtrees", "fixed weights/counts/sums"],
        diff: [{path: "/paytable/A/2", before: 2, after: 3}],
        stochastic: {assessment: {targets: [{estimate: 0.74, observations: 1000, confidence: {low: 0.71, high: 0.77}, verdict: "attained", reason: "contained"}]}},
    }};
    const calls: unknown[] = [];
    const applied = jest.fn();
    const fetchImpl: FetchLike = (url, init) => {
        if (url.endsWith("apply")) {
            calls.push(JSON.parse(init!.body as string));
            return response({outputPath: "/project"});
        }
        return response({jobs: [job]});
    };
    render(<MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><ObservedPanel projectRoot="/project" onApplied={applied} /></StudioApiProvider></MantineProvider>);
    const comparison = await screen.findByRole("table", {name: "Target comparison"});
    expect(comparison).toHaveTextContent("rtp");
    expect(comparison).toHaveTextContent("ratio");
    expect(comparison).toHaveTextContent("logical-round");
    expect(comparison).toHaveTextContent("0.75");
    expect(comparison).toHaveTextContent("0.74 held-out estimate");
    expect(comparison).toHaveTextContent("[0.71, 0.77]; confidence 0.95; 1000 observations");
    expect(comparison).not.toHaveTextContent("99");
    expect(screen.getByRole("table", {name: "Parameter changes"})).toHaveTextContent("/paytable/A/2");
    expect(screen.getByText(/Constraint checks:/)).toHaveTextContent("locked subtrees");
    expect(screen.getByText(/Locks:/)).toHaveTextContent("/reelStrips");
    await userEvent.click(screen.getByRole("button", {name: "Apply reviewed changes to source"}));
    expect(calls[0]).toMatchObject({request, jobId: job.id, expectedProjectRoot: "/project"});
    expect(applied).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", {name: "Apply reviewed changes to source"})).not.toBeInTheDocument();
});

it("remounts an active canonical job through an alias without submitting another search", async () => {
    const job = completedJob("running");
    job.projectId = "/canonical/project";
    job.result = undefined;
    const calls: string[] = [];
    const fetchImpl: FetchLike = url => {
        calls.push(url);
        return response({projectRoot: "/alias/project", jobs: [job]});
    };
    const first = render(panel(fetchImpl, "/alias/project"));
    await screen.findByRole("button", {name: "Cancel optimization"});
    first.unmount();
    render(panel(fetchImpl, "/alias/project"));
    await screen.findByRole("button", {name: "Cancel optimization"});
    expect(calls.some(url => url.endsWith("start"))).toBe(false);
});

it("keeps consumed authored preview actions hidden after reload while retaining its verdict", async () => {
    const job = completedJob();
    job.result!.provenance = {authoredApply: {path: "/project"}};
    render(panel(() => response({jobs: [job]})));
    await screen.findByText("Verdict: success");
    expect(screen.getByText(/Authored changes applied/)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Apply reviewed changes to source"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Save reviewed candidate"})).not.toBeInTheDocument();
});

it.each(["completed", "failed", "cancelled", "recovery-required"] as const)(
    "V35 optimizer lifecycle shares %s with its operation card and permits a fresh retry",
    async status => {
        // Retained transcript observation 45: running: 3 / 100 candidates Finite search
        // alongside optimization · Completed / Optimization infeasible. These are
        // source-aware transport regressions, not independent first-contact evidence.
        let current: StudioJobView | undefined;
        let finishDetail: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
        let discoveries = 0;
        let starts = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url.endsWith("/support")) return response({supported: true, reason: "Finite workflow available", sourceRevision: "sha256:source"});
            if (url.endsWith("/start")) {
                const submitted = JSON.parse(init!.body as string);
                current = {
                    id: `opt-${++starts}`, projectId: "/project", operation: "optimization", conflictKey: "opt",
                    createdAt: starts, status: "running", request: {request: submitted.request},
                    progress: {current: 3, total: 100, unit: "candidates", stage: "Finite search"},
                };
                return response({job: current});
            }
            if (url === "/api/project/jobs") {
                discoveries++;
                return response({jobs: current ? [current] : []});
            }
            if (url === "/api/project/jobs/opt-1") return new Promise(resolve => {
                finishDetail = resolve;
            });
            throw new Error(`Unexpected request: ${url}`);
        };
        const view = render(<MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><ObservedPanel projectRoot="/project" showOperations /></StudioApiProvider></MantineProvider>);
        await waitFor(() => expect(discoveries).toBe(1));
        await userEvent.click(screen.getByRole("button", {name: "Check tuning support"}));
        await screen.findByText("Finite workflow available");
        await userEvent.click(screen.getByRole("button", {name: "Run optimization"}));
        await screen.findByText("running: 3 / 100 candidates Finite search");
        expect(screen.getByRole("button", {name: "Cancel optimization"})).toBeEnabled();
        expect(screen.getByLabelText("Math targets and optimization policy (JSON)")).toBeDisabled();
        await waitFor(() => expect(finishDetail).toBeDefined());
        const verdict = {completed: "infeasible", cancelled: "cancelled", failed: "failure", "recovery-required": "failure"}[status];
        const terminal = {
            ...current!, status,
            result: {summary: `Optimization ${verdict}`, detail: {status: verdict, diagnostics: []}},
            ...(status === "failed" ? {error: "Evaluation failed"} : {}),
            ...(status === "recovery-required" ? {recovery: {action: "retry" as const, reason: "Inspect retained scratch"}} : {}),
        };
        const contradictions: string[] = [];
        const observer = new MutationObserver(() => {
            if (view.container.textContent?.includes(`Optimization ${verdict}`) &&
                (view.container.textContent.includes("running: 3 / 100") || screen.queryByRole("button", {name: "Cancel optimization"}))) {
                contradictions.push(view.container.textContent);
            }
        });
        observer.observe(view.container, {subtree: true, childList: true, characterData: true});
        try {
            await act(async () => {
                finishDetail!(await response(terminal));
            });
            expect(screen.getByText(`Optimization ${verdict}`)).toBeInTheDocument();
            expect(screen.getByText(`Verdict: ${verdict}`)).toBeInTheDocument();
            expect(screen.queryByText(/running: 3 \/ 100/)).not.toBeInTheDocument();
            expect(screen.queryByRole("button", {name: "Cancel optimization"})).not.toBeInTheDocument();
            expect(screen.getByLabelText("Math targets and optimization policy (JSON)")).toBeEnabled();
            expect(screen.queryByRole("button", {name: "Apply reviewed changes to source"})).not.toBeInTheDocument();
            expect(screen.queryByRole("button", {name: "Save reviewed candidate"})).not.toBeInTheDocument();
            expect(contradictions).toEqual([]);
        } finally {
            observer.disconnect();
        }
        // Discovery still reports the stale running snapshot; the shared durable
        // observer must retain the terminal while a new execution is submitted.
        await userEvent.click(screen.getByRole("button", {name: "Run optimization"}));
        await screen.findByText("running: 3 / 100 candidates Finite search");
        expect(starts).toBe(2);
        expect(screen.queryByText(`Verdict: ${verdict}`)).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Cancel optimization"})).toBeEnabled();
        view.unmount();
    },
);


it("V35 optimizer progress renders raw work, indeterminate materialization and terminal reviewed Apply through one durable observer", async () => {
    const running = completedJob("running");
    running.result = undefined;
    running.progress = {stage: "Enumerating reel stops", current: "46656", total: "46656", unit: "raw draws", message: "0 evaluated; 0 rejected"};
    let detail: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    let applies = 0;
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/jobs") return response({jobs: [running]});
        if (url === "/api/project/jobs/saved-job") return new Promise(resolve => {
            detail = resolve;
        });
        if (url.endsWith("/apply")) {
            expect(JSON.parse(init!.body as string)).toMatchObject({jobId: "saved-job", request: optimizationRequest()});
            applies++;
            return response({outputPath: "/project"});
        }
        throw new Error(`Unexpected request: ${url}`);
    };
    const applied = jest.fn();
    const view = render(<MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><ObservedPanel projectRoot="/project" onApplied={applied} showOperations /></StudioApiProvider></MantineProvider>);
    await screen.findByText("running: 46656 / 46656 raw draws Enumerating reel stops · 0 evaluated; 0 rejected");
    expect(screen.queryByRole("button", {name: "Apply reviewed changes to source"})).not.toBeInTheDocument();
    await waitFor(() => expect(detail).toBeDefined());
    const resolveMaterialization = detail!;
    detail = undefined;
    await act(async () => {
        resolveMaterialization(await response({...running, progress: {stage: "Materializing outcomes", current: "11", total: "indeterminate", unit: "outcomes", message: "0 evaluated; 0 rejected"}}));
    });
    await screen.findByText("running: 11 / indeterminate outcomes Materializing outcomes · 0 evaluated; 0 rejected");
    expect(screen.getByRole("button", {name: "Cancel optimization"})).toBeEnabled();
    expect(screen.queryByRole("button", {name: "Apply reviewed changes to source"})).not.toBeInTheDocument();
    await waitFor(() => expect(detail).toBeDefined());
    const terminal = completedJob();
    terminal.result!.detail = {...terminal.result!.detail, candidate: {type: "blueprint", path: "/scratch/candidate"}};
    await act(async () => {
        detail!(await response(terminal));
    });
    await screen.findByText("Verdict: success");
    expect(screen.queryByRole("button", {name: "Cancel optimization"})).not.toBeInTheDocument();
    expect(screen.queryByText(/running: /)).not.toBeInTheDocument();
    expect(screen.getByText("completed: No execution progress recorded.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name: "Apply reviewed changes to source"}));
    await screen.findByText(/Authored changes applied/);
    expect(applies).toBe(1);
    expect(applied).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", {name: "Apply reviewed changes to source"})).not.toBeInTheDocument();
    view.unmount();
});
