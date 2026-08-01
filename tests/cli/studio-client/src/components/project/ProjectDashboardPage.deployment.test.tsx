import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const BASE_ROUTES: Record<string, () => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}},
    }),
    "/api/project/inspect": () => ({
        ok: true,
        status: 200,
        body: {packageRoot: "/games/a", valid: true, generated: true, buildInfo: {source: "blueprint.json"}},
    }),
    "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", blueprint: {betModes: [{id: "base"}]}}}),
    "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
    "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
};

function stageResult(label: string) {
    return {
        targetId: "target-1",
        publish: false,
        stages: [{key: "descriptor", label: "Descriptor", status: "ok", issues: []}],
        descriptorIssues: [],
        compatibilityIssues: [],
        projectionIssues: [],
        artifactIssues: [],
        generation: {artifacts: [{relativePath: `${label}.json`, content: "{}"}], issues: []},
    };
}

describe("ProjectDashboardPage - Deployment double-submit / stale-response guard", () => {
    it("ignores a double-click while a run is in flight, and drops a stale response once a newer run completes first", async () => {
        const user = userEvent.setup();
        const runRequests: {resolve: (body: unknown) => void}[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/deployment/targets") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve([{id: "target-1", version: "1.0.0", requirements: {}, capabilities: []}]),
                });
            }
            if (path === "/api/project/deployment/runs") {
                return new Promise((resolve) => {
                    runRequests.push({
                        resolve: (body: unknown) => resolve({ok: true, status: 200, json: () => Promise.resolve(body)}),
                    });
                });
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const result = route();
                return Promise.resolve({ok: result.ok, status: result.status, json: () => Promise.resolve(result.body)});
            }
            return Promise.reject(new Error(`no fake route for ${url} (init: ${JSON.stringify(init)})`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Deployment"}));
        // The only registered target is selected automatically, auto-advancing the stepper straight to
        // Configure -- no artificial Select-target click needed.
        await screen.findByRole("button", {name: "Run deployment preflight"});

        // The project's own sole build mode ("base", see BASE_ROUTES' own inspect/blueprint routes) is
        // auto-selected into the row the moment build-mode discovery resolves -- deployment modes only
        // ever come from the current build, never a hand-typed name. Only the Outcome library path still
        // needs filling in by hand before "Run deployment preflight" is anything but a blocked no-op.
        await waitFor(() => expect(screen.getByRole("combobox", {name: "Mode name"})).toHaveValue("base"));
        await user.type(screen.getByLabelText("Outcome library path"), "base.json");

        await user.click(screen.getByRole("button", {name: "Run deployment preflight"}));
        // A second click while the first request is still in flight must be a silent no-op (the
        // DeploymentRunTracker refuses a concurrent beginRun() while inFlight is true), not a second
        // competing request.
        await user.click(screen.getByRole("button", {name: "Run deployment preflight"}));
        expect(runRequests).toHaveLength(1);

        // Editing a mode's own library path while the run is still in flight invalidates its token
        // (bumping the tracker's revision) without starting a second request -- beginRun() still refuses
        // while inFlight, exactly like the double-click above. The original request is now stale before it
        // has even resolved.
        await user.type(screen.getByLabelText("Outcome library path"), "-edited");
        expect(runRequests).toHaveLength(1);

        // The now-stale response arrives -- isCurrent(token) must reject it, so nothing renders, and the
        // stepper never advances away from Configure (the pending advance-to-Check-compatibility step is
        // only consumed by a genuinely new, non-stale runResult -- see DeploymentTab's own doc comment).
        runRequests[0].resolve(stageResult("first"));
        await waitFor(() => {
            expect(screen.queryByText("first.json")).not.toBeInTheDocument();
        });
        expect(screen.getByRole("button", {name: "Run deployment preflight"})).toBeInTheDocument();

        // A fresh run started *after* the stale one resolved works normally, auto-advancing to
        // Check-compatibility once it lands.
        await user.click(screen.getByRole("button", {name: "Run deployment preflight"}));
        await waitFor(() => expect(runRequests).toHaveLength(2));
        runRequests[1].resolve(stageResult("second"));
        await user.click(await screen.findByRole("button", {name: "Continue to Preview artifacts"}));
        await waitFor(() => expect(screen.getAllByText("second.json").length).toBeGreaterThan(0));
    });
});
