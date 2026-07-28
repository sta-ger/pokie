import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BuildFromBlueprintPanel} from "../../../../../../cli/studio-client/src/components/home/BuildFromBlueprintPanel";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("BuildFromBlueprintPanel", () => {
    it("Browse for the blueprint path lists files and selects one by clicking it", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/games",
                    displayPath: "./games",
                    entries: [
                        {name: "sample-slot", isDirectory: true},
                        {name: "blueprint.json", isDirectory: false},
                    ],
                },
            }),
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        const [blueprintBrowse] = screen.getAllByRole("button", {name: "Browse…"});
        await user.click(blueprintBrowse);

        expect(await screen.findByText("blueprint.json")).toBeInTheDocument();
        expect(screen.getByText("sample-slot")).toBeInTheDocument();
        // A directory picker's own "Select this folder" is unavailable here -- kind="file" never shows it.
        expect(screen.queryByRole("button", {name: "Select this folder"})).not.toBeInTheDocument();

        await user.click(screen.getByText("blueprint.json"));

        expect(screen.getByRole("textbox", {name: "Blueprint JSON path"})).toHaveValue("./games/blueprint.json");
    });

    it("Browse for the output directory offers 'Select this folder' and updates the outDir field", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/out", displayPath: "./out", entries: []}}),
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        const [, outDirBrowse] = screen.getAllByRole("button", {name: "Browse…"});
        await user.click(outDirBrowse);

        await user.click(await screen.findByRole("button", {name: "Select this folder"}));

        expect(screen.getByRole("textbox", {name: "Output directory (optional)"})).toHaveValue("./out");
    });

    it("Browse cancellation never changes either path field", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/games", displayPath: "./games", entries: [{name: "blueprint.json", isDirectory: false}]}}),
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        const [blueprintBrowse] = screen.getAllByRole("button", {name: "Browse…"});
        await user.click(blueprintBrowse);
        expect(await screen.findByText("blueprint.json")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Cancel"}));

        expect(screen.getByRole("textbox", {name: "Blueprint JSON path"})).toHaveValue("");
        expect(screen.getByRole("textbox", {name: "Output directory (optional)"})).toHaveValue("");
    });
});
