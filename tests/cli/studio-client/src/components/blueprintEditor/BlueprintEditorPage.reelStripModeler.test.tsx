import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

const RESOLVE_REELS_URL = "/api/home/blueprints/reel-strip-generation-preview";

function jsonResponse(body: unknown) {
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
}

function stepperStep(label: string, description: string): RegExp {
    return new RegExp(`${label}.*${description}`);
}

async function goToReelStripModeler(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("radio", {name: "Per-reel (Reel Strip Modeler)"}));
}

const LITERAL_AB_ANALYSIS = {length: 2, symbolCounts: {A: 1, B: 1}, symbolFrequencies: {A: 0.5, B: 0.5}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {}};

describe("BlueprintEditorPage - Reel Strip Modeler", () => {
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
        expect(screen.getByText("Reel 1 has unapplied changes.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Apply"}));

        expect(screen.getByText(/draft matches what's already in the blueprint/)).toBeInTheDocument();
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
        await user.click(screen.getByRole("radio", {name: "Generated"}));
        await user.click(screen.getByRole("button", {name: "Check & preview"}));

        expect(await screen.findByText("Generated successfully")).toBeInTheDocument();
        expect(screen.getByText(/Satisfied every constraint after 3 attempt/)).toBeInTheDocument();
        expect(screen.getByText(/minimumCircularDistance: Symbol A is too close to itself\./)).toBeInTheDocument();

        // The draft actually sent (default length 1/seed 1/symbolCounts {}) -- never the shared blueprint's
        // own (still-literal, empty) entry for this reel, which is what "never touches the blueprint until
        // Apply" actually means at the wire level.
        expect(lastRequestBody?.blueprint.reelStripGeneration[0]).toEqual({type: "generated", length: 1, seed: 1, symbolCounts: {}});

        await user.click(screen.getByRole("button", {name: "Continue to preview stop windows"}));

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
        await user.click(screen.getByRole("radio", {name: "Generated"}));
        await user.click(screen.getByRole("button", {name: "Check & preview"}));

        expect(await screen.findByText("Generation failed")).toBeInTheDocument();
        expect(screen.getByText(/Could not satisfy every constraint after 50 attempt/)).toBeInTheDocument();
        expect(screen.getByText(/Symbol A repeats too many times in a row\./)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to preview stop windows"})).not.toBeInTheDocument();
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
        await user.click(screen.getByRole("button", {name: "Check & preview"}));

        expect(await screen.findByText(/Paytable is empty\./)).toBeInTheDocument();
        expect(screen.getByText("Invalid reel configuration")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to preview stop windows"})).not.toBeInTheDocument();
    });

    it("shows a local parse error for malformed constraints JSON, without ever sending a request", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});
        await goToReelStripModeler(user);
        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        await user.click(screen.getByRole("radio", {name: "Generated"}));

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

        expect(screen.getByText(/draft matches what's already in the blueprint/)).toBeInTheDocument();

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

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await goToReelStripModeler(user);

        // A fresh remount (via the parent's own key={formGeneration}) -- back to Select reel, with no
        // trace of the previous blueprint's reel selection, draft, or dirty state.
        expect(screen.getByRole("button", {name: stepperStep("Select reel", "Which reel")})).toBeInTheDocument();
        expect(screen.queryByText("Unapplied changes")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("New symbol id for reel 1")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Select reel 1"}));
        expect(screen.queryByDisplayValue("W")).not.toBeInTheDocument();
    });
});
