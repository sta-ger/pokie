import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {StudioDeploymentRunView, StudioDeploymentStageSummary} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};
const TARGET = {id: "target-1", version: "1.0.0", requirements: {minPokieVersion: "1.0.0"}, capabilities: ["multiMode"]};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: [TARGET]}),
};

function stage(key: StudioDeploymentStageSummary["key"], status: StudioDeploymentStageSummary["status"], issues: StudioDeploymentStageSummary["issues"] = []): StudioDeploymentStageSummary {
    return {key, label: key, status, issues};
}

function requestedPublish(call: FakeCall): boolean {
    return (JSON.parse(call.init?.body ?? "{}") as {publish?: boolean}).publish === true;
}

function runResponse(view: StudioDeploymentRunView) {
    return {ok: true, status: 200, body: view};
}

function baseRunView(overrides: Partial<StudioDeploymentRunView> = {}): StudioDeploymentRunView {
    return {
        targetId: TARGET.id,
        publish: false,
        stages: [],
        descriptorIssues: [],
        compatibilityIssues: [],
        projectionIssues: [],
        artifactIssues: [],
        ...overrides,
    };
}

async function goToDeploymentConfigure(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Deployment"}));
    await user.click(await screen.findByRole("button", {name: "Select"}));
    await screen.findByRole("button", {name: "Check compatibility & preview"});
    await user.type(screen.getByLabelText("Mode name"), "base");
    await user.type(screen.getByLabelText("Outcome library path"), "libs/base.json");
}

describe("ProjectDashboardPage - Deployment & External Adapters workflow", () => {
    it("previews successfully: Select target -> Configure -> Check compatibility -> Preview artifacts", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/deployment/runs": () =>
                runResponse(
                    baseRunView({
                        stages: [
                            stage("descriptor", "ok"),
                            stage("compatibility", "ok"),
                            stage("projection", "ok"),
                            stage("generation", "ok"),
                            stage("artifactValidation", "ok"),
                            stage("diagnostic", "ok"),
                        ],
                        generation: {artifacts: [{relativePath: "base.json", content: "{\"ok\":true}"}], issues: []},
                    }),
                ),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToDeploymentConfigure(user);

        await user.click(screen.getByRole("button", {name: "Check compatibility & preview"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Preview artifacts"}));

        // The artifact-list entry itself, not a bare text match -- "base.json" also appears, always
        // mounted but hidden, inside Advanced details' full run-result JSON dump (see AdvancedDisclosure's
        // own doc comment on why).
        expect(await screen.findByRole("button", {name: "base.json"})).toBeInTheDocument();
        expect(screen.getByText(/Target diagnostic passed/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Continue to Deploy"})).toBeInTheDocument();

        // Raw artifact content and the full stage list stay hidden until Advanced details is opened --
        // the first generated artifact is auto-selected, so its content appears as soon as Advanced opens.
        // The controlled region is always mounted (see AdvancedDisclosure's own doc comment on why),
        // just hidden -- toBeVisible() (not toBeInTheDocument()) is what actually exercises that.
        expect(screen.getByText(/"ok": true/)).not.toBeVisible();
        await user.click(screen.getByText(/Show advanced details/));
        expect(await screen.findByText(/"ok": true/)).toBeVisible();
    });

    it("shows a clear incompatible-target state and blocks proceeding to Preview artifacts", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/deployment/runs": () =>
                runResponse(
                    baseRunView({
                        stages: [
                            stage("descriptor", "ok"),
                            stage("compatibility", "error", [{code: "min-version", severity: "error", message: "Library was built with an older pokie version."}]),
                        ],
                        compatibilityIssues: [{code: "min-version", severity: "error", message: "Library was built with an older pokie version."}],
                    }),
                ),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToDeploymentConfigure(user);
        await user.click(screen.getByRole("button", {name: "Check compatibility & preview"}));

        expect(await screen.findByText("Incompatible with this target")).toBeInTheDocument();
        expect(screen.getByText(/Library was built with an older pokie version/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Preview artifacts"})).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Back to Configure"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Choose a different target"})).toBeInTheDocument();
    });

    it("shows a clear validation-failure state at Preview artifacts and never offers Deploy", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/deployment/runs": () =>
                runResponse(
                    baseRunView({
                        stages: [
                            stage("descriptor", "ok"),
                            stage("compatibility", "ok"),
                            stage("projection", "ok"),
                            stage("generation", "ok"),
                            stage("artifactValidation", "error", [{code: "bad-shape", severity: "error", message: "Artifact is missing relativePath."}]),
                        ],
                        artifactIssues: [{code: "bad-shape", severity: "error", message: "Artifact is missing relativePath."}],
                    }),
                ),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToDeploymentConfigure(user);
        await user.click(screen.getByRole("button", {name: "Check compatibility & preview"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Preview artifacts"}));

        expect(await screen.findByText("Content didn't validate for this target")).toBeInTheDocument();
        // Scoped to the outcome banner itself -- the same message also appears, humanized differently,
        // inside Advanced details' always-mounted-but-hidden raw stage list and JSON dump (see
        // AdvancedDisclosure's own doc comment on why it stays mounted).
        expect(within(screen.getByRole("alert")).getByText(/Artifact is missing relativePath/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Deploy"})).not.toBeInTheDocument();
    });

    it("deploys successfully end-to-end and lands on a clear Review result", async () => {
        const user = userEvent.setup();
        const okStages: StudioDeploymentStageSummary[] = [
            stage("descriptor", "ok"),
            stage("compatibility", "ok"),
            stage("projection", "ok"),
            stage("generation", "ok"),
            stage("artifactValidation", "ok"),
            stage("diagnostic", "ok"),
        ];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/deployment/runs": (call) =>
                requestedPublish(call)
                    ? runResponse(
                        baseRunView({
                            publish: true,
                            stages: [...okStages, stage("delivery", "ok")],
                            generation: {artifacts: [{relativePath: "base.json", content: "{}"}], issues: []},
                            delivery: {delivered: true},
                        }),
                    )
                    : runResponse(
                        baseRunView({
                            stages: okStages,
                            generation: {artifacts: [{relativePath: "base.json", content: "{}"}], issues: []},
                        }),
                    ),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToDeploymentConfigure(user);
        await user.click(screen.getByRole("button", {name: "Check compatibility & preview"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Preview artifacts"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Deploy"}));

        await user.click(screen.getByRole("button", {name: "Deploy"}));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", {name: "Confirm"}));

        expect(await screen.findByText("Deployed successfully")).toBeInTheDocument();
        expect(screen.getByText("Delivered to the target.")).toBeInTheDocument();
    });

    it("shows a clear transport-failure state when publish succeeds up to diagnostic but delivery itself fails", async () => {
        const user = userEvent.setup();
        const okStages: StudioDeploymentStageSummary[] = [
            stage("descriptor", "ok"),
            stage("compatibility", "ok"),
            stage("projection", "ok"),
            stage("generation", "ok"),
            stage("artifactValidation", "ok"),
            stage("diagnostic", "ok"),
        ];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/deployment/runs": (call) =>
                requestedPublish(call)
                    ? runResponse(
                        baseRunView({
                            publish: true,
                            stages: [...okStages, stage("delivery", "error", [{code: "write-failed", severity: "error", message: "EACCES: permission denied writing output."}])],
                            generation: {artifacts: [{relativePath: "base.json", content: "{}"}], issues: []},
                            delivery: {
                                delivered: false,
                                issues: [{code: "write-failed", severity: "error", message: "EACCES: permission denied writing output."}],
                            },
                        }),
                    )
                    : runResponse(
                        baseRunView({
                            stages: okStages,
                            generation: {artifacts: [{relativePath: "base.json", content: "{}"}], issues: []},
                        }),
                    ),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToDeploymentConfigure(user);
        await user.click(screen.getByRole("button", {name: "Check compatibility & preview"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Preview artifacts"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Deploy"}));

        await user.click(screen.getByRole("button", {name: "Deploy"}));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", {name: "Confirm"}));

        expect(await screen.findByText("Target couldn't be reached or written to")).toBeInTheDocument();
        // Scoped to the outcome banner itself -- see the Preview-artifacts test above for why a bare
        // getByText would now match more than once.
        expect(within(screen.getByRole("alert")).getByText(/EACCES: permission denied writing output/)).toBeInTheDocument();
        expect(screen.getByText("Not delivered.")).toBeInTheDocument();
    });

    it("editing a mode after a successful preview invalidates it -- Preview artifacts is unreachable again until re-checked", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/deployment/runs": () =>
                runResponse(
                    baseRunView({
                        stages: [
                            stage("descriptor", "ok"),
                            stage("compatibility", "ok"),
                            stage("projection", "ok"),
                            stage("generation", "ok"),
                            stage("artifactValidation", "ok"),
                            stage("diagnostic", "ok"),
                        ],
                        generation: {artifacts: [{relativePath: "base.json", content: "{}"}], issues: []},
                    }),
                ),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToDeploymentConfigure(user);
        await user.click(screen.getByRole("button", {name: "Check compatibility & preview"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Preview artifacts"}));
        // The artifact-list entry itself, not a bare text match -- "base.json" also appears, always
        // mounted but hidden, inside Advanced details' full run-result JSON dump (see AdvancedDisclosure's
        // own doc comment on why).
        expect(await screen.findByRole("button", {name: "base.json"})).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Back to Configure"}));
        await user.type(screen.getByLabelText("Mode name"), "-edited");

        // The previous run's result is gone -- back on Configure, and Check-compatibility/Preview
        // artifacts/Deploy no longer show the stale, now-invalidated run.
        expect(screen.getByRole("button", {name: "Check compatibility & preview"})).toBeInTheDocument();
        expect(screen.queryByText("base.json")).not.toBeInTheDocument();
    });

    it("clears target/modes/artifacts when the project switches, leaving a brand new Select-target step", async () => {
        const user = userEvent.setup();
        const {fetchImpl: fetchImplA} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/deployment/runs": () =>
                runResponse(
                    baseRunView({
                        stages: [stage("descriptor", "ok"), stage("compatibility", "ok"), stage("projection", "ok"), stage("generation", "ok"), stage("artifactValidation", "ok"), stage("diagnostic", "ok")],
                        generation: {artifacts: [{relativePath: "from-project-a.json", content: "{}"}], issues: []},
                    }),
                ),
        });

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/overview"]});
        await goToDeploymentConfigure(user);
        await user.click(screen.getByRole("button", {name: "Check compatibility & preview"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Preview artifacts"}));
        // The artifact-list entry itself -- see the "base.json" assertion above for why a bare
        // getByText would now match more than once.
        expect(await screen.findByRole("button", {name: "from-project-a.json"})).toBeInTheDocument();

        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Deployment"}));

        // A brand new project's Deployment tab must show no trace of the previous project's target
        // selection, modes, or run result -- targets list is this project's own (empty), and there is
        // nothing to select/preview/deploy carried over.
        expect(await screen.findByText("No deployment targets registered.")).toBeInTheDocument();
        expect(screen.queryByText("from-project-a.json")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Mode name")).not.toBeInTheDocument();
    });

    // hasActiveOperation (the check "Close project" gates on) used to check simulation/replay/runtime
    // but not an in-flight Deployment run -- closing while a Check/Deploy request is still executing
    // gave no warning at all, unlike every other kind of active operation.
    it("warns before closing the project while a Deployment run is still in flight", async () => {
        const user = userEvent.setup();
        let resolveRun: ((response: unknown) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/deployment/runs") {
                return new Promise((resolve) => {
                    resolveRun = resolve;
                });
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route({url, init});
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToDeploymentConfigure(user);
        await user.click(screen.getByRole("button", {name: "Check compatibility & preview"}));

        await user.click(screen.getByRole("button", {name: "Close project"}));
        expect(await screen.findByText(/active simulation, replay, deployment, or running runtime/)).toBeInTheDocument();

        // Cancelling leaves the project open and the run still going.
        await user.click(screen.getByRole("button", {name: "Cancel"}));
        expect(screen.getByRole("heading", {name: "A"})).toBeInTheDocument();

        // Flushes the response so the test doesn't leave a dangling unawaited state update behind --
        // once it lands, the Stepper auto-advances past Configure (see DeploymentTab's own
        // pendingAdvanceStepRef effect), so "Check compatibility & preview" is no longer rendered at all.
        resolveRun?.({ok: true, status: 200, json: () => Promise.resolve(baseRunView({stages: [stage("descriptor", "ok")]}))});
        await waitFor(() => expect(screen.queryByRole("button", {name: "Check compatibility & preview"})).not.toBeInTheDocument());
    });
});
