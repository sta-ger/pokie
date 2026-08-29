import {screen, waitFor} from "@testing-library/react";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

function projectRoutes() {
    return {
        "/api/project/context": () => ({
            ok: true,
            status: 200,
            body: {
                status: "loaded",
                projectRoot: "/games/a",
                game: {id: "a", name: "A", version: "1.0.0"},
                type: "outcomeLibrary",
                capabilities: ["outcomeLibrary.read"],
            },
        }),
        "/api/project/validate": () => ({ok: true, status: 200, body: {valid: true, issues: []}}),
        "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/rounds": () => ({ok: true, status: 200, body: []}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        "/api/project/deployment/build-modes": () => ({ok: true, status: 200, body: []}),
        "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "missing"}}),
    };
}

describe("Studio duplicate entrypoints (browser)", () => {
    it.each([
        ["legacy", "/project/outcomeLibraries", `/project/${encodeURIComponent("/games/a")}/overview`],
        ["scoped", `/project/${encodeURIComponent("/games/a")}/outcomeLibraries`, `/project/${encodeURIComponent("/games/a")}/overview`],
    ])("keeps the %s retired Outcome Libraries URL on the retained inspection owner", async (_kind, initialEntry, expectedPath) => {
        const {fetchImpl} = createRoutedFakeFetch(projectRoutes());
        const {router} = renderRoutedApp({fetchImpl, initialEntries: [initialEntry]});

        await screen.findByRole("heading", {name: "A"});
        await waitFor(() => expect(router.state.location.pathname).toBe(expectedPath));
        expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByText(/Outcome Libraries is no longer available in Studio/)).toBeInTheDocument();
        expect(screen.getByText(/use Overview to inspect the opened outcome source/)).toBeInTheDocument();
    });
});
