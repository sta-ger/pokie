import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {PathBrowseModal} from "../../../../../../cli/studio-client/src/components/common/PathBrowseModal";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("PathBrowseModal", () => {
    it("lists directories and (for a file picker) files, navigates into a subdirectory, and selects a file", async () => {
        const user = userEvent.setup();
        const onSelect = jest.fn();
        const onClose = jest.fn();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": (call: FakeCall) => {
                if (call.url.includes("games")) {
                    return {
                        ok: true,
                        status: 200,
                        body: {status: "ok", resolvedPath: "/root/games", displayPath: "./games", parentPath: "/root", entries: [{name: "blueprint.json", isDirectory: false}]},
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    body: {
                        status: "ok",
                        resolvedPath: "/root",
                        displayPath: "/root",
                        entries: [
                            {name: "games", isDirectory: true},
                            {name: "readme.txt", isDirectory: false},
                        ],
                    },
                };
            },
        });

        renderWithProviders(
            <PathBrowseModal opened onClose={onClose} onSelect={onSelect} kind="file" initialPath="" title="Browse for a blueprint file" />,
            {fetchImpl},
        );

        expect(await screen.findByText("Current location: /root")).toBeInTheDocument();
        expect(screen.getByText("readme.txt")).toBeInTheDocument();

        await user.click(screen.getByText("games"));
        expect(await screen.findByText("Current location: ./games")).toBeInTheDocument();
        expect(screen.getByText("blueprint.json")).toBeInTheDocument();

        await user.click(screen.getByText("blueprint.json"));

        expect(onSelect).toHaveBeenCalledWith("./games/blueprint.json");
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("hides files from a directory picker and offers 'Select this folder' for the current location", async () => {
        const user = userEvent.setup();
        const onSelect = jest.fn();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/root",
                    displayPath: "/root",
                    entries: [
                        {name: "games", isDirectory: true},
                        {name: "readme.txt", isDirectory: false},
                    ],
                },
            }),
        });

        renderWithProviders(<PathBrowseModal opened onClose={jest.fn()} onSelect={onSelect} kind="directory" initialPath="" title="Browse for a directory" />, {
            fetchImpl,
        });

        expect(await screen.findByText("games")).toBeInTheDocument();
        expect(screen.queryByText("readme.txt")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Select this folder"}));
        expect(onSelect).toHaveBeenCalledWith("/root");
    });

    it("navigates back up via the parent entry", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": (call: FakeCall) => {
                if (call.url.includes("path=%2Froot%2Fgames")) {
                    return {
                        ok: true,
                        status: 200,
                        body: {status: "ok", resolvedPath: "/root/games", displayPath: "./games", parentPath: "/root", entries: []},
                    };
                }
                return {ok: true, status: 200, body: {status: "ok", resolvedPath: "/root", displayPath: "/root", entries: []}};
            },
        });

        renderWithProviders(
            <PathBrowseModal opened onClose={jest.fn()} onSelect={jest.fn()} kind="directory" initialPath="/root/games" title="Browse" />,
            {fetchImpl},
        );

        expect(await screen.findByText("Current location: ./games")).toBeInTheDocument();
        await user.click(screen.getByText(".. (up)"));

        expect(await screen.findByText("Current location: /root")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=%2Froot")).toBe(true);
    });

    it("shows a nonexistent path as an error and recovers via 'Go to Studio's working directory'", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": (call: FakeCall) => {
                if (call.url.includes("does-not-exist")) {
                    return {ok: true, status: 200, body: {status: "error", error: '"does-not-exist" does not exist.', resolvedPath: "/root/does-not-exist"}};
                }
                return {ok: true, status: 200, body: {status: "ok", resolvedPath: "/root", displayPath: "/root", entries: []}};
            },
        });

        renderWithProviders(
            <PathBrowseModal opened onClose={jest.fn()} onSelect={jest.fn()} kind="directory" initialPath="does-not-exist" title="Browse" />,
            {fetchImpl},
        );

        expect(await screen.findByText('"does-not-exist" does not exist.')).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Select this folder"})).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Go to Studio's working directory"}));

        expect(await screen.findByText("Current location: /root")).toBeInTheDocument();
    });

    it("shows a permission-denied error without crashing", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "error", error: 'Permission denied reading "/root/locked".', resolvedPath: "/root/locked"}}),
        });

        renderWithProviders(<PathBrowseModal opened onClose={jest.fn()} onSelect={jest.fn()} kind="directory" initialPath="/root/locked" title="Browse" />, {
            fetchImpl,
        });

        expect(await screen.findByText('Permission denied reading "/root/locked".')).toBeInTheDocument();
    });

    it("always labels itself 'Server filesystem browser', with whose filesystem it shows, regardless of the caller's own title", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/root", displayPath: "/root", entries: []}}),
        });

        renderWithProviders(
            <PathBrowseModal opened onClose={jest.fn()} onSelect={jest.fn()} kind="directory" initialPath="" title="Browse for a destination directory" />,
            {fetchImpl},
        );

        const title = await screen.findByText("Server filesystem browser");
        expect(screen.getAllByRole("heading", {level: 2})).toHaveLength(1);
        const heading = title.closest("h2");
        if (heading === null) {
            throw new Error("Server filesystem browser must be the modal's h2 title.");
        }
        expect(heading.querySelector("h1, h2, h3, h4, h5, h6, div, p")).toBeNull();
        expect(Array.from(heading.querySelectorAll("*")).every((element) => element.tagName === "SPAN")).toBe(true);
        expect(screen.getByText(/showing files on the machine running Studio's server, not this browser's device/)).toBeInTheDocument();
        expect(screen.getByText(/Browse for a destination directory/)).toBeInTheDocument();
    });

    it("Cancel closes without ever calling onSelect", async () => {
        const user = userEvent.setup();
        const onSelect = jest.fn();
        const onClose = jest.fn();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/root", displayPath: "/root", entries: []}}),
        });

        renderWithProviders(<PathBrowseModal opened onClose={onClose} onSelect={onSelect} kind="directory" initialPath="" title="Browse" />, {fetchImpl});

        expect(await screen.findByText("Current location: /root")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Cancel"}));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSelect).not.toHaveBeenCalled();
    });
});
