import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useState} from "react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {PathInput} from "../../../../../../cli/studio-client/src/components/common/PathInput";
import {getRememberedBrowseLocation} from "../../../../../../cli/studio-client/src/domain/rememberedBrowseLocation";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

// A minimal controlled harness -- PathInput is normally driven by a Mantine uncontrolled form's
// getInputProps()/setFieldValue (see CreateProjectForm/InitProjectForm/BuildFromBlueprintPanel), but its
// own on-focus resolved-path hint and Browse wiring don't depend on that at all, so a plain useState
// harness exercises them directly without needing a whole form around it.
function Harness({
    kind = "directory" as const,
    initial = ".",
    browseId,
    relevantDirectory,
    autoDestinationPath,
}: {
    kind?: "directory" | "file";
    initial?: string;
    browseId?: string;
    relevantDirectory?: string;
    autoDestinationPath?: string;
}) {
    const [value, setValue] = useState(initial);
    return (
        <PathInput
            label="Path"
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            onPathSelected={setValue}
            kind={kind}
            browseId={browseId}
            relevantDirectory={relevantDirectory}
            autoDestinationPath={autoDestinationPath}
        />
    );
}

const UNAVAILABLE_ROUTE = {
    "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "unavailable", reason: "No graphical display."}}),
};

describe("PathInput", () => {
    afterEach(() => {
        localStorage.clear();
    });

    it("shows a contextual permission-denied status and remediation (never the raw backend message) when focused", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "error", error: 'Permission denied reading ".".', resolvedPath: "/root", reason: "permission"}}),
        });

        renderWithProviders(<Harness />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText('POKIE doesn\'t have permission to read "/root".')).toBeInTheDocument();
        expect(await screen.findByText("Choose a location you have access to.")).toBeInTheDocument();
        expect(screen.queryByText('Permission denied reading ".".')).not.toBeInTheDocument();
    });

    it.each([
        ["absent", "/root/missing", '"/root/missing" doesn\'t exist.', "Check the path, or use Browse to pick an existing location."],
        ["type", "/root/readme.txt", '"/root/readme.txt" is a file, not a folder.', "Point this at a folder instead, or use Browse to pick one."],
        ["unresolved", "/root/broken-link", '"/root/broken-link" is a broken link and can\'t be resolved.', "Point this at a different location."],
        [
            "symlink-escape",
            "/projects/sample-slot/evil",
            '"/projects/sample-slot/evil" leads outside the project through a linked folder.',
            "Choose a location inside the project.",
        ],
        ["other", "/root/weird", '"/root/weird" can\'t be used.', "Choose a different location, or use Browse to pick one."],
    ] as const)("renders a distinct, contextual status and remediation for a %s resolver outcome, never the raw error text", async (reason, resolvedPath, expectedStatus, expectedRemediation) => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "error", error: "some raw backend message that should never render", resolvedPath, reason}}),
        });

        renderWithProviders(<Harness />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText(expectedStatus)).toBeInTheDocument();
        expect(await screen.findByText(expectedRemediation)).toBeInTheDocument();
        expect(screen.queryByText("some raw backend message that should never render")).not.toBeInTheDocument();
    });

    it("resolves a file control's existing file value to a truthful 'Resolves to' hint, not a type mismatch, and requests kind=file", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/root/save.json", displayPath: "./save.json", entries: []}}),
        });

        renderWithProviders(<Harness kind="file" initial="./save.json" />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText("Resolves to: /root/save.json")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=.%2Fsave.json&kind=file")).toBe(true);
    });

    it("renders a file-appropriate status and remediation when a directory is used in a file control", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "error", error: "some raw backend message that should never render", resolvedPath: "/root/games", reason: "type"}}),
        });

        renderWithProviders(<Harness kind="file" />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText('"/root/games" is a folder, not a file.')).toBeInTheDocument();
        expect(await screen.findByText("Point this at a file instead, or use Browse to pick one.")).toBeInTheDocument();
    });

    it("does not request kind=file for a directory control", async () => {
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/games", displayPath: "/games", entries: []}}),
        });
        const user = userEvent.setup();

        renderWithProviders(<Harness initial="." />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        await waitFor(() => expect(calls.length).toBeGreaterThan(0));
        expect(calls.every((call) => !call.url.includes("kind="))).toBe(true);
    });

    it("shows a generic, non-crashing status when the browse request itself fails to reach the server", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => {
                throw new Error("network down");
            },
        });

        renderWithProviders(<Harness />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText("Couldn't check this location.")).toBeInTheDocument();
        expect(await screen.findByText("Confirm POKIE Studio's server is reachable, then try again.")).toBeInTheDocument();
    });

    it("shows a 'Resolves to' hint carrying the absolute resolvedPath (not the project-relative displayPath) for a relative/dot current value", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/home/alice/games", displayPath: "./games", entries: []}}),
        });

        renderWithProviders(<Harness initial="." />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText("Resolves to: /home/alice/games")).toBeInTheDocument();
        expect(screen.queryByText(/\.\/games/)).not.toBeInTheDocument();
    });

    it("shows an 'Auto resolved destination' hint (not 'Resolves to') carrying the absolute resolvedPath, not the project-relative displayPath, for a blank/optional current value", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/home/alice/games/default", displayPath: "./default", entries: []}}),
        });

        renderWithProviders(<Harness initial="" />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText("Auto resolved destination: /home/alice/games/default")).toBeInTheDocument();
        expect(screen.queryByText(/^Resolves to:/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\.\/default/)).not.toBeInTheDocument();
    });

    it("resolves a blank field's 'Auto resolved destination' hint against a caller-supplied autoDestinationPath (e.g. Build's own manifest.id default), not Studio's bare browse root", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/studio-root/sample-slot", displayPath: "./sample-slot", entries: []}}),
        });

        renderWithProviders(<Harness initial="" autoDestinationPath="sample-slot" />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText("Auto resolved destination: /studio-root/sample-slot")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=sample-slot")).toBe(true);
    });

    it("replaces an already-focused field's resolved hint with the edited value's own resolution, even if the prior value's response arrives late", async () => {
        const calls: FakeCall[] = [];
        const respondTo: Array<(body: unknown) => void> = [];
        const fetchImpl: FetchLike = (url, init) => {
            calls.push({url, init});
            return new Promise((resolve) => {
                respondTo.push((body) => resolve({ok: true, status: 200, json: () => Promise.resolve(body)}));
            });
        };

        renderWithProviders(<Harness initial="a" />, {fetchImpl});
        const input = screen.getByRole("textbox", {name: "Path"});

        await userEvent.click(input);
        fireEvent.change(input, {target: {value: "ab"}});

        await waitFor(() => expect(calls.length).toBe(2));
        expect(calls[0].url).toBe("/api/home/fs/browse?path=a");
        expect(calls[1].url).toBe("/api/home/fs/browse?path=ab");

        // The newer ("ab") request settles first, then the stale ("a") request settles late -- the stale
        // response must not overwrite the hint the newer value already produced.
        respondTo[1]({status: "ok", resolvedPath: "/root/ab", displayPath: "./ab", entries: []});
        await screen.findByText("Resolves to: /root/ab");

        respondTo[0]({status: "ok", resolvedPath: "/root/a", displayPath: "./a", entries: []});
        // Flush the stale response's own promise chain (fetch -> .json() -> .then) so a regression --
        // it overwriting the hint -- would already have happened by the time we assert below.
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        });

        expect(screen.getByText("Resolves to: /root/ab")).toBeInTheDocument();
        expect(screen.queryByText("Resolves to: /root/a")).not.toBeInTheDocument();
    });

    it("resolves the hint against a caller-supplied relevantDirectory (e.g. the open project's root), not Studio's own server root", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/projects/sample-slot/outcomes", displayPath: "./outcomes", entries: []}}),
        });

        renderWithProviders(<Harness initial="./outcomes" relevantDirectory="/projects/sample-slot" />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText("Resolves to: /projects/sample-slot/outcomes")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=.%2Foutcomes&base=%2Fprojects%2Fsample-slot")).toBe(true);
    });

    it("opens the fallback modal at the resolved absolute project path for a valid relative current value, not Studio's own server root", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/projects/sample-slot/outcomes", displayPath: "/projects/sample-slot/outcomes", entries: []},
            }),
            ...UNAVAILABLE_ROUTE,
        });

        renderWithProviders(<Harness initial="./outcomes" relevantDirectory="/projects/sample-slot" />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        expect(await screen.findByText("Server filesystem browser")).toBeInTheDocument();
        expect(await screen.findByText("Current location: /projects/sample-slot/outcomes")).toBeInTheDocument();
        // The start-location resolver's own request, resolved against relevantDirectory.
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=.%2Foutcomes&base=%2Fprojects%2Fsample-slot")).toBe(true);
        // The modal's own subsequent directory listing must reuse that already-resolved absolute path --
        // never re-request the raw relative value with no base, which would resolve it against Studio's
        // own server root instead of the project.
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=%2Fprojects%2Fsample-slot%2Foutcomes")).toBe(true);
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=.%2Foutcomes")).toBe(false);
    });

    it("starts Browse for a file control's valid current value in that file's own containing directory, not the file itself", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": (call: FakeCall) =>
                call.url.includes("kind=file")
                    ? {
                        ok: true,
                        status: 200,
                        body: {
                            status: "ok",
                            resolvedPath: "/projects/sample-slot/blueprints/sample.json",
                            displayPath: "./blueprints/sample.json",
                            parentPath: "/projects/sample-slot/blueprints",
                            entries: [],
                        },
                    }
                    : {
                        ok: true,
                        status: 200,
                        body: {status: "ok", resolvedPath: "/projects/sample-slot/blueprints", displayPath: "/projects/sample-slot/blueprints", entries: []},
                    },
            ...UNAVAILABLE_ROUTE,
        });

        renderWithProviders(<Harness kind="file" initial="./blueprints/sample.json" />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        expect(await screen.findByText("Server filesystem browser")).toBeInTheDocument();
        expect(await screen.findByText("Current location: /projects/sample-slot/blueprints")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=.%2Fblueprints%2Fsample.json&kind=file")).toBe(true);
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=%2Fprojects%2Fsample-slot%2Fblueprints")).toBe(true);
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

    it("never calls POST /api/home/fs/native-browse and opens only the labeled Server filesystem browser for a remote Studio session (server reports the picker unavailable)", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/games", displayPath: "./games", entries: []}}),
            "/api/home/fs/native-browse/availability": () => ({
                ok: true,
                status: 200,
                body: {status: "unavailable", reason: "Native folder/file dialogs are only available to a Studio session connecting from the same machine running its server."},
            }),
        });

        renderWithProviders(<Harness initial="./games" />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        expect(await screen.findByText("Server filesystem browser")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/native-browse")).toBe(false);
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
