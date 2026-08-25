import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {useLocation} from "react-router-dom";
import {ProjectsPanel} from "../../../../../../cli/studio-client/src/components/home/ProjectsPanel";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

// Covers the Import Project flow this step (P3-POLISH-13) added to the Projects tab -- Detect (a
// read-only preview, never registering anything) -> Register for anything with an "open" story, or
// straight to Design Game's own PAR Sheet Import/Export panel for a recognized PAR workbook, which has
// none. HomePage.test.tsx/openProjectGuard.test.tsx/navigationGuardModal.test.tsx already cover opening
// an already-registered row and the dirty-draft guard around it -- this file is scoped to what's unique
// to Import Project itself.

// Home keeps the Design Game surface mounted while Projects is open. Its automatic validation can
// therefore run during any of these project-only flows, so each routed fetch fixture must cover it.
const AUTOMATIC_VALIDATION_ROUTE = {
    "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
};

async function goToProjects(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(await screen.findByRole("button", {name: "Projects"}));
    await screen.findByText("Import Project");
}

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{JSON.stringify({pathname: location.pathname, state: location.state})}</output>;
}

describe("ProjectsPanel: Import Project", () => {
    it("detects a recognized package, prefills the suggested name, and Register adds it to the list", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/a", type: "tsPackage", capabilities: ["multiMode"], suggestedName: "a"},
            }),
            "/api/home/projects/registry/register": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    entry: {
                        location: "/games/a",
                        name: "a",
                        type: "tsPackage",
                        capabilities: ["multiMode"],
                        origin: "external",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.type(screen.getByLabelText("Location", {exact: false}), "/games/a");
        await user.click(screen.getByRole("button", {name: "Detect"}));

        expect(await screen.findByText(/Detected a Package at/)).toBeInTheDocument();
        const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
        expect(nameInput.value).toBe("a");

        await user.click(screen.getByRole("button", {name: "Register"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/registry/register",
                    init: expect.objectContaining({body: JSON.stringify({location: "/games/a", name: "a"})}),
                }),
            ),
        );
        expect(await screen.findByText('Registered "a" -- it now shows up in Your projects above.')).toBeInTheDocument();
        expect(await screen.findByText("a")).toBeInTheDocument();
    });

    it("renders an explicit Detecting state while a preview request is in flight", async () => {
        const user = userEvent.setup();
        const fetchImpl = (url: string) => {
            if (url.startsWith("/api/home/projects/registry?")) {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (url === "/api/home/projects/registry/preview") {
                return new Promise<never>(() => {
                    // Intentionally remains pending while the UI exposes its in-flight state.
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        };
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.type(screen.getByLabelText("Location", {exact: false}), "/games/a");
        await user.click(screen.getByRole("button", {name: "Detect"}));

        // The empty project registry also owns a polite status region. Assert against this
        // import flow's unique, visible copy rather than whichever status mounted first.
        expect(await screen.findByText("Detecting project…")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Detect"})).toBeDisabled();
    });

    it("settles an unresponsive preview into an actionable error", async () => {
        jest.useFakeTimers();
        try {
            const fetchImpl = (url: string) => {
                if (url.startsWith("/api/home/projects/registry?")) {
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
                }
                if (url === "/api/home/projects/registry/preview") {
                    return new Promise<never>(() => {
                        // Intentionally remains pending until the timeout settles the UI.
                    });
                }
                if (url.startsWith("/api/home/fs/browse")) {
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "error", reason: "absent", resolvedPath: "/games/a"})});
                }
                throw new Error(`Unexpected request: ${url}`);
            };
            renderWithProviders(<ProjectsPanel />, {fetchImpl});

            await act(async () => {
                await Promise.resolve();
            });
            await act(async () => {
                fireEvent.change(screen.getByLabelText("Location", {exact: false}), {target: {value: "/games/a"}});
                fireEvent.click(screen.getByRole("button", {name: "Detect"}));
                await Promise.resolve();
            });

            await act(async () => {
                jest.advanceTimersByTime(15_000);
                await Promise.resolve();
            });

            expect(screen.getByRole("alert")).toHaveTextContent("Project detection timed out. Confirm Studio is still reachable, then try again.");
            expect(screen.getByRole("button", {name: "Detect"})).not.toBeDisabled();
        } finally {
            jest.useRealTimers();
        }
    });

    it("routes a recognized PAR sheet to Design Game's own PAR Sheet Import/Export panel instead of registering it", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/sheet.xlsx", type: "parWorkbook", capabilities: [], suggestedName: "sheet"},
            }),
        });
        renderWithProviders(
            <>
                <ProjectsPanel />
                <LocationProbe />
            </>,
            {fetchImpl},
        );

        await user.type(screen.getByLabelText("Location", {exact: false}), "/games/sheet.xlsx");
        await user.click(screen.getByRole("button", {name: "Detect"}));

        expect(await screen.findByText(/This is a PAR sheet workbook/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Register"})).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Open in Design Game"}));

        await waitFor(() =>
            expect(JSON.parse(screen.getByTestId("location").textContent ?? "{}")).toEqual({
                pathname: "/home/design",
                state: {initialParSheetPath: "/games/sheet.xlsx"},
            }),
        );
        expect(calls.some((call) => call.url === "/api/home/projects/registry/register")).toBe(false);
    });

    it("picks a PAR workbook through the native file picker, then detects and routes it into Design Game", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "selected", path: "/games/native-sheet.xlsx"}}),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/native-sheet.xlsx", type: "parWorkbook", capabilities: [], suggestedName: "native-sheet"},
            }),
        });
        renderWithProviders(
            <>
                <ProjectsPanel />
                <LocationProbe />
            </>,
            {fetchImpl},
        );

        await user.click(screen.getByRole("button", {name: "Browse PAR sheet…"}));
        expect(await screen.findByDisplayValue("/games/native-sheet.xlsx")).toBeInTheDocument();

        const pickCall = calls.find((call) => call.url === "/api/home/fs/native-browse");
        expect(JSON.parse(String(pickCall?.init?.body))).toEqual({
            kind: "file",
            mode: "open",
            fileFilters: [{name: "PAR sheets", extensions: ["xlsx"]}],
        });

        await user.click(screen.getByRole("button", {name: "Detect"}));
        expect(await screen.findByText(/This is a PAR sheet workbook/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Open in Design Game"}));

        await waitFor(() =>
            expect(JSON.parse(screen.getByTestId("location").textContent ?? "{}")).toEqual({
                pathname: "/home/design",
                state: {initialParSheetPath: "/games/native-sheet.xlsx"},
            }),
        );
    });

    it("leaves the imported location unchanged without opening the fallback browser when the native PAR picker is cancelled", async () => {
        const user = userEvent.setup();
        const selectedLocation = "/games/already-selected.xlsx";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: selectedLocation, displayPath: selectedLocation, entries: [], isDirectory: false},
            }),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "cancelled"}}),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.type(screen.getByLabelText("Location", {exact: false}), selectedLocation);
        await user.click(screen.getByRole("button", {name: "Browse PAR sheet…"}));

        await waitFor(() => expect(calls.some((call) => call.url === "/api/home/fs/native-browse")).toBe(true));
        expect(screen.getByDisplayValue(selectedLocation)).toBeInTheDocument();
        expect(screen.queryByText("Server filesystem browser")).not.toBeInTheDocument();
    });

    it("falls back to file-only server selection when the native PAR picker is unavailable", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "unavailable", reason: "No display"}}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/games",
                    displayPath: "/games",
                    entries: [{name: "fallback-sheet.xlsx", isDirectory: false}],
                    isDirectory: true,
                },
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse PAR sheet…"}));

        expect(await screen.findByText("Server filesystem browser")).toBeInTheDocument();
        expect(await screen.findByText("fallback-sheet.xlsx")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Select this folder"})).not.toBeInTheDocument();
        await user.click(screen.getByText("fallback-sheet.xlsx"));
        expect(screen.getByDisplayValue("/games/fallback-sheet.xlsx")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/native-browse")).toBe(false);
    });

    it("falls back to file-only server selection when the native PAR picker request fails", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "error", message: "Picker failed"}}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/games",
                    displayPath: "/games",
                    entries: [{name: "error-fallback-sheet.xlsx", isDirectory: false}],
                    isDirectory: true,
                },
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse PAR sheet…"}));

        expect(await screen.findByText("Server filesystem browser")).toBeInTheDocument();
        expect(await screen.findByText("error-fallback-sheet.xlsx")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Select this folder"})).not.toBeInTheDocument();
        await user.click(screen.getByText("error-fallback-sheet.xlsx"));
        expect(screen.getByDisplayValue("/games/error-fallback-sheet.xlsx")).toBeInTheDocument();
        const pickCall = calls.find((call) => call.url === "/api/home/fs/native-browse");
        expect(JSON.parse(String(pickCall?.init?.body))).toMatchObject({
            kind: "file",
            mode: "open",
            fileFilters: [{name: "PAR sheets", extensions: ["xlsx"]}],
        });
    });

    it("keeps the ordinary Import Project Browse picker generic for files and folders", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/games",
                    displayPath: "/games",
                    entries: [{name: "generic-sheet.xlsx", isDirectory: false}],
                    isDirectory: true,
                },
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        expect(await screen.findByText("generic-sheet.xlsx")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Select this folder"}));
        expect(screen.getByDisplayValue("/games")).toBeInTheDocument();

        // Mantine keeps the first modal mounted through its exit transition. Wait for that picker to
        // finish closing so the second selection cannot target its stale, now-closing entry.
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Browse…"}));
        await user.click(await screen.findByText("generic-sheet.xlsx"));
        expect(screen.getByDisplayValue("/games/generic-sheet.xlsx")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/native-browse")).toBe(false);
    });

    it("shows a not-recognized message for a path that isn't any known project type, without registering anything", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/registry/preview": () => ({ok: true, status: 200, body: {status: "unrecognized", path: "/tmp/nothing"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await user.type(screen.getByLabelText("Location", {exact: false}), "/tmp/nothing");
        await user.click(screen.getByRole("button", {name: "Detect"}));

        expect(await screen.findByText('"/tmp/nothing" doesn\'t look like any POKIE project type POKIE recognizes.')).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/projects/registry/register")).toBe(false);
    });

    it("accepts a Blueprint file path with no folder-only warning, requesting kind=any (not directory-only) for its resolved-path hint", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/games/blueprint.json", displayPath: "./blueprint.json", entries: [], isDirectory: false},
            }),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/blueprint.json", type: "blueprint", capabilities: [], suggestedName: "blueprint"},
            }),
            "/api/home/projects/registry/register": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    entry: {
                        location: "/games/blueprint.json",
                        name: "blueprint",
                        type: "blueprint",
                        capabilities: [],
                        origin: "external",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await user.type(screen.getByLabelText("Location", {exact: false}), "/games/blueprint.json");

        expect(await screen.findByText("Resolves to: /games/blueprint.json")).toBeInTheDocument();
        expect(screen.queryByText(/is a file, not a folder/)).not.toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=%2Fgames%2Fblueprint.json&kind=any")).toBe(true);

        await user.click(screen.getByRole("button", {name: "Detect"}));

        expect(await screen.findByText(/Detected a Blueprint at/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Register"}));

        expect(await screen.findByText('Registered "blueprint" -- it now shows up in Your projects above.')).toBeInTheDocument();
    });

    it("registers an imported Blueprint file and Open lands it on its Studio project workspace, same as a package", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/games/blueprint.json", displayPath: "./blueprint.json", entries: [], isDirectory: false},
            }),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/blueprint.json", type: "blueprint", capabilities: [], suggestedName: "blueprint"},
            }),
            "/api/home/projects/registry/register": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    entry: {
                        location: "/games/blueprint.json",
                        name: "blueprint",
                        type: "blueprint",
                        capabilities: [],
                        origin: "external",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/blueprint.json"}, manifest: {id: "blueprint", name: "blueprint", version: "0.1.0"}},
            }),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/games/blueprint.json", game: {id: "blueprint", name: "blueprint", version: "0.1.0"}},
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/blueprint.json", valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await user.type(screen.getByLabelText("Location", {exact: false}), "/games/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Detect"}));

        expect(await screen.findByText(/Detected a Blueprint at/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Register"}));
        expect(await screen.findByText('Registered "blueprint" -- it now shows up in Your projects above.')).toBeInTheDocument();

        // The freshly registered Blueprint row gets the same Open action a Package row does -- not just
        // Remove (StudioHomeService.openProject materializes a "blueprint" location into a real runtime
        // before loading it, so it reaches the exact same Project Dashboard a Package does).
        await user.click(screen.getByRole("button", {name: "Open"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: "/games/blueprint.json"})}),
                }),
            ),
        );
        expect(await screen.findByRole("heading", {name: "blueprint"})).toBeInTheDocument();
        expect(within(screen.getByRole("navigation", {name: "Sections"})).getByRole("button", {name: "Overview"})).toBeInTheDocument();
        expect(within(screen.getByRole("navigation", {name: "Sections"})).getByRole("button", {name: "Game Model"})).toBeInTheDocument();
    });

    it("accepts a package directory path with no file-only warning, requesting kind=any for its resolved-path hint", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/games/a", displayPath: "./a", entries: [{name: "package.json", isDirectory: false}], isDirectory: true},
            }),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/a", type: "tsPackage", capabilities: ["multiMode"], suggestedName: "a"},
            }),
            "/api/home/projects/registry/register": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    entry: {
                        location: "/games/a",
                        name: "a",
                        type: "tsPackage",
                        capabilities: ["multiMode"],
                        origin: "external",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await user.type(screen.getByLabelText("Location", {exact: false}), "/games/a");

        expect(await screen.findByText("Resolves to: /games/a")).toBeInTheDocument();
        expect(screen.queryByText(/is a directory, not a file/)).not.toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=%2Fgames%2Fa&kind=any")).toBe(true);

        await user.click(screen.getByRole("button", {name: "Detect"}));

        expect(await screen.findByText(/Detected a Package at/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Register"}));

        expect(await screen.findByText('Registered "a" -- it now shows up in Your projects above.')).toBeInTheDocument();
    });

    it("removes a registered entry after confirming, without deleting anything on disk", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {
                        location: "/games/a",
                        name: "A",
                        type: "tsPackage",
                        capabilities: [],
                        origin: "managed",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                ],
            }),
            "/api/home/projects/registry/remove": () => ({ok: true, status: 200, body: {status: "ok"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        // The Recommended Design Game model remains mounted while Projects is visible and legitimately
        // contains the symbol "A" too. Wait for this row's own visible action rather than globally
        // querying ambiguous text from the hidden editor.
        await user.click(await screen.findByRole("button", {name: "Remove"}));

        expect(await screen.findByText('Remove "A" from Projects? This only forgets it here -- nothing on disk is deleted.')).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Confirm"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/registry/remove",
                    init: expect.objectContaining({body: JSON.stringify({location: "/games/a"})}),
                }),
            ),
        );
        expect(await screen.findByText("No projects yet -- import or design one below.")).toBeInTheDocument();
    });

    it("repairs a missing managed entry from the rendered Relocate confirmation without leaving the old row behind", async () => {
        const user = userEvent.setup();
        const oldLocation = "/games/managed/blueprint.json";
        const newLocation = "/moved/managed/blueprint.json";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {
                        location: oldLocation,
                        name: "My managed game",
                        type: "blueprint",
                        capabilities: ["blueprint.build"],
                        origin: "managed",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "missing",
                    },
                ],
            }),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: newLocation, displayPath: newLocation, entries: [], isDirectory: false},
            }),
            "/api/home/projects/registry/relocate": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    entry: {
                        location: newLocation,
                        name: "My managed game",
                        type: "blueprint",
                        capabilities: ["blueprint.build"],
                        origin: "managed",
                        lastOpenedAt: "2026-01-02T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await screen.findByText("My managed game (missing)");
        await user.click(screen.getByRole("button", {name: "Relocate"}));
        await user.type(screen.getByLabelText("New location"), newLocation);
        const relocateButtons = screen.getAllByRole("button", {name: "Relocate"});
        await user.click(relocateButtons[relocateButtons.length - 1]);

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/registry/relocate",
                    init: expect.objectContaining({body: JSON.stringify({location: oldLocation, newLocation})}),
                }),
            ),
        );
        expect(await screen.findByText(newLocation)).toBeInTheDocument();
        expect(screen.queryByText("My managed game (missing)")).not.toBeInTheDocument();
        expect(screen.getAllByText("My managed game")).toHaveLength(1);
    });

    it("groups a large registry, searches it, and pages the bounded results", async () => {
        const user = userEvent.setup();
        const entries = Array.from({length: 12}, (_, index) => ({
            location: `/games/project-${index + 1}`,
            name: index === 0 ? "Missing registry" : `Project ${index + 1}`,
            type: index === 1 ? "blueprint" : "tsPackage" as const,
            capabilities: [],
            origin: "external" as const,
            lastOpenedAt: "2026-01-01T00:00:00.000Z",
            status: index === 0 ? "missing" : "ok" as const,
        }));
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: entries}),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        expect(await screen.findByText("Available projects")).toBeInTheDocument();
        expect(screen.getByText("Needs attention", {selector: ".project-registry-group *"})).toBeInTheDocument();
        expect(screen.getByText("Showing 1–10 of 12 projects")).toBeInTheDocument();
        expect(screen.queryByText("Project 12")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Next page"}));
        expect(await screen.findByText("Project 12")).toBeInTheDocument();
        expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

        await user.type(screen.getByLabelText("Search projects"), "Missing registry");
        expect(await screen.findByText("Showing 1–1 of 1 projects")).toBeInTheDocument();
        expect(screen.getByText("Missing registry (missing)")).toBeInTheDocument();
        expect(screen.queryByText("Project 12")).not.toBeInTheDocument();
    });

    it("keeps each project identity, availability, metadata, and actions labelled for the narrow card layout", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {location: "/games/available", name: "Available game", type: "tsPackage", capabilities: [], origin: "managed", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"},
                    {location: "/games/missing", name: "Missing game", type: "blueprint", capabilities: [], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "missing"},
                ],
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        const availableRow = (await screen.findByText("Available game")).closest("tr");
        const missingRow = screen.getByText("Missing game (missing)").closest("tr");
        expect(availableRow).toHaveClass("project-registry-entry");
        expect(within(availableRow as HTMLElement).getByText("Available")).toBeInTheDocument();
        expect(within(missingRow as HTMLElement).getByText("Needs attention")).toBeInTheDocument();
        expect(within(availableRow as HTMLElement).getByText("Available game").closest("td")).toHaveAttribute("data-label", "Project");
        expect(within(availableRow as HTMLElement).getByRole("button", {name: "Open"}).closest("td")).toHaveAttribute("data-label", "Actions");
        expect(within(missingRow as HTMLElement).getByRole("checkbox", {name: "Select missing project Missing game"}).closest("td")).toHaveAttribute("data-label", "Select");
    });

    it.each([
        ["outcomeLibrary", "Outcome library", "/games/outcomes"],
        ["stakeAdapter", "Stake Engine export", "/games/stake-export"],
    ] as const)("opens an available %s registry entry through the public Project workspace action", async (type, name, location) => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [{location, name, type, capabilities: [], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"}],
            }),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: location}},
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        const row = (await screen.findAllByText(name))
            .map((element) => element.closest("tr"))
            .find((candidate): candidate is HTMLTableRowElement => candidate !== null) as HTMLElement;
        expect(within(row).getByRole("button", {name: "Open"})).toBeInTheDocument();
        await user.click(within(row).getByRole("button", {name: "Open"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: location})}),
                }),
            ),
        );
    });

    it("opens an available PAR workbook into its dashboard Build/Export card", async () => {
        const user = userEvent.setup();
        const location = "/games/sheet.xlsx";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [{location, name: "PAR sheet", type: "parWorkbook", capabilities: ["parWorkbook.exchange"], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"}],
            }),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: location}},
            }),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "artifact",
                    projectRoot: location,
                    project: {type: "parWorkbook", rootPath: location, capabilities: ["parWorkbook.exchange"], provenance: "registered workbook"},
                },
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: location, valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/artifacts/targets": () => ({
                ok: true,
                status: 200,
                body: [
                    {target: "tsPackage", supported: false, state: "diagnostic-required", diagnostic: "A TypeScript package requires a Blueprint.", unsupportedNotes: []},
                    {target: "outcomeLibrary", supported: false, state: "diagnostic-required", diagnostic: "An Outcome library requires a runtime source.", unsupportedNotes: []},
                    {target: "stakeAdapter", supported: false, state: "diagnostic-required", diagnostic: "A Stake export requires an Outcome library.", unsupportedNotes: []},
                    {target: "parWorkbook", supported: true, state: "supported", unsupportedNotes: []},
                ],
            }),
            "/api/project/artifacts/preview": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    target: "parWorkbook",
                    destination: "/games/republished-sheet.xlsx",
                    destinationKind: "file",
                    plannedOutputs: ["PAR workbook (.xlsx) file"],
                    sourceType: "parWorkbook",
                },
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        const row = (await screen.findAllByText("PAR sheet"))
            .map((element) => element.closest("tr"))
            .find((candidate): candidate is HTMLTableRowElement => candidate !== null) as HTMLElement;
        await user.click(within(row).getByRole("button", {name: "Open"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: location})}),
                }),
            ),
        );
        expect(await screen.findByRole("heading", {name: "PAR sheet"})).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Build/Export"}));

        const buildArtifactSection = screen.getByText("Build artifact").closest("fieldset") as HTMLElement;
        expect(await within(buildArtifactSection).findByText("PAR sheet (.xlsx)")).toBeInTheDocument();
        expect(within(buildArtifactSection).getByText(/republished-sheet\.xlsx/)).toBeInTheDocument();
        expect(within(buildArtifactSection).getByRole("button", {name: "Build"})).toBeEnabled();
        expect(screen.queryByText(/WASM/)).not.toBeInTheDocument();
    });

    it("uses the labelled card layout while desktop navigation leaves the Projects panel too narrow for every action", () => {
        const stylesheet = readFileSync(join(__dirname, "../../../../../../cli/studio-client/src/global.css"), "utf8");

        // At the 1050px audit viewport, AppShell's persistent navigation leaves about 790px for the
        // panel. Keep the Open button in its labelled card rather than clipping the sixth table column.
        expect(stylesheet).toMatch(/@media \(max-width: 75em\)[\s\S]*?\.project-registry-entry > td \{[\s\S]*?display: grid;/);
        expect(stylesheet).toMatch(/\.project-registry-entry > td \{[\s\S]*?min-width: 0;/);
        expect(stylesheet).toMatch(/@media \(max-width: 48em\)[\s\S]*?\.project-registry-entry > td,[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
    });

    it("removes selected missing registrations together after confirmation", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {location: "/games/missing-a", name: "Missing A", type: "tsPackage", capabilities: [], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "missing"},
                    {location: "/games/missing-b", name: "Missing B", type: "blueprint", capabilities: [], origin: "managed", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "missing"},
                    {location: "/games/current", name: "Current", type: "tsPackage", capabilities: [], origin: "managed", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"},
                ],
            }),
            "/api/home/projects/registry/remove": () => ({ok: true, status: 200, body: {status: "ok"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        await screen.findByText("Missing A (missing)");
        await user.click(screen.getByRole("checkbox", {name: "Select missing projects on this page"}));
        await user.click(screen.getByRole("button", {name: "Remove selected missing (2)"}));
        expect(await screen.findByText("Remove 2 missing projects from Projects? This only forgets them here -- nothing on disk is deleted.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Confirm"}));

        await waitFor(() => expect(calls.filter((call) => call.url === "/api/home/projects/registry/remove")).toHaveLength(2));
        expect(await screen.findByText("Current")).toBeInTheDocument();
        expect(screen.queryByText("Missing A (missing)")).not.toBeInTheDocument();
        expect(screen.queryByText("Missing B (missing)")).not.toBeInTheDocument();
    });
});
