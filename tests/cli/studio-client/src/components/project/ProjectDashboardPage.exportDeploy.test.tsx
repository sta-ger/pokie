import {screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const BASE_ROUTES: Record<string, () => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}, type: "blueprint", capabilities: ["blueprint.build"]},
    }),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    // The External Adapter SDK's own local-json-example demo target -- registered by default, but never
    // shown as a Build/Export card (see ExportDeployTargets.ts's own doc comment).
    "/api/project/deployment/targets": () => ({
        ok: true,
        status: 200,
        body: [{id: "local-json-example", version: "1.0.0", requirements: {}, capabilities: ["multiMode"]}],
    }),
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

describe("ProjectDashboardPage - Export & Deploy shell", () => {
    it("classifies Outcome libraries and Stake Engine Export as builder cards, never surfaces the local-json-example demo target, and falls back to the remote-deployment placeholder when nothing else is registered", async () => {
        const user = userEvent.setup();
        renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));

        const outcomeLibrarySection = screen.getByText("Outcome libraries").closest("fieldset") as HTMLElement;
        expect(within(outcomeLibrarySection).getByText("Outcome library generator")).toBeInTheDocument();

        const staticExportSection = screen.getByText("Static export").closest("fieldset") as HTMLElement;
        expect(within(staticExportSection).getByText("Stake Engine Export")).toBeInTheDocument();

        expect(screen.queryByText("External Adapter: local-json-example")).not.toBeInTheDocument();

        const remoteSection = screen.getByText("Remote deployment").closest("fieldset") as HTMLElement;
        expect(await within(remoteSection).findByText("Remote deployment (none registered yet)")).toBeInTheDocument();
    });

    it("runs a registered remote adapter target's own compatibility check right here (no hand-off to the Deployment tab), offering Publish once it comes back clean", async () => {
        const user = userEvent.setup();
        const routes = {
            ...BASE_ROUTES,
            "/api/project/deployment/targets": () => ({
                ok: true,
                status: 200,
                body: [{id: "acme-rgs-v2", version: "0.1.0", requirements: {}, capabilities: []}],
            }),
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}}),
            "/api/project/deployment/runs": () => ({
                ok: true,
                status: 200,
                body: {
                    targetId: "acme-rgs-v2",
                    publish: false,
                    stages: [],
                    descriptorIssues: [],
                    compatibilityIssues: [],
                    projectionIssues: [],
                    generation: {artifacts: [], issues: []},
                    artifactIssues: [],
                    diagnostic: {ok: true, checks: []},
                    delivery: {delivered: false},
                },
            }),
        };
        renderRoutedApp({fetchImpl: fetchImplFrom(routes), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await screen.findByText("External Adapter: acme-rgs-v2");
        await user.click(screen.getByRole("button", {name: "Check compatibility"}));

        // Runs the same runDeployment(publish: false) pipeline the Deployment tab itself drives, right
        // here -- never navigating away to a separate Stepper-driven workflow first.
        expect(await screen.findByText("Compatible -- ready to publish.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Publish"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Preview artifacts"})).not.toBeInTheDocument();
    });

    it("runs the Stake Engine Export right here (no hand-off to the Stake Engine Export tab) once a canonical outcome library is available", async () => {
        const user = userEvent.setup();
        const routes = {
            ...BASE_ROUTES,
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    bundleDir: "outcomelibrary",
                    buildStatus: "compatible",
                    game: {id: "a", name: "A", version: "1.0.0"},
                    currentGame: {id: "a", name: "A", version: "1.0.0"},
                    artifactPokieVersion: "1.0.0",
                    currentPokieVersion: "1.0.0",
                    generatedAt: "2026-01-01T00:00:00.000Z",
                    modes: [
                        {
                            modeName: "base",
                            libraryId: "a-base",
                            bundleDir: "outcomelibrary",
                            buildStatus: "compatible",
                            outcomeCount: 500,
                            totalWeight: 1000,
                            rtp: 0.95,
                            hash: "sha256:library",
                        },
                    ],
                },
            }),
            "/api/project/stakeengine/export": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", outDir: "stakeengine", files: ["index.json"], manifest: {}, warnings: []},
            }),
        };
        renderRoutedApp({fetchImpl: fetchImplFrom(routes), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await user.click(await screen.findByRole("button", {name: "Run Stake Engine Export (base)"}));

        expect(await screen.findByText("Exported 1 file(s) to stakeengine.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Open output folder"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Preview"})).not.toBeInTheDocument();
    });

    it("runs the outcome-library generation right here (no hand-off to the Outcome Libraries tab) when its own card is chosen", async () => {
        const user = userEvent.setup();
        const routes = {
            ...BASE_ROUTES,
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: {status: "ok", modeIds: ["base"]}}),
            "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}}),
            "/api/project/outcome-libraries/generate": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    bundleDir: "outcomelibrary",
                    files: ["manifest.json"],
                    warnings: [],
                    mode: {modeName: "base", libraryId: "a-base", hash: "sha256:library", outcomeCount: 500, totalWeight: 1000, rtp: 0.95},
                    generator: {algorithm: "exact", strategy: "exact", pokieVersion: "1.0.0"},
                    coverage: 1,
                    selector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"},
                },
            }),
        };
        renderRoutedApp({fetchImpl: fetchImplFrom(routes), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Build/Export"}));
        await user.click(await screen.findByRole("button", {name: "Generate outcome library (base)"}));

        expect(await screen.findByText(/Generated 500 outcomes for mode "base" \(RTP 95\.00%\) into outcomelibrary\./)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Open output folder"})).toBeInTheDocument();
        expect(screen.queryByLabelText("Mode")).not.toBeInTheDocument();
    });

    it("redirects the legacy /project/deployment, /project/stakeEngineExport, and /project/outcomeLibraries routes into Build/Export with migration guidance, never mounting their own old workflows", async () => {
        renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/deployment"]});
        await screen.findByRole("heading", {name: "A"});
        expect(screen.getByText("Deployment has moved into Build/Export")).toBeInTheDocument();
        expect(await screen.findByText("Outcome library generator")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Run deployment preflight"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Deployment"})).not.toBeInTheDocument();

        renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/stakeEngineExport"]});
        await screen.findByText("Stake Engine Export has moved into Build/Export");
        expect(screen.queryByText("Output directory")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Stake Engine Export"})).not.toBeInTheDocument();

        renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/outcomeLibraries"]});
        await screen.findByText("Outcome Libraries has moved into Build/Export");
        expect(screen.queryByLabelText("Mode")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Analysis"})).not.toBeInTheDocument();
    });

    it("shows a subject-specific recovery message, never the raw backend text, when the deployment targets list fails to load", async () => {
        renderRoutedApp({
            fetchImpl: fetchImplFrom({
                ...BASE_ROUTES,
                "/api/project/deployment/targets": () => ({ok: false, status: 500, body: {error: "ECONNREFUSED 127.0.0.1:4123"}}),
            }),
            initialEntries: ["/project/overview"],
        });
        await screen.findByRole("heading", {name: "A"});
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", {name: "Build/Export"}));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("The deployment targets list couldn't reach the Studio server. Check your connection and try again.");
        expect(alert).not.toHaveTextContent("ECONNREFUSED");
    });
});
