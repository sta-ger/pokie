import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};

const BASE_ROUTES: Record<string, () => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME, type: "blueprint", capabilities: ["blueprint.build"]}}),
    "/api/project/inspect": () => ({
        ok: true,
        status: 200,
        body: {packageRoot: "/games/a", valid: true, generated: true, buildInfo: {source: "blueprint.json"}},
    }),
    "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", blueprint: {betModes: [{id: "base"}]}}}),
    "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}}),
    "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
};

function fetchImplFrom(routes: Record<string, () => {ok: boolean; status: number; body: unknown}>): FetchLike {
    return (url, init) => {
        const [path] = url.split("?");
        const route = routes[path];
        if (route) {
            const result = route();
            return Promise.resolve({ok: result.ok, status: result.status, json: () => Promise.resolve(result.body)});
        }
        return Promise.reject(new Error(`no fake route for ${url} (init: ${JSON.stringify(init)})`));
    };
}

// Deployment has no nav entry of its own any more (it's only reachable through Build/Export's own
// target-selection shell, see ProjectDashboardPage.tsx's own ALL_PROJECT_TABS doc comment) -- these
// tests exercise the Deployment workflow itself, so they deep-link straight to it, exactly like
// ProjectDashboardPage.deploymentWorkflow.test.tsx already does, rather than reproducing Build/Export's
// own target-picking UI here.
async function openDeploymentTab(): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
}

describe("ProjectDashboardPage - Deployment target selection", () => {
    it("empty registry: gives a way forward instead of a dead end", async () => {
        const user = userEvent.setup();
        renderRoutedApp({
            fetchImpl: fetchImplFrom({...BASE_ROUTES, "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []})}),
            initialEntries: ["/project/deployment"],
        });
        await openDeploymentTab();

        expect(await screen.findByText("No deployment targets registered.")).toBeInTheDocument();
        expect(screen.getByText(/docs\/external-adapter-sdk\.md/)).toBeInTheDocument();
        expect(screen.getByText(/local-json-example/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Open Stake Engine Export instead"}));
        expect(await screen.findByRole("button", {name: "Continue to Preview"})).toBeInTheDocument();
    });

    it("lone target: auto-selects it, skips Select-target, and never offers Change target (nothing to change to)", async () => {
        const user = userEvent.setup();
        renderRoutedApp({
            fetchImpl: fetchImplFrom({
                ...BASE_ROUTES,
                "/api/project/deployment/targets": () => ({
                    ok: true,
                    status: 200,
                    body: [{id: "local-json-example", version: "1.0.0", requirements: {}, capabilities: []}],
                }),
            }),
            initialEntries: ["/project/deployment"],
        });
        await openDeploymentTab();

        // Lands straight on Configure -- no artificial Select-target click was ever needed.
        expect(await screen.findByRole("button", {name: "Run deployment preflight"})).toBeInTheDocument();

        // Navigating back to Select-target (still always reachable, e.g. to double check what's
        // selected) shows the compact summary, explicit about being auto-selected, with no Change
        // target button -- there is nothing else registered to change to.
        await user.click(screen.getByRole("button", {name: /Select target/}));
        expect(await screen.findByText("Automatically selected -- the only target registered")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Change target"})).not.toBeInTheDocument();
        // The SDK's own local-json-example target is explicit about writing local JSON only.
        expect(screen.getByText(/Writes local JSON artifacts/)).toBeInTheDocument();
        expect(screen.getByText(/nothing is published externally/)).toBeInTheDocument();
    });

    it("multiple targets: compares them via a picker and commits with Continue with target, offering Change target afterward", async () => {
        const user = userEvent.setup();
        const targetOne = {id: "target-one", version: "1.0.0", requirements: {minPokieVersion: "1.0.0"}, capabilities: []};
        const targetTwo = {id: "target-two", version: "2.0.0", requirements: {}, capabilities: ["multiMode"]};
        renderRoutedApp({
            fetchImpl: fetchImplFrom({
                ...BASE_ROUTES,
                "/api/project/deployment/targets": () => ({ok: true, status: 200, body: [targetOne, targetTwo]}),
            }),
            initialEntries: ["/project/deployment"],
        });
        await openDeploymentTab();

        // Nothing is auto-selected when there is a real choice to make -- both targets' own detail is
        // shown side by side for comparison, and there is no per-card "Select" button, only a single
        // Continue-with-target action gated on a pick.
        await screen.findByText("Choose a deployment target");
        expect(screen.getByText("target-one (v1.0.0)")).toBeInTheDocument();
        expect(screen.getByText("target-two (v2.0.0)")).toBeInTheDocument();
        const continueButton = screen.getByRole("button", {name: "Continue with target"});
        expect(continueButton).toBeDisabled();

        await user.click(screen.getByRole("radio", {name: /target-two/}));
        expect(continueButton).not.toBeDisabled();
        await user.click(continueButton);

        expect(await screen.findByRole("button", {name: "Run deployment preflight"})).toBeInTheDocument();

        // Going back to Select-target now shows the compact summary plus a Change target button, since
        // target-one is still a real alternative.
        await user.click(screen.getByRole("button", {name: /Select target/}));
        expect(await screen.findByText("Selected target")).toBeInTheDocument();
        expect(screen.getByText("target-two (v2.0.0)")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Change target"})).toBeInTheDocument();
    });

    it("changing target resets the stale run result but keeps the modes the user already filled in", async () => {
        const user = userEvent.setup();
        const targetOne = {id: "target-one", version: "1.0.0", requirements: {}, capabilities: []};
        const targetTwo = {id: "target-two", version: "1.0.0", requirements: {}, capabilities: []};
        renderRoutedApp({
            fetchImpl: fetchImplFrom({
                ...BASE_ROUTES,
                "/api/project/deployment/targets": () => ({ok: true, status: 200, body: [targetOne, targetTwo]}),
                "/api/project/deployment/runs": () =>
                    ({
                        ok: true,
                        status: 200,
                        body: {
                            targetId: "target-one",
                            publish: false,
                            stages: [
                                {key: "descriptor", label: "descriptor", status: "ok", issues: []},
                                {key: "compatibility", label: "compatibility", status: "ok", issues: []},
                                {key: "projection", label: "projection", status: "ok", issues: []},
                                {key: "generation", label: "generation", status: "ok", issues: []},
                                {key: "artifactValidation", label: "artifactValidation", status: "ok", issues: []},
                                {key: "diagnostic", label: "diagnostic", status: "ok", issues: []},
                            ],
                            descriptorIssues: [],
                            compatibilityIssues: [],
                            projectionIssues: [],
                            artifactIssues: [],
                            generation: {artifacts: [{relativePath: "base.json", content: "{}"}], issues: []},
                        },
                    }),
            }),
            initialEntries: ["/project/deployment"],
        });
        await openDeploymentTab();

        await screen.findByText("Choose a deployment target");
        await user.click(screen.getByRole("radio", {name: /target-one/}));
        await user.click(screen.getByRole("button", {name: "Continue with target"}));

        // The project's own sole build mode ("base") auto-selects into the row -- deployment modes only
        // ever come from the current build, never a hand-typed name.
        await waitFor(() => expect(screen.getByRole("combobox", {name: "Mode name"})).toHaveValue("base"));
        await user.type(screen.getByLabelText("Outcome library path"), "libs/base.json");
        await user.click(screen.getByRole("button", {name: "Run deployment preflight"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Preview artifacts"}));
        expect(await screen.findByRole("button", {name: "base.json"})).toBeInTheDocument();

        // Change target -- the run result computed against target-one is no longer accurate for
        // target-two and must be gone, but the mode fields the user already typed are still useful
        // (a library path isn't target-specific) and must survive.
        await user.click(screen.getByRole("button", {name: /Select target/}));
        await user.click(screen.getByRole("button", {name: "Change target"}));
        await user.click(screen.getByRole("radio", {name: /target-two/}));
        await user.click(screen.getByRole("button", {name: "Continue with target"}));

        expect(await screen.findByRole("button", {name: "Run deployment preflight"})).toBeInTheDocument();
        expect(screen.queryByText("base.json")).not.toBeInTheDocument();
        expect(screen.getByRole("combobox", {name: "Mode name"})).toHaveValue("base");
        expect(screen.getByLabelText("Outcome library path")).toHaveValue("libs/base.json");
    });
});
