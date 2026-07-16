import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CreateProjectForm} from "../../../../../../cli/studio-client/src/components/home/CreateProjectForm";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("CreateProjectForm", () => {
    it("submits the form and shows the created-files result", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/create": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    projectRoot: "/games/crazy-fruits",
                    manifest: {id: "crazy-fruits", name: "crazy-fruits", version: "0.1.0"},
                    createdFiles: ["package.json", "blueprint.json"],
                    updatedFiles: [],
                    skippedFiles: [],
                },
            }),
        });

        renderWithProviders(<CreateProjectForm />, {fetchImpl});

        await user.type(screen.getByLabelText("Package name", {exact: false}), "crazy-fruits");
        await user.click(screen.getByRole("button", {name: "Create"}));

        expect(await screen.findByText("package.json")).toBeInTheDocument();
        expect(screen.getByText("blueprint.json")).toBeInTheDocument();
        expect(screen.getByText(/Next: cd \/games\/crazy-fruits && npm install && npm run build/)).toBeInTheDocument();
        expect(calls[0]).toEqual({
            url: "/api/home/projects/create",
            init: {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({destinationDir: ".", name: "crazy-fruits"}),
            },
        });
    });

    it("shows a domain-level failure distinctly from a network error", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/create": () => ({ok: true, status: 200, body: {status: "error", error: "destination already exists"}}),
        });

        renderWithProviders(<CreateProjectForm />, {fetchImpl});

        await user.type(screen.getByLabelText("Package name", {exact: false}), "crazy-fruits");
        await user.click(screen.getByRole("button", {name: "Create"}));

        expect(await screen.findByText("destination already exists")).toBeInTheDocument();
    });
});
