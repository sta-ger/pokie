import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useState} from "react";
import {PathInput} from "../../../../../../cli/studio-client/src/components/common/PathInput";
import {getRememberedBrowseLocation} from "../../../../../../cli/studio-client/src/domain/rememberedBrowseLocation";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

// A minimal controlled harness -- PathInput is normally driven by a Mantine uncontrolled form's
// getInputProps()/setFieldValue (see CreateProjectForm/InitProjectForm/BuildFromBlueprintPanel), but its
// own on-focus resolved-path hint and Browse wiring don't depend on that at all, so a plain useState
// harness exercises them directly without needing a whole form around it.
function Harness({kind = "directory" as const, initial = ".", browseId}: {kind?: "directory" | "file"; initial?: string; browseId?: string}) {
    const [value, setValue] = useState(initial);
    return (
        <PathInput label="Path" value={value} onChange={(event) => setValue(event.currentTarget.value)} onPathSelected={setValue} kind={kind} browseId={browseId} />
    );
}

const UNAVAILABLE_ROUTE = {
    "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "unavailable", reason: "No graphical display."}}),
};

describe("PathInput", () => {
    afterEach(() => {
        localStorage.clear();
    });

    it("shows a permission-denied hint (not a crash) when focused", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "error", error: 'Permission denied reading ".".', resolvedPath: "/root"}}),
        });

        renderWithProviders(<Harness />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText('Permission denied reading ".".')).toBeInTheDocument();
    });

    it("falls back to the Server filesystem browser modal, seeded with the field's current value, when native browsing is unavailable", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/games", displayPath: "./games", entries: []}}),
            ...UNAVAILABLE_ROUTE,
        });

        renderWithProviders(<Harness initial="./games" />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        expect(await screen.findByText("Server filesystem browser")).toBeInTheDocument();
        expect(await screen.findByText("Current location: ./games")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=.%2Fgames")).toBe(true);
    });

    it("selects a path from the native picker directly, without ever opening the fallback modal", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "selected", path: "/home/alice/games/sample-slot"}}),
        });

        renderWithProviders(<Harness initial="" browseId="create-project-destination" />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        expect(await screen.findByDisplayValue("/home/alice/games/sample-slot")).toBeInTheDocument();
        expect(screen.queryByText("Server filesystem browser")).not.toBeInTheDocument();
        const pickCall = calls.find((call) => call.url === "/api/home/fs/native-browse");
        expect(pickCall?.init?.method).toBe("POST");
        expect(getRememberedBrowseLocation("create-project-destination")).toBe("/home/alice/games/sample-slot");
    });

    it("leaves the field untouched when the native picker reports cancelled", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/games", displayPath: "./games", entries: []}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "cancelled"}}),
        });

        renderWithProviders(<Harness initial="./games" />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        await waitFor(() => expect(calls.some((call) => call.url === "/api/home/fs/native-browse")).toBe(true));
        expect(screen.queryByText("Server filesystem browser")).not.toBeInTheDocument();
        expect(screen.getByDisplayValue("./games")).toBeInTheDocument();
    });

    it("falls back to the modal (never the field itself) when the native pick request itself errors", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/games", displayPath: "./games", entries: []}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "error", message: "boom"}}),
        });

        renderWithProviders(<Harness initial="./games" />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        expect(await screen.findByText("Server filesystem browser")).toBeInTheDocument();
    });

    it("seeds the fallback modal from a remembered location for this browseId when the field is empty", async () => {
        const user = userEvent.setup();
        localStorage.setItem("pokie-studio:browse-location:create-project-destination", "/home/alice/games");
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
            "/api/home/fs/browse": (call: FakeCall) => {
                if (call.url.includes("games")) {
                    return {ok: true, status: 200, body: {status: "ok", resolvedPath: "/home/alice/games", displayPath: "/home/alice/games", entries: []}};
                }
                return {ok: true, status: 200, body: {status: "error", error: "nope", resolvedPath: "/"}};
            },
            ...UNAVAILABLE_ROUTE,
        });

        renderWithProviders(<Harness initial="" browseId="create-project-destination" />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        expect(await screen.findByText("Current location: /home/alice/games")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=%2Fhome%2Falice%2Fgames")).toBe(true);
    });
});
