import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
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
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

// Validation is no longer a separate section a user has to navigate to and click into -- it runs
// automatically, as soon as a project finishes loading, and its diagnostics render right inside
// Overview (see OverviewTab's own ValidationDiagnostics). Every test here just waits for that automatic
// first check to land instead of clicking into a "Validate" tab first.
describe("ProjectDashboardPage - Validation workflow", () => {
    it("shows a subject-specific recovery message, never the raw backend text, when the automatic validation check fails", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/validate": () => ({ok: false, status: 500, body: {error: "ENOENT: no such file or directory, open 'blueprint.json'"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("This validation check couldn't be completed. Try again, and check the Studio server logs if the problem persists.");
        expect(alert).not.toHaveTextContent("ENOENT");
        expect(alert).not.toHaveTextContent("blueprint.json");
    });

    it("classifies a network failure distinctly from an unrecognized backend rejection", async () => {
        let validateAttempts = 0;
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/validate") {
                validateAttempts += 1;
                return Promise.reject(new Error("Failed to fetch"));
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route();
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("This validation check couldn't reach the Studio server. Check your connection and try again.");
        expect(alert).not.toHaveTextContent("Failed to fetch");
        expect(validateAttempts).toBe(1);
    });

    it("clears a translated error once a re-check succeeds", async () => {
        const user = userEvent.setup();
        let attempts = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/validate": () => {
                attempts += 1;
                if (attempts === 1) {
                    return {ok: false, status: 500, body: {error: "Internal error"}};
                }
                return {
                    ok: true,
                    status: 200,
                    body: {packageRoot: "/games/a", valid: true, game: {id: "a", name: "A", version: "1.0.0"}, errors: [], warnings: [], suggestions: []},
                };
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});
        expect(await screen.findByRole("alert")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Re-check project"}));
        await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
        expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument();
    });
});
