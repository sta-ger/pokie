import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {OptimizationPanel} from "../../../../../../cli/studio-client/src/components/project/OptimizationPanel";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
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
