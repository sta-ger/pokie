import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {HomePage} from "../../../../../../cli/studio-client/src/components/home/HomePage";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("HomePage", () => {
    it("defaults to Design & Build and switches between tabs, keeping aria-current on the active one", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/recent-projects": () => ({ok: true, status: 200, body: []}),
        });

        renderWithProviders(<HomePage />, {fetchImpl});

        expect(screen.getByRole("heading", {name: "Design & Build Your Game"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Design & Build"})).toHaveAttribute("aria-current", "page");

        await user.click(screen.getByRole("button", {name: "Open Project"}));

        expect(await screen.findByText("No recent projects yet.")).toBeInTheDocument();
        expect(screen.getByLabelText("Project path", {exact: false})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Open Project"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("button", {name: "Design & Build"})).not.toHaveAttribute("aria-current");

        await user.click(screen.getByRole("button", {name: "Advanced Tools"}));
        expect(screen.getByRole("heading", {name: "Advanced Tools"})).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Raw Blueprint Editor"})).toBeInTheDocument();
    });

    it("opens a project from the Open Project tab's form", async () => {
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

        await user.click(screen.getByRole("button", {name: "Open Project"}));
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
