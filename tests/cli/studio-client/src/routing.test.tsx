import {MantineProvider} from "@mantine/core";
import {ModalsProvider} from "@mantine/modals";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter, Navigate, Route, Routes, useNavigate} from "react-router-dom";
import {HomePage} from "../../../../cli/studio-client/src/components/home/HomePage";
import {ProjectDashboardPage} from "../../../../cli/studio-client/src/components/project/ProjectDashboardPage";
import {StudioApiProvider} from "../../../../cli/studio-client/src/context/StudioApiProvider";
import type {FetchLike} from "../../../../cli/studio-client/src/api/apiClient";
import {createRoutedFakeFetch} from "./testUtils/fakeFetch";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

describe("Routable Home/Project sections: refresh and direct-link", () => {
    it("a direct link to a non-default Home tab renders that tab, not the default", () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/open"]});

        expect(screen.getByRole("heading", {name: "Open a Project"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page");
        expect(screen.queryByRole("heading", {name: "Design & Build Your Game"})).not.toBeInTheDocument();
    });

    it("a direct link to a non-default Project tab renders that tab, not Overview", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/games/a", game: {id: "a", name: "A", version: "1.0.0"}},
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/simulation"]});

        await screen.findByRole("heading", {name: "A"});
        expect(screen.getByRole("button", {name: "Simulate"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("button", {name: "Run Simulation"})).toBeInTheDocument();
    });

    it("an unrecognized :tab falls back to the default section instead of erroring", () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/home/does-not-exist"]});

        expect(screen.getByRole("heading", {name: "Design & Build Your Game"})).toBeInTheDocument();
    });
});

// A tiny sibling component (inside the same MemoryRouter as the app) that drives real history
// back/forward via useNavigate(-1)/(1) -- this maps directly to the underlying history entry stack, the
// same mechanism a real browser's Back/Forward buttons use, without needing react-router's data-router
// APIs (createMemoryRouter/RouterProvider), which pull in Fetch API Request/Response machinery jsdom
// doesn't polyfill.
function TestBackForwardControls() {
    const navigate = useNavigate();
    return (
        <div>
            <button onClick={() => navigate(-1)}>Test: Go Back</button>
            <button onClick={() => navigate(1)}>Test: Go Forward</button>
        </div>
    );
}

function renderWithBackForwardControls(fetchImpl: FetchLike) {
    return render(
        <MantineProvider>
            <MemoryRouter initialEntries={["/home/design"]}>
                <StudioApiProvider fetchImpl={fetchImpl}>
                    <ModalsProvider>
                        <TestBackForwardControls />
                        <Routes>
                            <Route path="/" element={<Navigate to="/home/design" replace />} />
                            <Route path="/home/:tab" element={<HomePage />} />
                            <Route path="/project" element={<Navigate to="/project/overview" replace />} />
                            <Route path="/project/:tab" element={<ProjectDashboardPage />} />
                            <Route path="*" element={<Navigate to="/home/design" replace />} />
                        </Routes>
                    </ModalsProvider>
                </StudioApiProvider>
            </MemoryRouter>
        </MantineProvider>,
    );
}

describe("Routable Home sections: browser back/forward", () => {
    it("back and forward navigate between previously-visited sections", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        renderWithBackForwardControls(fetchImpl);

        expect(screen.getByRole("button", {name: "Design & Build"})).toHaveAttribute("aria-current", "page");

        await user.click(screen.getByRole("button", {name: "Open Project"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page"));

        await user.click(screen.getByRole("button", {name: "Advanced Tools"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Advanced Tools"})).toHaveAttribute("aria-current", "page"));

        await user.click(screen.getByRole("button", {name: "Test: Go Back"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page"));

        await user.click(screen.getByRole("button", {name: "Test: Go Back"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Design & Build"})).toHaveAttribute("aria-current", "page"));

        await user.click(screen.getByRole("button", {name: "Test: Go Forward"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page"));
        // Many sequential real userEvent interactions -- under Jest's parallel workers this can exceed
        // the project's default testTimeout, same reasoning as happyPath.test.tsx's own explicit timeout.
    }, 30000);
});
