import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// Covers the Import Project flow this step (P3-POLISH-13) added to the Projects tab -- Detect (a
// read-only preview, never registering anything) -> Register for anything with an "open" story, or
// straight to Design Game's own PAR Sheet Import/Export panel for a recognized PAR workbook, which has
// none. HomePage.test.tsx/openProjectGuard.test.tsx/navigationGuardModal.test.tsx already cover opening
// an already-registered row and the dirty-draft guard around it -- this file is scoped to what's unique
// to Import Project itself.

async function goToProjects(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(await screen.findByRole("button", {name: "Projects"}));
    await screen.findByText("Import Project");
}

describe("ProjectsPanel: Import Project", () => {
    it("detects a recognized package, prefills the suggested name, and Register adds it to the list", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
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
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

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

    it("routes a recognized PAR sheet to Design Game's own PAR Sheet Import/Export panel instead of registering it", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/sheet.xlsx", type: "parWorkbook", capabilities: [], suggestedName: "sheet"},
            }),
            "/api/home/blueprints/par-import": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", path: "/games/sheet.xlsx", blueprint: {manifest: {id: "sheet", name: "Sheet", version: "0.1.0"}}, errors: [], warnings: []},
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await user.type(screen.getByLabelText("Location", {exact: false}), "/games/sheet.xlsx");
        await user.click(screen.getByRole("button", {name: "Detect"}));

        expect(await screen.findByText(/This is a PAR sheet workbook/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Register"})).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Open in Design Game"}));

        await waitFor(() => expect(screen.getByRole("button", {name: "Design Game"})).toHaveAttribute("aria-current", "page"));
        // BlueprintEditorPage's own initialParSheetPath auto-runs Import against the detected path --
        // the same "arrive already on the right step" treatment initialPath gives a regular blueprint.
        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/blueprints/par-import",
                    init: expect.objectContaining({body: JSON.stringify({path: "/games/sheet.xlsx"})}),
                }),
            ),
        );
    });

    it("shows a not-recognized message for a path that isn't any known project type, without registering anything", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
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
});
