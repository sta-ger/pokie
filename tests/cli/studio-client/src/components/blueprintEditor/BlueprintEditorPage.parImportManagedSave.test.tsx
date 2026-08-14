import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// Covers the guided Design Game editor's PAR Apply -> first Save lifecycle end to end: applying a PAR
// sheet import must not leave the imported .xlsx workbook as the draft's own authoritative editable
// source -- the first guided Save has to create a real managed Blueprint Project (via
// POST /api/home/blueprints/save-managed) and record the workbook only as that project's own provenance,
// visibly labelled "Imported from PAR" (see BlueprintEditorPage.tsx's own importedFromParSheetPath doc
// comment). Mirrors BlueprintEditorPage.parSheetImportExport.test.tsx's own fixtures/conventions, just
// exercised through the guided route (`/home/design`) instead of the non-guided default.

const IMPORT_URL = "/api/home/blueprints/par-import";
const VALIDATE_URL = "/api/home/blueprints/validate";
const SAVE_MANAGED_URL = "/api/home/blueprints/save-managed";
const REGISTRY_URL = "/api/home/projects/registry";

const IMPORTED_BLUEPRINT = {
    manifest: {id: "imported-game", name: "Imported Game", version: "0.2.0"},
    reels: 2,
    rows: 2,
    symbols: ["A", "B"],
    paytable: {A: {2: 5}},
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
        const registryRequestStates: boolean[] = [];
        let managedProjectSaved = false;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === REGISTRY_URL) {
                registryRequestStates.push(managedProjectSaved);
                return jsonResponse(
                    managedProjectSaved
                        ? [
                            {
                                location: "/POKIE Projects/imported-game/blueprint.json",
                                name: "imported-game",
                                type: "blueprint",
                                capabilities: [],
                                origin: "managed",
                                lastOpenedAt: "2026-01-01T00:00:00.000Z",
                                status: "ok",
                                importedFromParSheetPath: "/games/in.par.xlsx",
                            },
                        ]
                        : [],
                );
            }
            if (path === IMPORT_URL) {
                return jsonResponse({status: "ok", path: "/games/in.par.xlsx", blueprint: IMPORTED_BLUEPRINT, errors: [], warnings: []});
            }
            if (path === VALIDATE_URL) {
                return jsonResponse({status: "ok", warnings: []});
            }
            if (path === SAVE_MANAGED_URL) {
                const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {blueprint: unknown; sourceWorkbookPath?: string};
                saveManagedBodies.push(body);
                managedProjectSaved = true;
                return jsonResponse({
                    status: "ok",
                    path: "/POKIE Projects/imported-game/blueprint.json",
                    name: "imported-game",
                    blueprintHash: "sha256:abc",
                    sourceWorkbookPath: body.sourceWorkbookPath,
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await waitFor(() => expect(registryRequestStates).toEqual([false]));
        await applyParImport(user);

        // The freshly-applied draft already shows its own provenance before it's ever saved.
        expect(screen.getByText("Imported from PAR")).toBeInTheDocument();
        expect(screen.getByText(/Source:.*\/games\/in\.par\.xlsx/)).toBeInTheDocument();

        await user.click(screen.getAllByRole("button", {name: "Validate"})[0]);
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());

        await user.click(screen.getAllByRole("button", {name: "Save"})[0]);

        await waitFor(() => expect(saveManagedBodies).toHaveLength(1));
        expect(saveManagedBodies[0].sourceWorkbookPath).toBe("/games/in.par.xlsx");
        expect(await screen.findByText('Saved to "/POKIE Projects/imported-game/blueprint.json".')).toBeInTheDocument();

        // The label survives the save -- this project's identity, not a one-request-only fact.
        expect(screen.getAllByText("Imported from PAR")).toHaveLength(2);
        expect(screen.getByText(/Source:.*\/games\/in\.par\.xlsx/)).toBeInTheDocument();

        // Projects stays mounted while Design Game saves. The managed-save notification must refresh
        // the panel's already-fetched list rather than leaving its empty state stale until a reload.
        await waitFor(() => expect(registryRequestStates).toEqual([false, true]));
        await user.click(screen.getByRole("button", {name: "Projects"}));
        expect(await screen.findByText("imported-game")).toBeInTheDocument();
        expect(screen.getByText("Managed")).toBeInTheDocument();
    });

    it("does not show the 'Imported from PAR' label, and never sends sourceWorkbookPath, for an ordinary first Save with no PAR import behind it", async () => {
        const user = userEvent.setup();
        const saveManagedBodies: Array<{blueprint: unknown; sourceWorkbookPath?: string}> = [];
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === REGISTRY_URL) {
                return jsonResponse([]);
            }
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

        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        expect(screen.queryByText("Imported from PAR")).not.toBeInTheDocument();

        await user.click(screen.getAllByRole("button", {name: "Validate"})[0]);
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());
        await user.click(screen.getAllByRole("button", {name: "Save"})[0]);

        await waitFor(() => expect(saveManagedBodies).toHaveLength(1));
        expect(saveManagedBodies[0].sourceWorkbookPath).toBeUndefined();
        expect(screen.queryByText("Imported from PAR")).not.toBeInTheDocument();
    });
});
