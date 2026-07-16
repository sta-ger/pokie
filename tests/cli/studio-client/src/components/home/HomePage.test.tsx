import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {HomePage} from "../../../../../../cli/studio-client/src/components/home/HomePage";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("HomePage", () => {
    it("switches between tabs and keeps aria-current on the active one", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        renderWithProviders(<HomePage />, {fetchImpl});

        expect(await screen.findByText("No recent projects yet.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Recent Projects"})).toHaveAttribute("aria-current", "page");

        await user.click(screen.getByRole("button", {name: "Open Existing Project"}));

        expect(screen.getByLabelText("Project path", {exact: false})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Open Existing Project"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("button", {name: "Recent Projects"})).not.toHaveAttribute("aria-current");
    });

    it("opens a project from the Open Existing Project form", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/a"}, manifest: {id: "a", name: "A", version: "0.1.0"}},
            }),
        });

        renderWithProviders(<HomePage />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Open Existing Project"}));
        await user.type(screen.getByLabelText("Project path", {exact: false}), "/games/a");
        await user.click(screen.getByRole("button", {name: "Open"}));

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
