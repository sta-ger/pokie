import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ProjectDashboardPage} from "../../../../../../cli/studio-client/src/components/project/ProjectDashboardPage";
import {createFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

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

describe("ProjectDashboardPage - Simulation 409 conflict", () => {
    it("jumps straight to polling the already-active job instead of erroring", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const {fetchImpl} = createFakeFetch((call) => {
            const [path] = call.url.split("?");
            if (path === "/api/project/simulations") {
                // Another simulation is already running for this project.
                return {ok: false, status: 409, body: {activeJobId: "already-running-job"}};
            }
            if (path === "/api/project/simulations/already-running-job") {
                pollCount++;
                return {
                    ok: true,
                    status: 200,
                    body: {
                        id: "already-running-job",
                        status: "running",
                        rounds: 500,
                        workers: 1,
                        startedAt: new Date().toISOString(),
                        roundsCompleted: 250,
                        durationMs: 5,
                    },
                };
            }
            const route = BASE_ROUTES[path];
            if (route) {
                return route();
            }
            throw new Error(`no fake route for ${call.url}`);
        });

        renderWithProviders(<ProjectDashboardPage />, {fetchImpl, initialEntries: ["/project"]});
        await screen.findByRole("heading", {name: "A"});

        await user.click(screen.getByRole("button", {name: "Simulation"}));
        await user.click(screen.getByRole("button", {name: "Run Simulation"}));

        // No error surfaces -- the 409 with activeJobId is a typed conflict, not a failure -- and
        // polling picks up the *other* job's own progress.
        await waitFor(() => expect(pollCount).toBeGreaterThan(0));
        expect(await screen.findByText(/running — 250\/500 rounds/)).toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});
