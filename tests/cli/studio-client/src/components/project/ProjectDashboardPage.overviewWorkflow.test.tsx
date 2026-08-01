import {screen} from "@testing-library/react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const BASE_ROUTES: Record<string, () => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}},
    }),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

describe("ProjectDashboardPage - Overview workflow", () => {
    it("shows a subject-specific recovery message, never the raw backend text, when the project inspection fails", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/inspect": () => ({ok: false, status: 500, body: {error: "ENOENT: no such file or directory, open 'package.json'"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("The project inspection couldn't be completed. Try again, and check the Studio server logs if the problem persists.");
        expect(alert).not.toHaveTextContent("ENOENT");
        expect(alert).not.toHaveTextContent("package.json");
    });

    it("classifies a network failure distinctly from an unrecognized backend rejection", async () => {
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/inspect") {
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
        expect(alert).toHaveTextContent("The project inspection couldn't reach the Studio server. Check your connection and try again.");
        expect(alert).not.toHaveTextContent("Failed to fetch");
    });

    it("still shows a curated provenance error verbatim -- it's a server-classified domain field, not a raw exception", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {packageRoot: "/games/a", valid: false, error: "package.json is missing a required \"name\" field."},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});

        expect(await screen.findByText('package.json is missing a required "name" field.')).toBeInTheDocument();
    });
});
