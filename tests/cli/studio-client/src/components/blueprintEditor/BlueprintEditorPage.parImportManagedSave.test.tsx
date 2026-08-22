import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

// Covers the guided Design Game editor's PAR Apply -> first Save lifecycle end to end: applying a PAR
// sheet import must not leave the imported .xlsx workbook as the draft's own authoritative editable
// source -- the first guided Save has to create a real managed Blueprint Project (via
// POST /api/home/blueprints/save-managed) and record the workbook only as that project's own provenance,
// visibly labelled "Imported from PAR" (see BlueprintEditorPage.tsx's own importedFromParSheetPath doc
// comment). Mirrors BlueprintEditorPage.parSheetImportExport.test.tsx's own fixtures/conventions while
// keeping the assertion focused on the guided editor's primary action.

const IMPORT_URL = "/api/home/blueprints/par-import";
const VALIDATE_URL = "/api/home/blueprints/validate";
const SAVE_MANAGED_URL = "/api/home/blueprints/save-managed";
const OPEN_PROJECT_URL = "/api/home/projects/open";

const IMPORTED_BLUEPRINT = {
    manifest: {id: "imported-game", name: "Imported Game", version: "0.2.0"},
    reels: 2,
    rows: 2,
    symbols: ["A", "B"],
    paytable: {A: {2: 5}},
};

const REGISTERED_PROJECT = {
    location: "/POKIE Projects/imported-game/blueprint.json",
    name: "imported-game",
    type: "blueprint" as const,
    capabilities: [],
    origin: "managed" as const,
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    status: "ok" as const,
    importedFromParSheetPath: "/games/in.par.xlsx",
};

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve({ok: status < 400, status, json: () => Promise.resolve(body)});
}

function stepperStep(label: string, description: string): RegExp {
    return new RegExp(`${label}.*${description}`);
}

async function applyParImport(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("button", {name: /Show advanced options/}));
    await user.type(screen.getByLabelText("PAR sheet path"), "./in.par.xlsx");
    await user.click(screen.getByRole("button", {name: "Import"}));
    await screen.findByText("Imported successfully");

    await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));
    await user.click(screen.getByRole("button", {name: "Apply"}));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", {name: "Confirm"}));
}

describe("BlueprintEditorPage (guided) - PAR Apply -> managed Save lifecycle", () => {
    it("saves the imported blueprint as a managed Blueprint Project, recording the workbook only as provenance, and shows an 'Imported from PAR' label", async () => {
        const user = userEvent.setup();
        const saveManagedBodies: Array<{blueprint: unknown; sourceWorkbookPath?: string}> = [];
        const savedProjects: unknown[] = [];
        const openedProjectLocations: string[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === IMPORT_URL) {
                return jsonResponse({status: "ok", path: "/games/in.par.xlsx", blueprint: IMPORTED_BLUEPRINT, errors: [], warnings: []});
            }
            if (path === VALIDATE_URL) {
                return jsonResponse({status: "ok", warnings: []});
            }
            if (path === SAVE_MANAGED_URL) {
                const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {blueprint: unknown; sourceWorkbookPath?: string};
                saveManagedBodies.push(body);
                return jsonResponse({
                    status: "ok",
                    path: "/POKIE Projects/imported-game/blueprint.json",
                    name: "imported-game",
                    blueprintHash: "sha256:abc",
                    sourceWorkbookPath: body.sourceWorkbookPath,
                    registeredProject: REGISTERED_PROJECT,
                });
            }
            if (path === OPEN_PROJECT_URL) {
                openedProjectLocations.push(JSON.parse((init?.body as string | undefined) ?? "{}").projectRoot as string);
                return jsonResponse({context: {status: "loaded"}, manifest: IMPORTED_BLUEPRINT.manifest});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage guided onManagedProjectSaved={(project) => savedProjects.push(project)} />, {fetchImpl});
        await applyParImport(user);

        // The freshly-applied draft already shows its own provenance before it's ever saved.
        expect(screen.getByText("Imported from PAR")).toBeInTheDocument();
        expect(screen.getByText(/Source:.*\/games\/in\.par\.xlsx/)).toBeInTheDocument();

        // Design Game validates as part of its single primary action; it deliberately has no
        // separate Configure -> Validate -> Save sequence.
        await user.click(screen.getByRole("button", {name: "Create Project"}));

        await waitFor(() => expect(saveManagedBodies).toHaveLength(1));
        expect(saveManagedBodies[0].sourceWorkbookPath).toBe("/games/in.par.xlsx");
        // A successful managed save immediately opens its Workspace, which deliberately clears the
        // creator-only success message before navigation. The observable persistence boundary is the
        // exact project location supplied to the Workspace-open request.
        await waitFor(() => expect(openedProjectLocations).toEqual([REGISTERED_PROJECT.location]));

        // The label survives the save -- this project's identity, not a one-request-only fact.
        expect(screen.getByText("Imported from PAR")).toBeInTheDocument();
        expect(screen.getByText(/Source:.*\/games\/in\.par\.xlsx/)).toBeInTheDocument();
        expect(savedProjects).toEqual([REGISTERED_PROJECT]);
    });

    it("does not show the 'Imported from PAR' label, and never sends sourceWorkbookPath, for an ordinary first Save with no PAR import behind it", async () => {
        const user = userEvent.setup();
        const saveManagedBodies: Array<{blueprint: unknown; sourceWorkbookPath?: string}> = [];
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === VALIDATE_URL) {
                return jsonResponse({status: "ok", warnings: []});
            }
            if (path === SAVE_MANAGED_URL) {
                const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {blueprint: unknown; sourceWorkbookPath?: string};
                saveManagedBodies.push(body);
                return jsonResponse({status: "ok", path: "/POKIE Projects/blueprint/blueprint.json", name: "blueprint", blueprintHash: "sha256:abc"});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        expect(screen.queryByText("Imported from PAR")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Create Project"}));

        await waitFor(() => expect(saveManagedBodies).toHaveLength(1));
        expect(saveManagedBodies[0].sourceWorkbookPath).toBeUndefined();
        expect(screen.queryByText("Imported from PAR")).not.toBeInTheDocument();
    });
});
