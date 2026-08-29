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
                // This fixture represents a project that can expose both the retained inspection
                // owner and the Build/Export owner.  The route assertion, rather than a missing
                // capability, is therefore what decides each legacy migration destination.
                capabilities: ["outcomeLibrary.read", "blueprint.build"],
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
        ["legacy", "deployment", "exportDeploy", /Deployment has moved into Build\/Export/],
        ["scoped", "deployment", "exportDeploy", /Deployment has moved into Build\/Export/],
        ["legacy", "stakeEngineExport", "exportDeploy", /Stake Engine Export has moved into Build\/Export/],
        ["scoped", "stakeEngineExport", "exportDeploy", /Stake Engine Export has moved into Build\/Export/],
        ["legacy", "outcomeLibraries", "overview", /Outcome Libraries is no longer available in Studio/],
        ["scoped", "outcomeLibraries", "overview", /Outcome Libraries is no longer available in Studio/],
        ["legacy", "validate", "overview", /Validate is now part of Overview diagnostics/],
        ["scoped", "validation", "overview", /Validate is now part of Overview diagnostics/],
        ["legacy", "retired-section", "overview", /The requested Studio section is no longer available/],
        ["scoped", "retired-section", "overview", /The requested Studio section is no longer available/],
    ])("gives the %s retired %s URL an explicit retained-workflow recovery", async (kind, retiredTab, destination, recovery) => {
        const initialEntry = kind === "legacy" ? `/project/${retiredTab}` : `/project/${encodeURIComponent("/games/a")}/${retiredTab}`;
        const expectedPath = `/project/${encodeURIComponent("/games/a")}/${destination}`;
        const {fetchImpl} = createRoutedFakeFetch(projectRoutes());
        const {router} = renderRoutedApp({fetchImpl, initialEntries: [initialEntry]});

        await screen.findByRole("heading", {name: "A"});
        await waitFor(() => expect(router.state.location.pathname).toBe(expectedPath));
        expect(screen.getByRole("button", {name: destination === "overview" ? "Overview" : "Build/Export"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByText(recovery)).toBeInTheDocument();
    });
});
