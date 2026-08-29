import {screen, waitFor} from "@testing-library/react";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

describe("Studio readiness convergence", () => {
    it("uses the scoped project's server validation result when Overview is the recovery destination", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "loaded",
                    projectRoot: "/games/blocked",
                    game: {id: "blocked", name: "Blocked", version: "1.0.0"},
                    type: "blueprint",
                    capabilities: ["blueprint.build"],
                },
            }),
            "/api/project/validate": () => ({ok: true, status: 200, body: {valid: false, issues: [{message: "Add a paytable"}]}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/blocked", valid: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/rounds": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: []}),
            "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "missing"}}),
        });
        const path = `/project/${encodeURIComponent("/games/blocked")}/validation`;
        const {router} = renderRoutedApp({fetchImpl, initialEntries: [path]});

        await screen.findByRole("heading", {name: "Blocked"});
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent("/games/blocked")}/overview`));
        expect(screen.getByText(/Validate is now part of Overview diagnostics/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
    });
});
