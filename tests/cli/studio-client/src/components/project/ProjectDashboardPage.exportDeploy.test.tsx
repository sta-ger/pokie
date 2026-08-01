import {screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const BASE_ROUTES: Record<string, () => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}},
    }),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
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
    it("classifies Stake Engine Export as a static export card and the registered local target as a local adapter card, keeping a remote-deployment placeholder", async () => {
        const user = userEvent.setup();
        renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Export & Deploy"}));

        const staticExportSection = screen.getByText("Static export").closest("fieldset") as HTMLElement;
        expect(within(staticExportSection).getByText("Stake Engine Export")).toBeInTheDocument();

        const localAdapterSection = screen.getByText("Local adapter").closest("fieldset") as HTMLElement;
        expect(await within(localAdapterSection).findByText("External Adapter: local-json-example")).toBeInTheDocument();

        const remoteSection = screen.getByText("Remote deployment").closest("fieldset") as HTMLElement;
        expect(within(remoteSection).getByText("Remote deployment (none registered yet)")).toBeInTheDocument();
    });

    it("pre-selects the target and hands off to the Deployment tab when a local adapter card is chosen", async () => {
        const user = userEvent.setup();
        renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Export & Deploy"}));
        await screen.findByText("External Adapter: local-json-example");
        await user.click(screen.getByRole("button", {name: "Select & configure in Deployment"}));

        // Landed on the (unchanged) Deployment tab, with the same target already marked selected --
        // ExportDeployTab only pre-selects it, it never runs the deployment pipeline itself. It's also
        // the only registered target, so Select-target is skipped entirely and this lands straight on
        // Configure -- no artificial step forcing a click through the single option.
        expect(await screen.findByRole("button", {name: "Run deployment preflight"})).toBeInTheDocument();
    });

    it("hands off to the (unchanged) Stake Engine Export tab when the static-export card is chosen", async () => {
        const user = userEvent.setup();
        renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Export & Deploy"}));
        await user.click(screen.getByRole("button", {name: "Open Stake Engine Export"}));

        expect(await screen.findByRole("button", {name: "Continue to Preview"})).toBeInTheDocument();
    });

    it("keeps the legacy /project/deployment and /project/stakeEngineExport routes deep-link compatible", async () => {
        renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/deployment"]});
        // The only registered target is selected automatically, auto-advancing straight to Configure.
        expect(await screen.findByRole("button", {name: "Run deployment preflight"})).toBeInTheDocument();

        renderRoutedApp({fetchImpl: fetchImplFrom(BASE_ROUTES), initialEntries: ["/project/stakeEngineExport"]});
        expect(await screen.findByText("Output directory")).toBeInTheDocument();
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
        await user.click(screen.getByRole("button", {name: "Export & Deploy"}));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("The deployment targets list couldn't reach the Studio server. Check your connection and try again.");
        expect(alert).not.toHaveTextContent("ECONNREFUSED");
    });
});
