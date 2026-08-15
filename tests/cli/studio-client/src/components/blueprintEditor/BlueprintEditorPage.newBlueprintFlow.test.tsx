import {fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {createFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

// Covers the New flow's own lifecycle (see NewBlueprintDialog's own doc comment): Blank/Generate
// random/Load existing as a top-level choice, gated behind a Save/Discard/Cancel dirty-confirm, and
// the "Generate random"/"Randomize again"/"Use this blueprint"/Undo sequence. BlueprintEditorPage's
// existing save/load/validation/reel-strip/PAR-sheet test files already cover those flows on their own
// terms; this file is deliberately scoped to the New dialog itself.
//
// Every fetchImpl below throws (rather than returning a fake non-2xx response) for any URL it doesn't
// explicitly handle -- PathInput's own on-focus/on-change resolveHint call (a plain path field always
// triggers one) needs that same "network error" fallback every other BlueprintEditorPage test file
// relies on (see BlueprintEditorPage.save.test.tsx); a fabricated response body that isn't actually a
// well-formed StudioFsBrowseView crashes PathInput's own error-reason lookup instead.

const RANDOM_URL = "/api/home/blueprints/random";
const LOAD_URL = "/api/home/blueprints/load";
const SAVE_URL = "/api/home/blueprints/save";

async function dirtyGameId(user: ReturnType<typeof userEvent.setup>, value: string): Promise<void> {
    const field = screen.getByLabelText("Game id");
    await user.clear(field);
    await user.type(field, value);
    await user.tab();
}

function randomBlueprintBody(overrides: {seed?: number; id?: string; name?: string} = {}) {
    const seed = overrides.seed ?? 42;
    return {
        status: "ok",
        blueprint: {manifest: {id: overrides.id ?? "random-slot", name: overrides.name ?? "Random Slot", version: "0.1.0"}, reels: 5, rows: 3, symbols: [], paytable: {}},
        seed,
        preset: "default",
        provenance: {generatorVersion: "1.0.0", strategy: "default", seed},
    };
}

function jsonTextareaValue(): string {
    return (screen.getByLabelText("Blueprint JSON") as HTMLTextAreaElement).value;
}

describe("BlueprintEditorPage - New flow", () => {
    it("opens straight to the Blank/Generate random/Load existing choice when the draft is clean", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));

        expect(await screen.findByRole("button", {name: "Blank"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Generate random"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Load existing"})).toBeInTheDocument();
        expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument();
    });

    it("gates behind Save/Discard/Cancel when the draft is dirty, and Cancel leaves the draft untouched", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await dirtyGameId(user, "dirty-draft");

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        expect(await screen.findByText("You have unsaved changes to the current blueprint. Save them, discard them, or cancel.")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Blank"})).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Cancel"}));

        await waitFor(() => expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument());
        expect(screen.getByLabelText("Game id")).toHaveValue("dirty-draft");
    });

    it("Discard proceeds to the choice step, and Blank replaces the dirty draft", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await dirtyGameId(user, "dirty-draft");
        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.click(await screen.findByRole("button", {name: "Discard"}));
        await user.click(await screen.findByRole("button", {name: "Blank"}));

        expect(screen.getByLabelText("Game id")).toHaveValue("");
    });

    it("an unapplied JSON-textarea edit alone (no Form field touched) still gates New Blueprint as dirty", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("radio", {name: "JSON"}));
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: "unsaved-work-in-progress"}});

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        expect(await screen.findByText("You have unsaved changes to the current blueprint. Save them, discard them, or cancel.")).toBeInTheDocument();
    });

    it("saves the dirty draft to a typed path before proceeding to the choice step", async () => {
        const user = userEvent.setup();
        const saveCalls: {overwrite: boolean; path: string}[] = [];
        const {fetchImpl} = createFakeFetch((call) => {
            if (call.url === SAVE_URL) {
                const body = JSON.parse(call.init?.body ?? "{}") as {overwrite: boolean; path: string};
                saveCalls.push({overwrite: body.overwrite, path: body.path});
                return {ok: true, status: 201, body: {status: "ok", path: body.path}};
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await dirtyGameId(user, "dirty-draft");
        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.type(await screen.findByLabelText("Save current blueprint to path"), "/games/a/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Save and continue"}));

        expect(await screen.findByRole("button", {name: "Blank"})).toBeInTheDocument();
        expect(saveCalls).toEqual([{overwrite: false, path: "/games/a/blueprint.json"}]);
    });

    it("resolves a save conflict via Overwrite and continue, then reaches the choice step", async () => {
        const user = userEvent.setup();
        const saveCalls: {overwrite: boolean}[] = [];
        const {fetchImpl} = createFakeFetch((call) => {
            if (call.url === SAVE_URL) {
                const body = JSON.parse(call.init?.body ?? "{}") as {overwrite: boolean; path: string};
                saveCalls.push({overwrite: body.overwrite});
                if (!body.overwrite) {
                    return {ok: false, status: 409, body: {status: "conflict", path: body.path, error: `"${body.path}" already exists.`}};
                }
                return {ok: true, status: 200, body: {status: "ok", path: body.path}};
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await dirtyGameId(user, "dirty-draft");
        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.type(await screen.findByLabelText("Save current blueprint to path"), "/games/a/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Save and continue"}));

        expect(await screen.findByText('"/games/a/blueprint.json" already exists.')).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Overwrite and continue"}));
        // onOverwrite (shared with the standalone advanced Save controls) opens a Mantine confirm modal
        // before actually resending the save -- same as BlueprintEditorPage.save.test.tsx's own flow.
        await user.click(await screen.findByRole("button", {name: "Confirm"}));

        await waitFor(() => expect(saveCalls).toEqual([{overwrite: false}, {overwrite: true}]));
        expect(await screen.findByRole("button", {name: "Blank"})).toBeInTheDocument();
    });

    it("generates a random blueprint with seed/provenance, and Use this blueprint applies it and offers Undo", async () => {
        const user = userEvent.setup();
        const randomCalls: unknown[] = [];
        const {fetchImpl} = createFakeFetch((call) => {
            if (call.url === RANDOM_URL) {
                randomCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: randomBlueprintBody()};
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.click(await screen.findByRole("button", {name: "Generate random"}));
        await user.click(screen.getByRole("button", {name: "Generate"}));

        expect(await screen.findByText('Generated "Random Slot" (id: "random-slot") from seed 42.')).toBeInTheDocument();
        expect(randomCalls).toEqual([{preset: "default", seed: 20260815}]);

        await user.click(screen.getByRole("button", {name: "Use this blueprint"}));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.getByLabelText("Game id")).toHaveValue("random-slot");
        expect(await screen.findByText("Replaced the current blueprint.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Undo"}));

        expect(screen.getByLabelText("Game id")).toHaveValue("");
        expect(screen.queryByText("Replaced the current blueprint.")).not.toBeInTheDocument();
    });

    it("hides the Undo banner again once the restored draft is edited further", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createFakeFetch((call) => {
            if (call.url === RANDOM_URL) {
                return {ok: true, status: 200, body: randomBlueprintBody()};
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.click(await screen.findByRole("button", {name: "Generate random"}));
        await user.click(screen.getByRole("button", {name: "Generate"}));
        await user.click(await screen.findByRole("button", {name: "Use this blueprint"}));
        expect(await screen.findByText("Replaced the current blueprint.")).toBeInTheDocument();

        await dirtyGameId(user, "further-edit");

        expect(screen.queryByText("Replaced the current blueprint.")).not.toBeInTheDocument();
    });

    it("Randomize again mints a fresh seed instead of reusing the field's current value", async () => {
        const user = userEvent.setup();
        const randomCalls: unknown[] = [];
        let call = 0;
        const {fetchImpl} = createFakeFetch((request) => {
            if (request.url === RANDOM_URL) {
                randomCalls.push(JSON.parse(request.init?.body ?? "{}"));
                call += 1;
                return {ok: true, status: 200, body: randomBlueprintBody({seed: call === 1 ? 42 : 99, id: call === 1 ? "random-slot" : "random-slot-2"})};
            }
            throw new Error(`unexpected fetch to ${request.url}`);
        });
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.click(await screen.findByRole("button", {name: "Generate random"}));
        await user.click(screen.getByRole("button", {name: "Generate"}));
        await screen.findByText('Generated "Random Slot" (id: "random-slot") from seed 42.');

        await user.click(screen.getByRole("button", {name: "Randomize again"}));

        expect(await screen.findByText('Generated "Random Slot" (id: "random-slot-2") from seed 99.')).toBeInTheDocument();
        expect(randomCalls).toEqual([{preset: "default", seed: 20260815}, {preset: "default"}]);
    });

    it("Load existing reuses the existing load flow and closes the dialog on success", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createFakeFetch((call) => {
            if (call.url === LOAD_URL) {
                return {
                    ok: true,
                    status: 200,
                    body: {status: "ok", path: "/games/a/blueprint.json", blueprint: {manifest: {id: "loaded-slot", name: "Loaded", version: "0.1.0"}}, blueprintHash: "abc"},
                };
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.click(await screen.findByRole("button", {name: "Load existing"}));
        await user.type(screen.getByLabelText("Existing blueprint path"), "/games/a/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Load existing blueprint"}));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.getByLabelText("Game id")).toHaveValue("loaded-slot");
    });

    it("clears a stale JSON-mode view and a stale Build Preview/output after Blank replaces the draft", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createFakeFetch((call) => {
            if (call.url === "/api/home/blueprints/build-preview") {
                return {
                    ok: true,
                    status: 200,
                    body: {
                        status: "ok",
                        warnings: [],
                        manifest: {id: "before-new", name: "Before New", version: "0.1.0"},
                        reels: 5,
                        rows: 3,
                        symbolsCount: 0,
                        blueprintHash: "hash",
                        expectedFiles: [],
                        projectRoot: "/games/before-new",
                        destinationHasContent: false,
                        createFiles: [],
                        updateFiles: [],
                        deleteFiles: [],
                    },
                };
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await dirtyGameId(user, "before-new");
        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        expect(await screen.findByText('Game: Before New (id: "before-new", v0.1.0)')).toBeInTheDocument();

        await user.click(screen.getByRole("radio", {name: "JSON"}));
        expect(jsonTextareaValue()).toContain("before-new");
        await user.click(screen.getByRole("radio", {name: "Form"}));

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.click(await screen.findByRole("button", {name: "Discard"}));
        await user.click(await screen.findByRole("button", {name: "Blank"}));

        // Build Preview's own result is this panel's local state -- must not survive the replace.
        expect(screen.queryByText(/Before New/)).not.toBeInTheDocument();

        // BlueprintJsonPanel's own controlled textarea state only initializes from `jsonText` at mount --
        // without its own key={formGeneration} forcing a remount, it would otherwise keep showing the
        // pre-replace blueprint's JSON.
        await user.click(screen.getByRole("radio", {name: "JSON"}));
        expect(jsonTextareaValue()).not.toContain("before-new");
    });

    it("clears a stale validation result after Blank replaces the draft", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createFakeFetch((call) => {
            if (call.url === "/api/home/blueprints/validate") {
                return {ok: true, status: 200, body: {status: "ok", warnings: []}};
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Validate"}));
        expect(await screen.findByText("Valid — no issues found.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.click(await screen.findByRole("button", {name: "Blank"}));

        expect(screen.queryByText("Valid — no issues found.")).not.toBeInTheDocument();
    });

    it("clears a stale validation result after Generate random's Use this blueprint replaces the draft", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createFakeFetch((call) => {
            if (call.url === "/api/home/blueprints/validate") {
                return {ok: true, status: 200, body: {status: "ok", warnings: []}};
            }
            if (call.url === RANDOM_URL) {
                return {ok: true, status: 200, body: randomBlueprintBody()};
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Validate"}));
        expect(await screen.findByText("Valid — no issues found.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        await user.click(await screen.findByRole("button", {name: "Generate random"}));
        await user.click(screen.getByRole("button", {name: "Generate"}));
        expect(await screen.findByText('Generated "Random Slot" (id: "random-slot") from seed 42.')).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Use this blueprint"}));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.queryByText("Valid — no issues found.")).not.toBeInTheDocument();
    });
});
