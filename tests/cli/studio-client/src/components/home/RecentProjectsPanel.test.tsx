import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {RecentProjectsPanel} from "../../../../../../cli/studio-client/src/components/home/RecentProjectsPanel";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("RecentProjectsPanel", () => {
    it("shows an empty state when there are no recent projects", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        renderWithProviders(<RecentProjectsPanel />, {fetchImpl});

        expect(await screen.findByText("No recent projects yet.")).toBeInTheDocument();
    });

    it("lists entries and disables a missing project instead of making it clickable", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({
                ok: true,
                status: 200,
                body: [
                    {projectRoot: "/games/a", name: "Crazy Fruits", openedAt: "2026-01-01T00:00:00.000Z", missing: false},
                    {projectRoot: "/games/b", name: "Gone", openedAt: "2026-01-02T00:00:00.000Z", missing: true},
                ],
            }),
        });

        renderWithProviders(<RecentProjectsPanel />, {fetchImpl});

        expect(await screen.findByRole("button", {name: "Crazy Fruits"})).toBeInTheDocument();
        expect(screen.getByText("Gone (missing)")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Gone"})).not.toBeInTheDocument();
    });

    it("opens a project on click", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({
                ok: true,
                status: 200,
                body: [{projectRoot: "/games/a", name: "Crazy Fruits", openedAt: "2026-01-01T00:00:00.000Z", missing: false}],
            }),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"}},
            }),
        });

        renderWithProviders(<RecentProjectsPanel />, {fetchImpl});

        await user.click(await screen.findByRole("button", {name: "Crazy Fruits"}));

        await waitFor(() => {
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: "/games/a"})}),
                }),
            );
        });
    });
});
