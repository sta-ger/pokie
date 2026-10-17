import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {OptimizationPanel} from "../../../../../../cli/studio-client/src/components/project/OptimizationPanel";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {StudioJobView} from "../../../../../../cli/studio-client/src/api/types";
import {optimizationRequest} from "../../../../../v2/fixtures/OptimizationFixture";

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
                <OptimizationPanel projectRoot="/project" />
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
    expect(screen.getByRole("button", {name: "Run exact optimization"})).toBeDisabled();
    await user.click(screen.getByRole("button", {name: "Check tuning support"}));
    await screen.findByText("Finite workflow available");
    await user.click(screen.getByRole("button", {name: "Run exact optimization"}));
    await screen.findByRole("button", {name: "Cancel optimization"});
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
    expect(screen.getByRole("button", {name: "Run exact optimization"})).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Math targets and optimization policy (JSON)"), {target: {value: "{}"}});
    expect(screen.queryByText("Opaque WASM: missing source/build contract")).not.toBeInTheDocument();
});

function panel(fetchImpl: FetchLike, projectRoot = "/project") {
    return <MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><OptimizationPanel projectRoot={projectRoot} /></StudioApiProvider></MantineProvider>;
}
function completedJob(status: StudioJobView["status"] = "completed"): StudioJobView {
    return {id: "saved-job", projectId: "/project", operation: "optimization", conflictKey: "opt", status, createdAt: 1, request: {request: optimizationRequest()}, result: {summary: "Optimization result", detail: {status: "success", diagnostics: [], evidence: {measured: [0.75]}, candidate: {path: "/scratch/candidate"}}}};
}
function response(body: unknown, ok = true) {
    return Promise.resolve({ok, status: ok ? 200 : 409, json: () => Promise.resolve(body)});
}
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
    expect(calls.find((call) => call.url.endsWith("save"))?.body).toEqual({expectedProjectRoot: "/project", jobId: "saved-job", destination: "/output/saved.json"});
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
    await screen.findByText(/Connection to Studio lost/);
    expect(screen.getByRole("button", {name: "Cancel optimization"})).toBeInTheDocument();
});
it("ignores foreign jobs and an old support response after switching Projects", async () => {
    let finishSupport: ((value: Awaited<ReturnType<FetchLike>>) => void) | undefined;
    const fetchImpl: FetchLike = (url) => url.endsWith("support") ? new Promise((resolve) => {
        finishSupport = resolve;
    }) : response({jobs: [completedJob()]});
    const view = render(panel(fetchImpl));
    await screen.findByText("Verdict: success");
    await userEvent.click(screen.getByRole("button", {name: "Check tuning support"}));
    view.rerender(panel(fetchImpl, "/second-project"));
    finishSupport!({ok: true, status: 200, json: () => Promise.resolve({supported: true, reason: "Old Project support", sourceRevision: "identical"})});
    await waitFor(() => expect(screen.queryByText("Old Project support")).not.toBeInTheDocument());
    expect(screen.queryByText("Verdict: success")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Save reviewed candidate"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Run exact optimization"})).toBeDisabled();
});
