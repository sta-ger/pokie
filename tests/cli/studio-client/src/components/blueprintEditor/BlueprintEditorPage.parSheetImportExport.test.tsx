import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

const IMPORT_URL = "/api/home/blueprints/par-import";
const EXPORT_URL = "/api/home/blueprints/par-export";
const BUILD_PREVIEW_URL = "/api/home/blueprints/build-preview";

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve({ok: status < 400, status, json: () => Promise.resolve(body)});
}

function stepperStep(label: string, description: string): RegExp {
    return new RegExp(`${label}.*${description}`);
}

const IMPORTED_BLUEPRINT = {
    manifest: {id: "imported-game", name: "Imported Game", version: "0.2.0"},
    reels: 2,
    rows: 2,
    symbols: ["A", "B"],
    paytable: {A: {2: 5}},
};

async function goToImportStep(): Promise<void> {
    await screen.findByText("PAR Sheet Import / Export");
}

describe("BlueprintEditorPage - PAR Sheet Import/Export", () => {
    it("imports a PAR sheet successfully, previews the canonical model, and reaches Apply/Export", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({
                    status: "ok",
                    path: "/games/in.par.xlsx",
                    blueprint: IMPORTED_BLUEPRINT,
                    provenance: {pokieVersion: "1.2.0", exportedAt: "2026-01-01", source: "blueprint.json"},
                    errors: [],
                    warnings: [],
                });
            }
            if (url === BUILD_PREVIEW_URL) {
                return jsonResponse({
                    status: "ok",
                    warnings: [],
                    manifest: IMPORTED_BLUEPRINT.manifest,
                    reels: 2,
                    rows: 2,
                    symbolsCount: 2,
                    blueprintHash: "sha256:abc",
                    expectedFiles: ["package.json"],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();

        await user.type(screen.getByLabelText("PAR sheet path"), "./in.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));

        expect(await screen.findByText("Imported successfully")).toBeInTheDocument();
        expect(screen.getByText('Exported by pokie v1.2.0 on 2026-01-01 from "blueprint.json".')).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to preview canonical model"}));
        await user.click(screen.getByRole("button", {name: "Preview canonical model"}));

        await waitFor(() => expect(screen.getByText(/Imported Game/)).toBeInTheDocument());
        expect(screen.getByText(/Reels x rows: 2 x 2/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to Apply / Export"}));
        expect(screen.getByText(/\/games\/in\.par\.xlsx/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Apply"})).not.toBeDisabled();
    });

    it("shows a partial-import state with warnings, still allowing Apply", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({
                    status: "ok",
                    path: "/games/in.par.xlsx",
                    blueprint: IMPORTED_BLUEPRINT,
                    errors: [],
                    warnings: [{code: "parsheet-provenance-missing", severity: "warning", message: 'This file has no "Meta" sheet.'}],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.type(screen.getByLabelText("PAR sheet path"), "./in.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));

        expect(await screen.findByText("Imported with warnings")).toBeInTheDocument();
        expect(screen.getByText(/This file has no "Meta" sheet\./)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));
        expect(screen.getByRole("button", {name: "Apply"})).not.toBeDisabled();
    });

    it("blocks Apply and shows a clear invalid-sheet state when the import has errors", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({
                    status: "ok",
                    path: "/games/in.par.xlsx",
                    blueprint: IMPORTED_BLUEPRINT,
                    errors: [{code: "parsheet-missing-sheet", severity: "error", message: 'Required sheet "Paytable" is missing.'}],
                    warnings: [],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.type(screen.getByLabelText("PAR sheet path"), "./in.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));

        expect(await screen.findByText("This sheet has unsupported/invalid data")).toBeInTheDocument();
        expect(screen.getByText(/Required sheet "Paytable" is missing\./)).toBeInTheDocument();
        // Preview canonical model is unreachable for an invalid import.
        expect(screen.queryByRole("button", {name: "Continue to preview canonical model"})).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));
        expect(screen.getByRole("button", {name: "Apply"})).toBeDisabled();
    });

    it("shows an unsupported-data state when the current blueprint's reel source can't be exported to a PAR sheet", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === EXPORT_URL) {
                return jsonResponse({
                    status: "invalid",
                    errors: [{code: "parsheet-unsupported-reel-source", severity: "error", message: "Uses reelStripGeneration, which PAR export can't represent."}],
                    warnings: [],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));

        await user.type(screen.getByLabelText("Export to path"), "./out.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Export"}));

        expect(await screen.findByText("This blueprint has unsupported data")).toBeInTheDocument();
        expect(screen.getByText(/Uses reelStripGeneration, which PAR export can't represent\./)).toBeInTheDocument();
    });

    it("applies an imported blueprint, replacing the one currently open in the editor", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({status: "ok", path: "/games/in.par.xlsx", blueprint: IMPORTED_BLUEPRINT, errors: [], warnings: []});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.type(screen.getByLabelText("PAR sheet path"), "./in.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));
        await user.click(screen.getByRole("button", {name: "Apply"}));

        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", {name: "Confirm"}));

        // The editor's own Metadata field (Form mode) now reflects the imported blueprint -- a real
        // wholesale replace, not just a local view of the import result.
        await waitFor(() => expect(screen.getByDisplayValue("imported-game")).toBeInTheDocument());
    });

    it("exports the current blueprint successfully, and handles a conflict via Overwrite", async () => {
        const user = userEvent.setup();
        let firstAttempt = true;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === EXPORT_URL) {
                const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {overwrite?: boolean};
                if (firstAttempt && !body.overwrite) {
                    firstAttempt = false;
                    return jsonResponse({status: "conflict", path: "/games/out.par.xlsx", error: "already exists"}, 409);
                }
                return jsonResponse({status: "ok", path: "/games/out.par.xlsx", warnings: []});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));

        await user.type(screen.getByLabelText("Export to path"), "./out.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Export"}));

        expect(await screen.findByText("already exists")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Overwrite"}));

        expect(await screen.findByText("Exported successfully")).toBeInTheDocument();
    });

    it("drops a stale export response when the blueprint is edited elsewhere while the request is in flight", async () => {
        const user = userEvent.setup();
        let resolveExport: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            if (url === EXPORT_URL) {
                return new Promise((res) => {
                    resolveExport = res;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));
        await user.type(screen.getByLabelText("Export to path"), "./out.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Export"}));
        expect(await screen.findByText("Writing…")).toBeInTheDocument();

        // An edit elsewhere in the form (the top-level Symbols section) happens while the export request
        // is still in flight -- the blueprint this export was requested for no longer matches the
        // editor's current one.
        await user.type(screen.getByLabelText("New symbol id"), "wild");
        await user.click(screen.getByRole("button", {name: "Add symbol"}));
        await waitFor(() => expect(screen.queryByText("Writing…")).not.toBeInTheDocument());

        resolveExport?.(await jsonResponse({status: "ok", path: "/games/out.par.xlsx", warnings: []}));
        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 100);
        });
        expect(screen.queryByText("Exported successfully")).not.toBeInTheDocument();
    });

    it("clears a shown import result as soon as the path is changed (file switch), without needing a new Import click", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({status: "ok", path: "/games/in.par.xlsx", blueprint: IMPORTED_BLUEPRINT, errors: [], warnings: []});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.type(screen.getByLabelText("PAR sheet path"), "./in.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        // Back to Import to change the path -- the shown Diagnose & map result was for the *previous*
        // file and must not survive picking a different one.
        await user.click(screen.getByRole("button", {name: stepperStep("Import", "Read a PAR sheet")}));
        await user.type(screen.getByLabelText("PAR sheet path"), "-changed");

        await user.click(screen.getByRole("button", {name: stepperStep("Diagnose & map", "Issues & provenance")}));
        expect(screen.queryByText("Imported successfully")).not.toBeInTheDocument();
    });

    it("clears all import/export state when the blueprint is replaced (New Blueprint) -- project switch cleanup", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({status: "ok", path: "/games/in.par.xlsx", blueprint: IMPORTED_BLUEPRINT, errors: [], warnings: []});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.type(screen.getByLabelText("PAR sheet path"), "./in.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));

        // A fresh remount (via the parent's own key={formGeneration}) -- back to a clean Import step,
        // with no trace of the previous blueprint's import result.
        expect(screen.queryByText("Imported successfully")).not.toBeInTheDocument();
        expect(screen.getByLabelText("PAR sheet path")).toHaveValue("");
        expect(screen.queryByRole("button", {name: stepperStep("Diagnose & map", "Issues & provenance")})).toBeDisabled();
    });
});
