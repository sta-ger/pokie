import {fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

const RESOLVE_REELS_URL = "/api/home/blueprints/reel-strip-generation-preview";
const SAVE_MANAGED_URL = "/api/home/blueprints/save-managed";
const OPEN_PROJECT_URL = "/api/home/projects/open";

function jsonResponse(body: unknown) {
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
}

function stepperStep(label: string, description: string): RegExp {
    return new RegExp(`${label}.*${description}`);
}

async function goToReelStripModeler(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("radio", {name: "Per-reel (Reel Strip Modeler)"}));
}

async function selectGeneratedWeights(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("radio", {name: "Generated"}));
    await user.click(screen.getByRole("radio", {name: "Weights"}));
}

async function addLiteralSymbol(user: ReturnType<typeof userEvent.setup>, symbol = "A"): Promise<void> {
    await user.type(screen.getByLabelText("New symbol id for reel 1"), symbol);
    await user.click(screen.getByRole("button", {name: "Add symbol to reel 1"}));
}

async function openConstraintsAdvanced(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("button", {name: "Show advanced details (constraints JSON)"}));
}

async function setNumberInput(user: ReturnType<typeof userEvent.setup>, label: string, value: string): Promise<void> {
    await user.clear(screen.getByLabelText(label));
    await user.type(screen.getByLabelText(label), value);
    await user.tab();
}

const LITERAL_AB_ANALYSIS = {length: 2, symbolCounts: {A: 1, B: 1}, symbolFrequencies: {A: 0.5, B: 0.5}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {}};

describe("BlueprintEditorPage - Reel Strip Modeler", () => {
    // jsdom has no layout engine and doesn't implement Element.scrollIntoView -- Mantine's Combobox
    // (used by the Auto length/Add preset/Copy from reel Select controls below) calls it when
    // keyboard-navigating options.
    beforeAll(() => {
        Element.prototype.scrollIntoView = jest.fn();
    });

    it("converts every Recommended literal strip when opening the per-reel modeler", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/home/blueprints/validate") {
                return jsonResponse({status: "ok", warnings: []});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        await user.click(await screen.findByRole("tab", {name: /Reels/}));
        await goToReelStripModeler(user);

        expect(screen.getAllByText("Literal — 4 symbol(s)")).toHaveLength(5);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        expect(screen.getByLabelText("Reel 1 symbol 1")).toHaveValue("A");
        expect(screen.getByLabelText("Reel 1 symbol 2")).toHaveValue("K");
        expect(screen.getByLabelText("Reel 1 symbol 3")).toHaveValue("Q");
        expect(screen.getByLabelText("Reel 1 symbol 4")).toHaveValue("J");
        await waitFor(() => expect(screen.getByRole("button", {name: "Create Project"})).toBeEnabled());
    });

    it("edits a literal reel's strip as a local draft, and only Apply commits it to the blueprint", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));

        await user.type(screen.getByLabelText("New symbol id for reel 1"), "W");
        await user.click(screen.getByRole("button", {name: "Add symbol to reel 1"}));
        expect(screen.getByText("Unapplied changes")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Commit or discard")}));
        expect(screen.getByText("Reel 1 has unapplied changes. They are still only in the modeler draft.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Apply"}));

        expect(screen.getByText(/draft matches what's already in the Reels draft/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Apply"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Discard"})).toBeDisabled();
    });

    it("generates a reel successfully, shows human-readable diagnostics, and a wrap-around stop window over the resolved strip", async () => {
        const user = userEvent.setup();
        let lastRequestBody: {blueprint: {reelStripGeneration: Record<string, unknown>[]}} | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === RESOLVE_REELS_URL) {
                lastRequestBody = JSON.parse((init?.body as string | undefined) ?? "{}");
                return jsonResponse({
                    status: "ok",
                    errors: [],
                    warnings: [],
                    reels: [
                        {
                            reelIndex: 0,
                            type: "generated",
                            seed: 1,
                            success: true,
                            attemptsUsed: 3,
                            diagnostics: [
                                {attempt: 1, accepted: false, violations: [{constraintId: "minimumCircularDistance", severity: "error", message: "Symbol A is too close to itself."}]},
                                {attempt: 2, accepted: true, violations: [], score: 0},
                            ],
                            strip: ["A", "B", "C", "D"],
                            analysis: {
                                length: 4,
                                symbolCounts: {A: 1, B: 1, C: 1, D: 1},
                                symbolFrequencies: {A: 0.25, B: 0.25, C: 0.25, D: 0.25},
                                minimumCircularDistances: {A: 4},
                                maximumCircularDistances: {A: 4},
                                maximumConsecutiveOccurrences: {A: 1},
                            },
                        },
                    ],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await selectGeneratedWeights(user);
        await user.click(screen.getByRole("button", {name: "Check & preview"}));

        expect(await screen.findByText("Generated successfully")).toBeInTheDocument();
        expect(screen.getByText(/Satisfied every constraint after 3 attempt/)).toBeInTheDocument();
        expect(screen.getByText(/minimumCircularDistance: Symbol A is too close to itself\./)).toBeInTheDocument();

        // The draft actually sent (default length 1/seed 1/symbolWeights {}) -- never the shared blueprint's
        // own (still-literal, empty) entry for this reel, which is what "never touches the blueprint until
        // Apply" actually means at the wire level.
        expect(lastRequestBody?.blueprint.reelStripGeneration[0]).toEqual({type: "generated", length: 1, seed: 1, symbolWeights: {}});

        await user.click(screen.getByRole("button", {name: "Continue to Preview stop windows"}));

        const stopWindowSection = screen.getByRole("group", {name: "Stop window preview"});
        const stopInput = within(stopWindowSection).getByLabelText("Stop position");
        await user.clear(stopInput);
        await user.type(stopInput, "2");
        const rowsInput = within(stopWindowSection).getByLabelText("Visible rows");
        await user.clear(rowsInput);
        await user.type(rowsInput, "2");

        await waitFor(() => {
            const cells = within(stopWindowSection).getAllByRole("cell");
            expect(cells.map((cell) => cell.textContent)).toEqual(["C", "D"]);
        });
    });

    it("shows a clear generation-failure state with violation diagnostics, and never offers a stop-window preview", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === RESOLVE_REELS_URL) {
                return jsonResponse({
                    status: "ok",
                    errors: [],
                    warnings: [],
                    reels: [
                        {
                            reelIndex: 0,
                            type: "generated",
                            seed: 1,
                            success: false,
                            attemptsUsed: 50,
                            diagnostics: [
                                {attempt: 50, accepted: false, violations: [{constraintId: "maximumConsecutiveOccurrences", severity: "error", message: "Symbol A repeats too many times in a row."}]},
                            ],
                        },
                    ],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await selectGeneratedWeights(user);
        await user.click(screen.getByRole("button", {name: "Check & preview"}));

        expect(await screen.findByText("Generation failed")).toBeInTheDocument();
        expect(screen.getByText(/Could not satisfy every constraint after 50 attempt/)).toBeInTheDocument();
        // Scoped to the visible diagnostics list -- the same violation message also appears, always
        // mounted but hidden, inside Advanced details' raw preview-response JSON dump (see
        // AdvancedDisclosure's own doc comment on why).
        expect(within(screen.getByRole("group", {name: /Generation attempts/})).getByText(/Symbol A repeats too many times in a row\./)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Preview stop windows"})).not.toBeInTheDocument();
    });

    it("shows blueprint-level configuration issues, and a clear invalid-configuration state when this reel's own entry couldn't be resolved", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === RESOLVE_REELS_URL) {
                return jsonResponse({
                    status: "ok",
                    errors: [{code: "blueprint-paytable-empty", severity: "error", message: "Paytable is empty."}],
                    warnings: [],
                    reels: [],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await addLiteralSymbol(user);
        await user.click(screen.getByRole("button", {name: "Check & preview"}));

        expect(await screen.findByText(/Paytable is empty\./)).toBeInTheDocument();
        expect(screen.getByText("Invalid reel configuration")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Preview stop windows"})).not.toBeInTheDocument();
    });

    it("shows a local parse error for malformed constraints JSON, without ever sending a request", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await selectGeneratedWeights(user);

        expect(screen.getByLabelText("Constraints for reel 1").closest("[hidden]")).not.toBeNull();
        await openConstraintsAdvanced(user);

        const constraintsField = screen.getByLabelText("Constraints for reel 1");
        await user.clear(constraintsField);
        await user.type(constraintsField, "{{not valid json");
        await user.tab();

        expect(await screen.findByRole("alert")).toBeInTheDocument();
    });

    it("drops a late Check & preview response if the blueprint was edited elsewhere while the request was in flight", async () => {
        const user = userEvent.setup();
        let resolver: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            if (url === RESOLVE_REELS_URL) {
                return new Promise((res) => {
                    resolver = res;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await addLiteralSymbol(user);
        await user.click(screen.getByRole("button", {name: "Check & preview"}));
        expect(await screen.findByText("Working…")).toBeInTheDocument();

        // An edit elsewhere in the form (the top-level Symbols section, not this reel) happens while the
        // request is still in flight -- the Modeler must survive this (not remount/lose the pending
        // request), and the edit itself immediately resets the preview back to idle (any blueprint change
        // invalidates a previously-shown/pending preview) -- so "Working…" disappearing here is the first
        // layer of protection.
        await user.type(screen.getByLabelText("New symbol id"), "wild");
        await user.click(screen.getByRole("button", {name: "Add symbol"}));
        await waitFor(() => expect(screen.queryByText("Working…")).not.toBeInTheDocument());

        resolver?.(
            await jsonResponse({
                status: "ok",
                errors: [],
                warnings: [],
                reels: [{reelIndex: 0, type: "literal", strip: ["A", "B"], analysis: LITERAL_AB_ANALYSIS}],
            }),
        );

        // Give the stale response a chance to (incorrectly) apply, then assert it never did -- the second,
        // load-bearing layer: isStaleReelStripGenerationRequest itself must reject this response even
        // though the component never unmounted.
        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 100);
        });
        expect(screen.queryByText("Literal strip")).not.toBeInTheDocument();
        expect(screen.queryByText("Working…")).not.toBeInTheDocument();
    });

    it("applies the response normally when nothing else changed while it was in flight", async () => {
        const user = userEvent.setup();
        let resolver: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            if (url === RESOLVE_REELS_URL) {
                return new Promise((res) => {
                    resolver = res;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await addLiteralSymbol(user);
        await user.click(screen.getByRole("button", {name: "Check & preview"}));
        expect(await screen.findByText("Working…")).toBeInTheDocument();

        resolver?.(
            await jsonResponse({
                status: "ok",
                errors: [],
                warnings: [],
                reels: [{reelIndex: 0, type: "literal", strip: ["A", "B"], analysis: LITERAL_AB_ANALYSIS}],
            }),
        );

        expect(await screen.findByText("Literal strip")).toBeInTheDocument();
        expect(screen.getByText("Sequence: A, B")).toBeInTheDocument();
    });

    it("warns before switching to a different reel with unapplied changes, and discards them on confirm", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await user.type(screen.getByLabelText("New symbol id for reel 1"), "W");
        await user.click(screen.getByRole("button", {name: "Add symbol to reel 1"}));

        await user.click(screen.getByRole("button", {name: stepperStep("Select reel", "Which reel")}));
        await user.click(screen.getByRole("button", {name: "Select reel 2"}));

        const cancelDialog = await screen.findByRole("dialog");
        expect(cancelDialog).toHaveTextContent("Reel 1 has unapplied changes. Discard them and switch to Reel 2?");
        await user.click(within(cancelDialog).getByRole("button", {name: "Cancel"}));

        // Cancelled -- reel 1 stays selected and still dirty, no switch happened.
        expect(screen.getByRole("button", {name: "Select reel 1"})).toHaveTextContent("Selected");

        await user.click(screen.getByRole("button", {name: "Select reel 2"}));
        const confirmDialog = await screen.findByRole("dialog");
        await user.click(within(confirmDialog).getByRole("button", {name: "Confirm"}));

        // Confirmed -- the switch actually happened, landing on Edit or generate for reel 2.
        expect(screen.getByText("Reel 2")).toBeInTheDocument();

        // Switching back to reel 1 (now not dirty, since it was discarded, so no confirm needed) shows the
        // original, unedited empty literal strip -- the "W" symbol never survived the switch.
        await user.click(screen.getByRole("button", {name: stepperStep("Select reel", "Which reel")}));
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        expect(screen.queryByText("Unapplied changes")).not.toBeInTheDocument();
    });

    it("discards an edited reel's draft back to what's actually applied in the blueprint", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await user.type(screen.getByLabelText("New symbol id for reel 1"), "W");
        await user.click(screen.getByRole("button", {name: "Add symbol to reel 1"}));
        expect(screen.getByText("Unapplied changes")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Commit or discard")}));
        await user.click(screen.getByRole("button", {name: "Discard"}));

        expect(screen.getByText(/draft matches what's already in the Reels draft/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Edit or generate", "Literal or generated")}));
        expect(screen.queryByDisplayValue("W")).not.toBeInTheDocument();
    });

    it("clears reel selection, draft, and preview entirely when the blueprint is replaced (New Blueprint)", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await user.type(screen.getByLabelText("New symbol id for reel 1"), "W");
        await user.click(screen.getByRole("button", {name: "Add symbol to reel 1"}));
        expect(screen.getByText("Unapplied changes")).toBeInTheDocument();

        // "Add symbol to reel 1" already mutated the blueprint itself (reelStripGeneration is a real
        // field), so the New flow's own dirty-confirm gate triggers -- Discard then Blank (see
        // NewBlueprintDialog's own doc comment).
        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.click(await screen.findByRole("button", {name: "Discard"}));
        await user.click(await screen.findByRole("button", {name: "Blank"}));
        await goToReelStripModeler(user);

        // A fresh remount (via the parent's own key={formGeneration}) -- back to Select reel, with no
        // trace of the previous blueprint's reel selection, draft, or dirty state.
        expect(screen.getByRole("button", {name: stepperStep("Select reel", "Which reel")})).toBeInTheDocument();
        expect(screen.queryByText("Unapplied changes")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("New symbol id for reel 1")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        expect(screen.queryByDisplayValue("W")).not.toBeInTheDocument();
    });

    it("invalidates a pending Check & preview response when the draft itself is edited while it's in flight", async () => {
        const user = userEvent.setup();
        let resolver: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            if (url === RESOLVE_REELS_URL) {
                return new Promise((res) => {
                    resolver = res;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await addLiteralSymbol(user);
        await user.click(screen.getByRole("button", {name: "Check & preview"}));
        expect(await screen.findByText("Working…")).toBeInTheDocument();

        // Edit this reel's own draft (not another section) while its own request is still in flight.
        await user.type(screen.getByLabelText("New symbol id for reel 1"), "W");
        await user.click(screen.getByRole("button", {name: "Add symbol to reel 1"}));
        await waitFor(() => expect(screen.queryByText("Working…")).not.toBeInTheDocument());

        resolver?.(
            await jsonResponse({
                status: "ok",
                errors: [],
                warnings: [],
                reels: [{reelIndex: 0, type: "literal", strip: ["A", "B"], analysis: LITERAL_AB_ANALYSIS}],
            }),
        );

        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 100);
        });
        expect(screen.queryByText("Literal strip")).not.toBeInTheDocument();
    });

    it("invalidates an already-shown preview once the draft is edited again", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => {
            if (url === RESOLVE_REELS_URL) {
                return jsonResponse({
                    status: "ok",
                    errors: [],
                    warnings: [],
                    reels: [{reelIndex: 0, type: "literal", strip: ["A", "B"], analysis: LITERAL_AB_ANALYSIS}],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await addLiteralSymbol(user);
        await user.click(screen.getByRole("button", {name: "Check & preview"}));
        expect(await screen.findByText("Literal strip")).toBeInTheDocument();

        // Back to Edit or generate, and edit the draft again -- the preview just shown described the
        // draft *before* this edit and must no longer count as current.
        await user.click(screen.getByRole("button", {name: stepperStep("Edit or generate", "Literal or generated")}));
        await user.type(screen.getByLabelText("New symbol id for reel 1"), "C");
        await user.click(screen.getByRole("button", {name: "Add symbol to reel 1"}));

        // Inspect diagnostics is disabled again -- clicking it does nothing, so we're still on Edit or
        // generate (only step 1's own "Check & preview" button exists here).
        await user.click(screen.getByRole("button", {name: stepperStep("Inspect diagnostics", "Validation")}));
        expect(screen.getByRole("button", {name: "Check & preview"})).toBeInTheDocument();
    });

    it("shows each reel's own Length/Seed when switching between two already-applied generated reels, never a stale value left over from the other", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);

        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await selectGeneratedWeights(user);
        await user.clear(screen.getByLabelText("Length"));
        await user.type(screen.getByLabelText("Length"), "5");
        await user.tab();
        await user.clear(screen.getByLabelText("Seed"));
        await user.type(screen.getByLabelText("Seed"), "11");
        await user.tab();
        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Commit or discard")}));
        await user.click(screen.getByRole("button", {name: "Apply"}));

        await user.click(screen.getByRole("button", {name: stepperStep("Select reel", "Which reel")}));
        await user.click(screen.getByRole("button", {name: "Select reel 2"}));
        await selectGeneratedWeights(user);
        await user.clear(screen.getByLabelText("Length"));
        await user.type(screen.getByLabelText("Length"), "9");
        await user.tab();
        await user.clear(screen.getByLabelText("Seed"));
        await user.type(screen.getByLabelText("Seed"), "42");
        await user.tab();
        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Commit or discard")}));
        await user.click(screen.getByRole("button", {name: "Apply"}));

        // Also leave reel 2 with a malformed constraints field showing its own local parse error --
        // the parse fails, so nothing here is ever committed to the draft/blueprint, but the error and
        // typed text are still local editor state tied to this reel's own editor instance.
        await user.click(screen.getByRole("button", {name: stepperStep("Edit or generate", "Literal or generated")}));
        await openConstraintsAdvanced(user);
        await user.type(screen.getByLabelText("Constraints for reel 2"), "{{not valid json");
        await user.tab();
        expect(await screen.findByRole("alert")).toBeInTheDocument();

        // Switch back to reel 1 -- must show reel 1's own applied values, never reel 2's leftover ones,
        // and no trace of reel 2's malformed constraints text or its parse error.
        await user.click(screen.getByRole("button", {name: stepperStep("Select reel", "Which reel")}));
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        expect(screen.getByLabelText("Length")).toHaveValue("5");
        expect(screen.getByLabelText("Seed")).toHaveValue("11");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        await openConstraintsAdvanced(user);
        expect(screen.getByLabelText("Constraints for reel 1")).toHaveValue("");

        // And reel 2 the other way, confirming this isn't just reel 1 happening to win by coincidence.
        await user.click(screen.getByRole("button", {name: stepperStep("Select reel", "Which reel")}));
        await user.click(screen.getByRole("button", {name: "Select reel 2"}));
        expect(screen.getByLabelText("Length")).toHaveValue("9");
        expect(screen.getByLabelText("Seed")).toHaveValue("42");
    }, 90000);

    it("discarding a generated exploration clears its own type-toggle memory, so toggling back to Generated later doesn't resurrect it", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));

        // Explore Generated with distinctive scalar values...
        await selectGeneratedWeights(user);
        await user.clear(screen.getByLabelText("Length"));
        await user.type(screen.getByLabelText("Length"), "50");
        await user.tab();
        await user.clear(screen.getByLabelText("Seed"));
        await user.type(screen.getByLabelText("Seed"), "777");
        await user.tab();

        // ...then toggle back to Literal -- this is what actually stashes the 50/777 exploration as this
        // reel's own "restore point" for a future Generated toggle (see
        // setReelStripGenerationEntryType's own stash-on-leaving-generated behavior).
        await user.click(screen.getByRole("radio", {name: "Literal"}));

        // Edit the literal strip too, so there's actually something to discard -- toggling back to
        // Literal alone landed exactly on what's already applied (empty), leaving nothing dirty yet.
        await user.type(screen.getByLabelText("New symbol id for reel 1"), "Z");
        await user.click(screen.getByRole("button", {name: "Add symbol to reel 1"}));

        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Commit or discard")}));
        await user.click(screen.getByRole("button", {name: "Discard"}));

        // Toggle to Generated again -- must never resurrect the discarded 50/777 exploration.
        await user.click(screen.getByRole("button", {name: stepperStep("Edit or generate", "Literal or generated")}));
        await selectGeneratedWeights(user);

        expect(screen.getByLabelText("Length")).toHaveValue("1");
        expect(screen.getByLabelText("Seed")).toHaveValue("1");
    });

    it("allows starting a brand new Check & preview immediately after an edit invalidates a pending one, without waiting for the stale request to settle", async () => {
        const user = userEvent.setup();
        const resolvers: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void)[] = [];
        const fetchImpl: FetchLike = (url) => {
            if (url === RESOLVE_REELS_URL) {
                return new Promise((res) => {
                    resolvers.push(res);
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await addLiteralSymbol(user);
        await user.click(screen.getByRole("button", {name: "Check & preview"}));
        expect(await screen.findByText("Working…")).toBeInTheDocument();

        // Edit the draft -- invalidates the first (still unresolved -- there is nothing to cancel over
        // plain fetch) request.
        await user.type(screen.getByLabelText("New symbol id for reel 1"), "W");
        await user.click(screen.getByRole("button", {name: "Add symbol to reel 1"}));
        await waitFor(() => expect(screen.queryByText("Working…")).not.toBeInTheDocument());

        // A brand new Check & preview must be allowed to start right away -- not silently swallowed by
        // the double-submit guard still thinking the (now-stale) first request is "in flight".
        await user.click(screen.getByRole("button", {name: "Check & preview"}));
        expect(await screen.findByText("Working…")).toBeInTheDocument();
        await waitFor(() => expect(resolvers).toHaveLength(2));

        // Double-submit protection remains intact for this second, genuinely current request -- clicking
        // again while it's still in flight must not fire a third one.
        await user.click(screen.getByRole("button", {name: "Check & preview"}));
        expect(resolvers).toHaveLength(2);

        // The stale first request finally resolves -- must never apply, and must not disturb the second,
        // still-in-flight request's own "Working…" state.
        resolvers[0]({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    status: "ok",
                    errors: [],
                    warnings: [],
                    reels: [{reelIndex: 0, type: "literal", strip: ["STALE"], analysis: {length: 1, symbolCounts: {STALE: 1}, symbolFrequencies: {STALE: 1}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {}}}],
                }),
        });
        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 50);
        });
        expect(screen.getByText("Working…")).toBeInTheDocument();
        expect(screen.queryByText("Sequence: STALE")).not.toBeInTheDocument();

        // The second, actually-current request resolves normally.
        resolvers[1]({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    status: "ok",
                    errors: [],
                    warnings: [],
                    reels: [{reelIndex: 0, type: "literal", strip: ["A", "B", "W"], analysis: LITERAL_AB_ANALYSIS}],
                }),
        });
        expect(await screen.findByText("Literal strip")).toBeInTheDocument();
        expect(screen.getByText("Sequence: A, B, W")).toBeInTheDocument();
    });

    it("clears the Reel Strip Modeler's own type-toggle bookkeeping on a wholesale JSON Apply, same as New/Load", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));

        // Explore Generated with distinctive scalar values...
        await selectGeneratedWeights(user);
        await user.clear(screen.getByLabelText("Length"));
        await user.type(screen.getByLabelText("Length"), "50");
        await user.tab();
        await user.clear(screen.getByLabelText("Seed"));
        await user.type(screen.getByLabelText("Seed"), "777");
        await user.tab();

        // ...then toggle back to Literal -- this is what stashes the 50/777 exploration as reel 1's own
        // "restore point" for a future Generated toggle (see
        // setReelStripGenerationEntryType's own stash-on-leaving-generated behavior).
        await user.click(screen.getByRole("radio", {name: "Literal"}));

        // Apply a wholesale JSON blueprint replace -- a different blueprint entirely, still with its own
        // reelStripGeneration so the Modeler stays reachable -- must clear that bookkeeping the same way
        // New/Load already do.
        await user.click(screen.getByRole("radio", {name: "JSON", hidden: true}));
        const newBlueprint = {
            manifest: {id: "json-applied", name: "JSON Applied", version: "0.1.0"},
            reels: 2,
            rows: 3,
            symbols: [],
            paytable: {},
            availableBets: [1],
            reelStripGeneration: [
                {type: "literal", strip: []},
                {type: "literal", strip: []},
            ],
        };
        // fireEvent.change (not user.type) avoids user-event's `{`/`}` special-character parsing on raw
        // JSON text.
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: JSON.stringify(newBlueprint)}});
        await user.click(screen.getByRole("button", {name: "Apply JSON"}));

        await user.click(screen.getByRole("radio", {name: "Form", hidden: true}));
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));

        // Toggle to Generated on the *new* blueprint's own reel 1 -- must start fresh (default length
        // 1/seed 1), never resurrect the old (now-replaced) blueprint's discarded 50/777 exploration.
        await selectGeneratedWeights(user);
        expect(screen.getByLabelText("Length")).toHaveValue("1");
        expect(screen.getByLabelText("Seed")).toHaveValue("1");
    });

    it("derives a generated reel's read-only Length from active counts", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);

        await user.click(screen.getByRole("radio", {name: "JSON", hidden: true}));
        const blueprintWithCounts = {
            manifest: {id: "auto-length", name: "Auto Length", version: "0.1.0"},
            reels: 1,
            rows: 3,
            symbols: [],
            paytable: {},
            availableBets: [1],
            reelStripGeneration: [{type: "generated", length: 1, seed: 1, symbolCounts: {A: 2, B: 3}}],
        };
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: JSON.stringify(blueprintWithCounts)}});
        await user.click(screen.getByRole("button", {name: "Apply JSON"}));
        await user.click(screen.getByRole("radio", {name: "Form", hidden: true}));

        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        expect(screen.getByLabelText("Length (derived from counts)")).toHaveValue("5");
        expect(screen.queryByRole("button", {name: "Set reel 1 length automatically from its own counts/weights"})).not.toBeInTheDocument();
    });

    it("adds a constraint preset onto a generated reel's constraints array", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await selectGeneratedWeights(user);

        expect(screen.getByLabelText("Constraints for reel 1").closest("[hidden]")).not.toBeNull();
        await user.click(screen.getByRole("combobox", {name: "Constraint preset for reel 1"}));
        await user.keyboard("{ArrowDown}{Enter}");
        await user.click(screen.getByRole("button", {name: "Add constraint preset to reel 1"}));

        await openConstraintsAdvanced(user);
        expect(screen.getByLabelText("Constraints for reel 1")).toHaveValue(JSON.stringify([{type: "maximumConsecutiveOccurrences", maximumConsecutive: 1}], null, 2));
    });

    it("edits common spacing constraints visually and recovers an advanced JSON edit without corrupting the visual draft", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await selectGeneratedWeights(user);

        await user.click(screen.getByRole("button", {name: "Add constraint"}));
        expect(screen.getByText("Minimum spacing: 3, all symbols")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Edit common constraint 1 for reel 1"}));
        await user.clear(screen.getByLabelText("Common constraint value for reel 1"));
        await user.type(screen.getByLabelText("Common constraint value for reel 1"), "4");
        await user.click(screen.getByRole("switch", {name: "Wrap common constraint around reel 1"}));
        await user.click(screen.getByRole("button", {name: "Save constraint"}));
        expect(screen.getByText("Minimum spacing: 4, all symbols, no wrap around")).toBeInTheDocument();

        await openConstraintsAdvanced(user);
        const constraintsField = screen.getByLabelText("Constraints for reel 1");
        expect(constraintsField).toHaveValue(JSON.stringify([{type: "minimumCircularDistance", minimumDistance: 4, wrapAround: false}], null, 2));

        await user.clear(constraintsField);
        await user.type(constraintsField, "{{not valid json");
        await user.tab();
        expect(await screen.findByRole("alert")).toBeInTheDocument();
        expect(screen.getByText("Minimum spacing: 4, all symbols, no wrap around")).toBeInTheDocument();

        fireEvent.change(constraintsField, {target: {value: '[{"type":"maximumConsecutiveOccurrences","maximumConsecutive":2}]'}});
        fireEvent.blur(constraintsField);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        await waitFor(() => expect(screen.getByText("Maximum consecutive occurrences: 2, all symbols")).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "Remove common constraint 1 for reel 1"}));
        expect(screen.getByText("No spacing or occurrence constraints yet.")).toBeInTheDocument();
    });

    it("copies another reel's own applied configuration into the current reel's draft via Copy from reel", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await selectGeneratedWeights(user);
        await user.clear(screen.getByLabelText("Length"));
        await user.type(screen.getByLabelText("Length"), "12");
        await user.clear(screen.getByLabelText("Seed"));
        await user.type(screen.getByLabelText("Seed"), "99");
        await user.tab();
        await user.click(screen.getByRole("button", {name: stepperStep("Apply", "Commit or discard")}));
        await user.click(screen.getByRole("button", {name: "Apply"}));

        await user.click(screen.getByRole("button", {name: stepperStep("Select reel", "Which reel")}));
        await user.click(screen.getByRole("button", {name: "Select reel 2"}));

        await user.click(screen.getByRole("combobox", {name: "Copy configuration into reel 2 from reel"}));
        await user.keyboard("{ArrowDown}{Enter}");
        await user.click(screen.getByRole("button", {name: "Copy into reel 2"}));

        expect(screen.getByText("Unapplied changes")).toBeInTheDocument();
        expect(screen.getByRole("radio", {name: "Generated"})).toBeChecked();
        expect(screen.getByLabelText("Length")).toHaveValue("12");
        expect(screen.getByLabelText("Seed")).toHaveValue("99");
    });

    it("completes the visual modeler workflow, saves the shared Game Model, and retains the applied generated reel after remount", async () => {
        const user = userEvent.setup();
        const managedSaveBodies: Array<{blueprint: {reelStripGeneration: Record<string, unknown>[]}}> = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (url === RESOLVE_REELS_URL) {
                return jsonResponse({
                    status: "ok",
                    errors: [],
                    warnings: [],
                    reels: [{
                        reelIndex: 0,
                        type: "generated",
                        seed: 7,
                        success: true,
                        attemptsUsed: 1,
                        diagnostics: [],
                        strip: ["A", "K", "Q", "J", "A", "K"],
                        analysis: {
                            length: 6,
                            symbolCounts: {A: 2, K: 2, Q: 1, J: 1},
                            symbolFrequencies: {A: 2 / 6, K: 2 / 6, Q: 1 / 6, J: 1 / 6},
                            minimumCircularDistances: {A: 3},
                            maximumCircularDistances: {A: 3},
                            maximumConsecutiveOccurrences: {A: 1},
                        },
                    }],
                });
            }
            if (url === "/api/home/blueprints/validate") {
                return jsonResponse({status: "ok", warnings: []});
            }
            if (url === SAVE_MANAGED_URL) {
                managedSaveBodies.push(JSON.parse((init?.body as string | undefined) ?? "{}"));
                return jsonResponse({
                    status: "ok",
                    path: "/POKIE Projects/modeler/blueprint.json",
                    name: "modeler",
                    blueprintHash: "sha256:modeler",
                    registeredProject: {location: "/POKIE Projects/modeler", name: "modeler", type: "blueprint", capabilities: [], origin: "managed", lastOpenedAt: "2026-08-20T00:00:00.000Z", status: "ok"},
                });
            }
            if (url === OPEN_PROJECT_URL) {
                return jsonResponse({context: {status: "loaded"}, manifest: {id: "modeler"}});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        await user.click(await screen.findByRole("tab", {name: /Reels/}));
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));

        // A literal draft is an ordinary first-class modeler path, before switching this reel to its
        // generated configuration. Neither the raw constraint textarea nor a raw draft/response is
        // exposed to assistive technology until its respective disclosure is expanded.
        await addLiteralSymbol(user, "A");
        expect(screen.getByLabelText("Reel 1 symbol 1")).toHaveValue("A");
        await user.click(screen.getByRole("radio", {name: "Generated"}));
        await user.click(screen.getByRole("radio", {name: "Weights"}));
        expect(screen.getByRole("radio", {name: "Weights"})).toBeChecked();

        const constraintsToggle = screen.getByRole("button", {name: "Show advanced details (constraints JSON)"});
        const hiddenConstraints = screen.getByLabelText("Constraints for reel 1");
        expect(constraintsToggle).toHaveAttribute("aria-expanded", "false");
        expect(hiddenConstraints.closest("[hidden]")).not.toBeNull();
        expect(screen.queryByRole("textbox", {name: "Constraints for reel 1"})).not.toBeInTheDocument();
        constraintsToggle.focus();
        await user.keyboard("{Enter}");
        expect(constraintsToggle).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("textbox", {name: "Constraints for reel 1"})).toBeVisible();
        await user.keyboard(" ");
        expect(constraintsToggle).toHaveAttribute("aria-expanded", "false");

        // Exercise both source modes and their persisted source values, without using the raw JSON
        // editor as a shortcut for ordinary configuration.
        await user.click(screen.getByRole("radio", {name: "Counts"}));
        await user.click(screen.getByRole("combobox", {name: "Symbol"}));
        await user.keyboard("{ArrowDown}{Enter}");
        await user.clear(screen.getByLabelText("Count"));
        await user.type(screen.getByLabelText("Count"), "3");
        await user.click(screen.getByRole("button", {name: "Add count"}));
        expect(screen.getByLabelText("Length (derived from counts)")).toHaveValue("3");
        await user.click(screen.getByRole("radio", {name: "Weights"}));
        await user.click(screen.getByRole("combobox", {name: "Symbol"}));
        await user.keyboard("{ArrowDown}{Enter}");
        await user.clear(screen.getByLabelText("Weight"));
        await user.type(screen.getByLabelText("Weight"), "2");
        await user.click(screen.getByRole("button", {name: "Add weight"}));
        await setNumberInput(user, "Length", "6");
        await setNumberInput(user, "Seed", "7");

        // Every common visual branch persists its own type, value, selected symbol, and wrap option.
        const commonType = screen.getByRole("combobox", {name: "Common constraint type for reel 1"});
        const commonValue = "Common constraint value for reel 1";
        await user.click(screen.getByRole("combobox", {name: "Common constraint symbols for reel 1"}));
        await user.keyboard("{ArrowDown}{Enter}");
        await setNumberInput(user, commonValue, "3");
        await user.click(screen.getByRole("button", {name: "Add constraint"}));
        expect(screen.getByText("Minimum spacing: 3, A")).toBeInTheDocument();
        await user.click(commonType);
        await user.keyboard("{ArrowDown}{Enter}");
        await user.click(screen.getByRole("combobox", {name: "Common constraint symbols for reel 1"}));
        await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
        await setNumberInput(user, commonValue, "5");
        await user.click(screen.getByRole("button", {name: "Add constraint"}));
        expect(screen.getByText("Maximum spacing: 5, K")).toBeInTheDocument();
        await user.click(commonType);
        await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
        await user.click(screen.getByRole("combobox", {name: "Common constraint symbols for reel 1"}));
        await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
        await setNumberInput(user, commonValue, "2");
        await user.click(screen.getByRole("switch", {name: "Wrap common constraint around reel 1"}));
        await user.click(screen.getByRole("button", {name: "Add constraint"}));
        expect(screen.getByText("Maximum consecutive occurrences: 2, Q, no wrap around")).toBeInTheDocument();
        await user.click(screen.getByRole("combobox", {name: "Constraint preset for reel 1"}));
        await user.keyboard("{ArrowDown}{Enter}");
        await user.click(screen.getByRole("button", {name: "Add constraint preset to reel 1"}));

        const stackSection = screen.getByRole("group", {name: "Stack constraints"});
        await user.click(within(stackSection).getByRole("combobox", {name: "Eligible stack symbols for reel 1"}));
        await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
        await user.click(within(stackSection).getByRole("radio", {name: "Length range"}));
        await setNumberInput(user, "Stack minimum length for reel 1", "2");
        await setNumberInput(user, "Stack maximum length for reel 1", "3");
        await setNumberInput(user, "Stack count for reel 1", "1");
        await user.click(within(stackSection).getByRole("button", {name: "Add stack rule"}));
        expect(within(stackSection).getByText("Stack 1: J, length 2–3, 1 required")).toBeInTheDocument();
        await user.click(within(stackSection).getByRole("button", {name: "Edit"}));
        await setNumberInput(user, "Stack count for reel 1", "2");
        await user.click(within(stackSection).getByRole("button", {name: "Save stack rule"}));
        expect(within(stackSection).getByText("Stack 1: J, length 2–3, 2 required")).toBeInTheDocument();

        await openConstraintsAdvanced(user);
        const constraintsField = screen.getByLabelText("Constraints for reel 1");
        expect((constraintsField as HTMLTextAreaElement).value).toContain('"maximumCircularDistance"');
        await user.clear(constraintsField);
        await user.type(constraintsField, "{{malformed");
        await user.tab();
        expect(await screen.findByRole("alert")).toBeInTheDocument();
        expect(screen.getByText("Stack 1: J, length 2–3, 2 required")).toBeInTheDocument();
        fireEvent.change(constraintsField, {target: {value: '[{"type":"maximumConsecutiveOccurrences","maximumConsecutive":4,"symbolIds":["A"]}]'}});
        fireEvent.blur(constraintsField);
        await waitFor(() => expect(screen.getByText("Maximum consecutive occurrences: 4, A")).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "Remove common constraint 1 for reel 1"}));
        expect(screen.getByText("No spacing or occurrence constraints yet.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Check & preview"}));
        expect(await screen.findByText("Generated successfully")).toBeInTheDocument();
        const rawToggle = screen.getByRole("button", {name: "Show advanced details (raw draft config, raw preview response)"});
        expect(rawToggle).toHaveAttribute("aria-expanded", "false");
        expect(screen.getByText("Draft reelStripGeneration entry").closest("[hidden]")).not.toBeNull();
        expect(screen.getByText("Raw preview response for this reel").closest("[hidden]")).not.toBeNull();
        rawToggle.focus();
        await user.keyboard("{Enter}");
        expect(rawToggle).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText("Raw preview response for this reel")).toBeVisible();

        await user.click(screen.getByRole("button", {name: "Continue to Preview stop windows"}));
        expect(screen.getByRole("group", {name: "Stop window preview"})).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Continue to Apply"}));
        await user.click(screen.getByRole("button", {name: "Apply"}));
        expect(screen.getByText(/Use the common Game Model Save to persist the blueprint/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Create Project"}));
        await waitFor(() => expect(managedSaveBodies).toHaveLength(1));
        const savedReel = managedSaveBodies[0].blueprint.reelStripGeneration[0];
        expect(savedReel).toMatchObject({type: "generated", length: 6, seed: 7});
        expect(Object.values(savedReel.symbolWeights as Record<string, number>)).toContain(2);
        expect(await screen.findByText('Saved to "/POKIE Projects/modeler/blueprint.json".')).toBeInTheDocument();

        // Applying the already-saved shared Game Model is the editor's explicit form remount boundary.
        // The applied reel configuration belongs to that Game Model, not the Modeler's local draft.
        await user.click(screen.getByRole("radio", {name: "JSON", hidden: true}));
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: JSON.stringify(managedSaveBodies[0].blueprint)}});
        await user.click(screen.getByRole("button", {name: "Apply JSON"}));
        await user.click(screen.getByRole("radio", {name: "Form", hidden: true}));
        await user.click(await screen.findByRole("tab", {name: /Reels/}));
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        expect(screen.getByRole("radio", {name: "Generated"})).toBeChecked();
        expect(screen.getByLabelText("Length")).toHaveValue("6");
        expect(screen.getByLabelText("Seed")).toHaveValue("7");
    }, 90000);
});
