import {screen, waitFor} from "@testing-library/react";
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

        await screen.findByText("A");
        await user.click(screen.getByRole("button", {name: "Remove"}));

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
});
