import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {act} from "react";
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

const IMPORTED_BLUEPRINT_B = {
    manifest: {id: "imported-game-b", name: "Imported Game B", version: "0.3.0"},
    reels: 3,
    rows: 3,
    symbols: ["C", "D"],
    paytable: {C: {2: 7}},
};

const CONVERSION_EVIDENCE = {
    metaSheet: [["Key", "Value"], ["Blueprint Hash", "sha256:abc"]],
    facts: [],
    losslessEligible: true,
    importedBlueprintHash: "sha256:abc",
    provenanceHashMatches: true,
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
                    conversionEvidence: CONVERSION_EVIDENCE,
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
                    projectRoot: "/games/imported-game",
                    destinationHasContent: false,
                    createFiles: ["package.json"],
                    updateFiles: [],
                    deleteFiles: [],
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

        await user.click(screen.getByRole("button", {name: "Continue to Preview canonical model"}));
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
                    conversionEvidence: {...CONVERSION_EVIDENCE, losslessEligible: false},
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

    it("reflects an accepted native PAR workbook selection in the rendered path field", async () => {
        const user = userEvent.setup();
        const selectedPath = "/physical-fixtures/starter.par.xlsx";
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/home/fs/default-location") {
                return jsonResponse({status: "unavailable"});
            }
            if (url === "/api/home/fs/native-browse/availability") {
                return jsonResponse({status: "available"});
            }
            if (url === "/api/home/fs/native-browse") {
                return jsonResponse({status: "selected", path: selectedPath});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();

        const parSheetPathInput = screen.getByLabelText("PAR sheet path");
        await user.click(within(parSheetPathInput.closest(".mantine-Stack-root") as HTMLElement).getByRole("button", {name: "Browse…"}));

        expect(parSheetPathInput).toHaveValue(selectedPath);
    });

    it("blocks Apply and shows a clear invalid-sheet state when the import has errors", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({
                    status: "ok",
                    path: "/games/in.par.xlsx",
                    blueprint: IMPORTED_BLUEPRINT,
                    conversionEvidence: CONVERSION_EVIDENCE,
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
        expect(screen.queryByRole("button", {name: "Continue to Preview canonical model"})).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));
        expect(screen.getByRole("button", {name: "Apply"})).toBeDisabled();
    });

    it("shows an actionable unsupported-data state when a generated reel cannot be materialized", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === EXPORT_URL) {
                return jsonResponse({
                    status: "invalid",
                    errors: [{code: "parsheet-reel-generation-failed", severity: "error", message: "reelStripGeneration[1] could not satisfy its constraints."}],
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
        expect(screen.getByText(/reelStripGeneration\[1\] could not satisfy its constraints\./)).toBeInTheDocument();
    });

    it("applies an imported blueprint, replacing the one currently open in the editor", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({status: "ok", path: "/games/in.par.xlsx", blueprint: IMPORTED_BLUEPRINT, conversionEvidence: CONVERSION_EVIDENCE, errors: [], warnings: []});
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

    it("[P2-POLISH-04] Export to path starts blank with its example placeholder for a brand-new blueprint (no known source path to infer from), but initializes to a real value derived from the blueprint's own source once one is known (via Apply)", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({status: "ok", path: "/games/in.par.xlsx", blueprint: IMPORTED_BLUEPRINT, conversionEvidence: CONVERSION_EVIDENCE, errors: [], warnings: []});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();

        // Brand-new blueprint, never loaded/imported from anywhere -- genuinely un-inferable, so Export
        // to path starts blank with its illustrative placeholder, same as PAR sheet path above.
        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));
        const freshExportInput = screen.getByLabelText("Export to path") as HTMLInputElement;
        expect(freshExportInput.value).toBe("");
        expect(freshExportInput).toHaveAttribute("placeholder", "./game.par.xlsx");

        await user.click(screen.getByRole("button", {name: stepperStep("Import", "Read a PAR sheet")}));
        await user.type(screen.getByLabelText("PAR sheet path"), "./in.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));
        await user.click(screen.getByRole("button", {name: "Apply"}));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", {name: "Confirm"}));

        // BlueprintEditorPage's own `blueprintPath` (now the just-imported "/games/in.par.xlsx") is
        // threaded into this remounted panel as a real resolver-derived default -- mirrors ParCommand.ts's
        // own `defaultParSheetPath` convention (same directory/basename, ".par.xlsx" extension), not a
        // fabricated guess. A real, live value, not placeholder text.
        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));
        const exportInput = screen.getByLabelText("Export to path") as HTMLInputElement;
        expect(exportInput.value).toBe("/games/in.par.xlsx");
        expect(exportInput).toHaveAttribute("placeholder", "./game.par.xlsx");
    });

    it("keeps an occupied export destination as a conflict and never offers overwrite", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            if (url === EXPORT_URL) {
                const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {overwrite?: boolean};
                expect(body.overwrite).toBe(false);
                return jsonResponse({status: "conflict", path: "/games/out.par.xlsx", error: "already exists"}, 409);
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.click(screen.getByRole("button", {name: stepperStep("Apply / Export", "Commit or write out")}));

        await user.type(screen.getByLabelText("Export to path"), "./out.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Export"}));

        expect(await screen.findByText(/already exists/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Overwrite"})).not.toBeInTheDocument();
        expect(screen.getByText(/Choose a different export path; existing artifacts are never overwritten\./)).toBeInTheDocument();
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

        await act(async () => {
            resolveExport?.(await jsonResponse({status: "ok", path: "/games/out.par.xlsx", warnings: []}));
            await new Promise((resolveTimeout) => {
                setTimeout(resolveTimeout, 100);
            });
        });
        expect(screen.queryByText("Exported successfully")).not.toBeInTheDocument();
    });

    it("clears a shown import result as soon as the path is changed (file switch), without needing a new Import click", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({status: "ok", path: "/games/in.par.xlsx", blueprint: IMPORTED_BLUEPRINT, conversionEvidence: CONVERSION_EVIDENCE, errors: [], warnings: []});
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
                return jsonResponse({status: "ok", path: "/games/in.par.xlsx", blueprint: IMPORTED_BLUEPRINT, conversionEvidence: CONVERSION_EVIDENCE, errors: [], warnings: []});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.type(screen.getByLabelText("PAR sheet path"), "./in.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        // A successful import already marks the draft clean (see handleApplyImportedBlueprint's own doc
        // comment), so the New flow's own dirty-confirm gate doesn't trigger; "New Blueprint" opens
        // straight to the Blank/Generate random/Load existing choice (see NewBlueprintDialog's own doc
        // comment).
        await user.click(screen.getByRole("button", {name: "Choose a different start"}));
        await user.click(await screen.findByRole("button", {name: "Start with a blank game"}));

        // A fresh remount (via the parent's own key={formGeneration}) -- back to a clean Import step,
        // with no trace of the previous blueprint's import result.
        expect(screen.queryByText("Imported successfully")).not.toBeInTheDocument();
        expect(screen.getByLabelText("PAR sheet path")).toHaveValue("");
        expect(screen.queryByRole("button", {name: stepperStep("Diagnose & map", "Issues & provenance")})).toBeDisabled();
    });

    it("ignores a late canonical-preview response for file A once file B has been imported", async () => {
        const user = userEvent.setup();
        let resolvePreviewA: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === IMPORT_URL) {
                const {path} = JSON.parse((init?.body as string | undefined) ?? "{}") as {path?: string};
                if (path === "./b.par.xlsx") {
                    return jsonResponse({status: "ok", path: "/games/b.par.xlsx", blueprint: IMPORTED_BLUEPRINT_B, errors: [], warnings: []});
                }
                return jsonResponse({status: "ok", path: "/games/a.par.xlsx", blueprint: IMPORTED_BLUEPRINT, errors: [], warnings: []});
            }
            if (url === BUILD_PREVIEW_URL) {
                return new Promise((res) => {
                    resolvePreviewA = res;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.type(screen.getByLabelText("PAR sheet path"), "./a.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        await user.click(screen.getByRole("button", {name: "Continue to Preview canonical model"}));
        await user.click(screen.getByRole("button", {name: "Preview canonical model"}));
        await screen.findByText("Working…");

        // Re-import a different file (B) while A's preview request is still pending.
        await user.click(screen.getByRole("button", {name: stepperStep("Import", "Read a PAR sheet")}));
        await user.clear(screen.getByLabelText("PAR sheet path"));
        await user.type(screen.getByLabelText("PAR sheet path"), "./b.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        await user.click(screen.getByRole("button", {name: stepperStep("Preview canonical model", "What it becomes")}));
        expect(screen.queryByText("Working…")).not.toBeInTheDocument();
        expect(screen.queryByText(/id: "imported-game"/)).not.toBeInTheDocument();

        // A's late response now arrives -- it must be ignored, since B has since been imported.
        await act(async () => {
            resolvePreviewA?.(
                await jsonResponse({
                    status: "ok",
                    warnings: [],
                    manifest: IMPORTED_BLUEPRINT.manifest,
                    reels: 2,
                    rows: 2,
                    symbolsCount: 2,
                    blueprintHash: "sha256:a",
                    expectedFiles: ["package.json"],
                    projectRoot: "/games/imported-game",
                    destinationHasContent: false,
                    createFiles: ["package.json"],
                    updateFiles: [],
                    deleteFiles: [],
                }),
            );
            await new Promise((resolveTimeout) => {
                setTimeout(resolveTimeout, 50);
            });
        });
        expect(screen.queryByText(/id: "imported-game"/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Apply / Export"})).not.toBeInTheDocument();
    });

    it("clears an already-shown canonical preview when the import file changes", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            if (url === IMPORT_URL) {
                const {path} = JSON.parse((init?.body as string | undefined) ?? "{}") as {path?: string};
                if (path === "./b.par.xlsx") {
                    return jsonResponse({status: "ok", path: "/games/b.par.xlsx", blueprint: IMPORTED_BLUEPRINT_B, errors: [], warnings: []});
                }
                return jsonResponse({status: "ok", path: "/games/a.par.xlsx", blueprint: IMPORTED_BLUEPRINT, errors: [], warnings: []});
            }
            if (url === BUILD_PREVIEW_URL) {
                return jsonResponse({
                    status: "ok",
                    warnings: [],
                    manifest: IMPORTED_BLUEPRINT.manifest,
                    reels: 2,
                    rows: 2,
                    symbolsCount: 2,
                    blueprintHash: "sha256:a",
                    expectedFiles: ["package.json"],
                    projectRoot: "/games/imported-game",
                    destinationHasContent: false,
                    createFiles: ["package.json"],
                    updateFiles: [],
                    deleteFiles: [],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.type(screen.getByLabelText("PAR sheet path"), "./a.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        await user.click(screen.getByRole("button", {name: "Continue to Preview canonical model"}));
        await user.click(screen.getByRole("button", {name: "Preview canonical model"}));
        await screen.findByText(/id: "imported-game"/);
        expect(screen.getByRole("button", {name: "Continue to Apply / Export"})).toBeInTheDocument();

        // Switch to a different file -- the already-ready preview for A must not survive.
        await user.click(screen.getByRole("button", {name: stepperStep("Import", "Read a PAR sheet")}));
        await user.clear(screen.getByLabelText("PAR sheet path"));
        await user.type(screen.getByLabelText("PAR sheet path"), "./b.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        await user.click(screen.getByRole("button", {name: stepperStep("Preview canonical model", "What it becomes")}));
        expect(screen.queryByText(/id: "imported-game"/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Apply / Export"})).not.toBeInTheDocument();
    });

    it("does not offer Continue to Apply/Export after a failed canonical preview", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === IMPORT_URL) {
                return jsonResponse({status: "ok", path: "/games/a.par.xlsx", blueprint: IMPORTED_BLUEPRINT, errors: [], warnings: []});
            }
            if (url === BUILD_PREVIEW_URL) {
                return Promise.reject(new Error("build preview backend unavailable"));
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.type(screen.getByLabelText("PAR sheet path"), "./a.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        await user.click(screen.getByRole("button", {name: "Continue to Preview canonical model"}));
        await user.click(screen.getByRole("button", {name: "Preview canonical model"}));

        expect(await screen.findByText("build preview backend unavailable")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Apply / Export"})).not.toBeInTheDocument();
    });

    it("allows starting a new canonical preview immediately after invalidation, without waiting for the stale request", async () => {
        const user = userEvent.setup();
        let resolvePreviewA: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        let previewCallCount = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === IMPORT_URL) {
                const {path} = JSON.parse((init?.body as string | undefined) ?? "{}") as {path?: string};
                if (path === "./b.par.xlsx") {
                    return jsonResponse({status: "ok", path: "/games/b.par.xlsx", blueprint: IMPORTED_BLUEPRINT_B, errors: [], warnings: []});
                }
                return jsonResponse({status: "ok", path: "/games/a.par.xlsx", blueprint: IMPORTED_BLUEPRINT, errors: [], warnings: []});
            }
            if (url === BUILD_PREVIEW_URL) {
                previewCallCount += 1;
                if (previewCallCount === 1) {
                    return new Promise((res) => {
                        resolvePreviewA = res;
                    });
                }
                return jsonResponse({
                    status: "ok",
                    warnings: [],
                    manifest: IMPORTED_BLUEPRINT_B.manifest,
                    reels: 3,
                    rows: 3,
                    symbolsCount: 2,
                    blueprintHash: "sha256:b",
                    expectedFiles: ["package.json"],
                    projectRoot: "/games/imported-game",
                    destinationHasContent: false,
                    createFiles: ["package.json"],
                    updateFiles: [],
                    deleteFiles: [],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToImportStep();
        await user.type(screen.getByLabelText("PAR sheet path"), "./a.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        await user.click(screen.getByRole("button", {name: "Continue to Preview canonical model"}));
        await user.click(screen.getByRole("button", {name: "Preview canonical model"}));
        await screen.findByText("Working…");

        // Re-import file B while A's preview request is still pending -- this must invalidate it and
        // free up the double-submit guard right away, not just once A's stale request settles.
        await user.click(screen.getByRole("button", {name: stepperStep("Import", "Read a PAR sheet")}));
        await user.clear(screen.getByLabelText("PAR sheet path"));
        await user.type(screen.getByLabelText("PAR sheet path"), "./b.par.xlsx");
        await user.click(screen.getByRole("button", {name: "Import"}));
        await screen.findByText("Imported successfully");

        await user.click(screen.getByRole("button", {name: stepperStep("Preview canonical model", "What it becomes")}));
        await user.click(screen.getByRole("button", {name: "Preview canonical model"}));

        expect(await screen.findByText(/id: "imported-game-b"/)).toBeInTheDocument();

        resolvePreviewA?.(
            await jsonResponse({
                status: "ok",
                warnings: [],
                manifest: IMPORTED_BLUEPRINT.manifest,
                reels: 2,
                rows: 2,
                symbolsCount: 2,
                blueprintHash: "sha256:a",
                expectedFiles: ["package.json"],
                projectRoot: "/games/imported-game",
                destinationHasContent: false,
                createFiles: ["package.json"],
                updateFiles: [],
                deleteFiles: [],
            }),
        );
    });
});
