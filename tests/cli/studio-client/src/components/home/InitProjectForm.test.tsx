import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {InitProjectForm} from "../../../../../../cli/studio-client/src/components/home/InitProjectForm";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("InitProjectForm", () => {
    it("initializes the current directory ('.') by default without any typing", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/init": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", projectRoot: "/games/here", manifest: {id: "here", name: "here", version: "0.1.0"}, createdFiles: [], updatedFiles: ["package.json"], skippedFiles: []},
            }),
        });

        renderWithProviders(<InitProjectForm />, {fetchImpl});

        expect(screen.getByRole("textbox", {name: "Existing project directory"})).toHaveValue(".");
        await user.click(screen.getByRole("button", {name: "Initialize"}));

        expect(await screen.findByText("package.json")).toBeInTheDocument();
        expect(calls[0]).toEqual({
            url: "/api/home/projects/init",
            init: {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({directory: "."})},
        });
    });

    it("Browse's 'Select this folder' updates the field and the submitted request", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/root/existing-game", displayPath: "./existing-game", entries: []},
            }),
            "/api/home/projects/init": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", projectRoot: "/root/existing-game", manifest: {id: "existing-game", name: "existing-game", version: "0.1.0"}, createdFiles: [], updatedFiles: [], skippedFiles: []},
            }),
        });

        renderWithProviders(<InitProjectForm />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));
        await user.click(await screen.findByRole("button", {name: "Select this folder"}));

        expect(screen.getByRole("textbox", {name: "Existing project directory"})).toHaveValue("./existing-game");

        await user.click(screen.getByRole("button", {name: "Initialize"}));
        expect(calls.find((call) => call.url === "/api/home/projects/init")?.init?.body).toBe(JSON.stringify({directory: "./existing-game"}));
    });

    it("Browse cancellation leaves the directory field untouched", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/root", displayPath: "/root", entries: [{name: "existing-game", isDirectory: true}]},
            }),
        });

        renderWithProviders(<InitProjectForm />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));
        expect(await screen.findByText("existing-game")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Cancel"}));

        expect(screen.getByRole("textbox", {name: "Existing project directory"})).toHaveValue(".");
    });
});
