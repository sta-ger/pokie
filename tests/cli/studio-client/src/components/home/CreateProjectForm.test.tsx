import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CreateProjectForm} from "../../../../../../cli/studio-client/src/components/home/CreateProjectForm";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("CreateProjectForm", () => {
    it("provides a deterministic default project name -- Create works with zero typing", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/create": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    projectRoot: "/games/my-slot-game",
                    manifest: {id: "my-slot-game", name: "my-slot-game", version: "0.1.0"},
                    createdFiles: ["package.json"],
                    updatedFiles: [],
                    skippedFiles: [],
                },
            }),
        });

        renderWithProviders(<CreateProjectForm />, {fetchImpl});

        expect(screen.getByLabelText("Package name", {exact: false})).toHaveValue("my-slot-game");

        await user.click(screen.getByRole("button", {name: "Create"}));

        expect(await screen.findByText("package.json")).toBeInTheDocument();
        expect(calls[0]).toEqual({
            url: "/api/home/projects/create",
            init: {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({destinationDir: ".", name: "my-slot-game"}),
            },
        });
    });

    it("submits a custom name and shows the created-files result", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/create": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    projectRoot: "/games/sample-slot",
                    manifest: {id: "sample-slot", name: "sample-slot", version: "0.1.0"},
                    createdFiles: ["package.json", "blueprint.json"],
                    updatedFiles: [],
                    skippedFiles: [],
                },
            }),
        });

        renderWithProviders(<CreateProjectForm />, {fetchImpl});

        const nameField = screen.getByLabelText("Package name", {exact: false});
        await user.clear(nameField);
        await user.type(nameField, "sample-slot");
        await user.click(screen.getByRole("button", {name: "Create"}));

        expect(await screen.findByText("package.json")).toBeInTheDocument();
        expect(screen.getByText("blueprint.json")).toBeInTheDocument();
        expect(screen.getByText(/Next: cd \/games\/sample-slot && npm install && npm run build/)).toBeInTheDocument();
        expect(calls[0]).toEqual({
            url: "/api/home/projects/create",
            init: {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({destinationDir: ".", name: "sample-slot"}),
            },
        });
    });

    it("shows a domain-level failure (an overwrite/existing-directory conflict) as destination-directory-specific remediation, never the raw server error text", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/create": () => ({ok: true, status: 200, body: {status: "error", error: "destination already exists"}}),
        });

        renderWithProviders(<CreateProjectForm />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Create"}));

        expect(
            await screen.findByText("The destination directory could not be completed. Try again, and check the Studio server logs if the problem persists."),
        ).toBeInTheDocument();
        expect(screen.queryByText("destination already exists")).not.toBeInTheDocument();
    });

    it("shows an ENOENT failure as destination-directory-specific inline remediation, never the raw fs error text", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/create": () => ({ok: true, status: 200, body: {status: "error", error: "ENOENT: no such file or directory, mkdir '/no/such/dir/my-slot-game'"}}),
        });

        renderWithProviders(<CreateProjectForm />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Create"}));

        expect(await screen.findByText("The destination directory could not be found. Check the path and try again.")).toBeInTheDocument();
        expect(screen.queryByText(/ENOENT/)).not.toBeInTheDocument();
    });

    it("shows the resolved destination path once the field is focused, instead of a bare '.'", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/home/dev/games", displayPath: "/home/dev/games", entries: []}}),
        });

        renderWithProviders(<CreateProjectForm />, {fetchImpl});

        // Not getByLabelText: with {exact: false} it also substring-matches the *modal's own title*
        // ("Browse for a destination directory") once that dialog exists elsewhere in the tree --
        // getByRole("textbox", ...) only ever matches the actual <input>.
        await user.click(screen.getByRole("textbox", {name: "Destination directory"}));

        expect(await screen.findByText("Resolves to: /home/dev/games")).toBeInTheDocument();
        expect(calls).toEqual([{url: "/api/home/fs/browse?path=.", init: undefined}]);
    });

    it("Browse cancellation never changes the destinationDir field", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/home/dev", displayPath: "/home/dev", entries: [{name: "games", isDirectory: true}]},
            }),
            "/api/home/projects/create": () => ({ok: true, status: 201, body: {status: "ok", projectRoot: "/x", manifest: {id: "x", name: "x", version: "0.1.0"}, createdFiles: [], updatedFiles: [], skippedFiles: []}}),
        });

        renderWithProviders(<CreateProjectForm />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));
        expect(await screen.findByText("games")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Cancel"}));

        expect(screen.getByRole("textbox", {name: "Destination directory"})).toHaveValue(".");

        await user.click(screen.getByRole("button", {name: "Create"}));
        expect(calls.some((call) => call.url === "/api/home/projects/create" && JSON.parse(call.init?.body ?? "{}").destinationDir === ".")).toBe(true);
    });
});
