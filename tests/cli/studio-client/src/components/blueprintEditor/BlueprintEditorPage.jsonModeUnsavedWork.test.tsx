import {fireEvent, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

// Regression coverage for the P5PA-01/P5PA-08 "Blueprint Game Model editor" finding: the JSON-mode
// Textarea used to be uncontrolled (`defaultValue`), so a typed-but-never-applied replacement blueprint
// was silently discarded -- with zero warning -- the instant the mode toggle unmounted the panel (or the
// page navigated away). BlueprintJsonPanel is now controlled and reports its own draft-dirty state up to
// BlueprintEditorPage, which both (a) gates the Form/JSON mode toggle behind the same confirm() modal
// ReelStripGenerationEditor's own dirty-reel-switch already uses, and (b) folds into `isDirty`, which
// already gates New Blueprint/navigation/beforeunload -- see BlueprintEditorPage.newBlueprintFlow.test.tsx's
// own "an unapplied JSON-textarea edit alone ... gates New Blueprint as dirty" case for (b).

describe("BlueprintEditorPage - JSON mode unsaved-work protection", () => {
    it("warns before discarding an unapplied JSON edit when switching to Form mode, and Cancel keeps it", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("radio", {name: "JSON"}));
        const textarea = screen.getByLabelText("Blueprint JSON");
        fireEvent.change(textarea, {target: {value: "unsaved-work-in-progress"}});

        await user.click(screen.getByRole("radio", {name: "Form"}));

        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent("Switch away from JSON mode? The unapplied JSON edit will be discarded.");
        await user.click(within(dialog).getByRole("button", {name: "Cancel"}));

        // Cancelled -- still in JSON mode, and the typed draft is untouched.
        expect(screen.getByLabelText("Blueprint JSON")).toHaveValue("unsaved-work-in-progress");
        expect(screen.getByRole("radio", {name: "JSON"})).toBeChecked();
    });

    it("discards the unapplied JSON edit and switches to Form mode on confirm", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("radio", {name: "JSON"}));
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: "unsaved-work-in-progress"}});

        await user.click(screen.getByRole("radio", {name: "Form"}));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", {name: "Confirm"}));

        expect(screen.getByRole("radio", {name: "Form"})).toBeChecked();

        // Switching back to JSON shows the real, current (never-mutated) blueprint, not the discarded draft.
        await user.click(screen.getByRole("radio", {name: "JSON"}));
        expect(screen.getByLabelText("Blueprint JSON")).not.toHaveValue("unsaved-work-in-progress");
    });

    it("never gates the mode toggle when the JSON textarea has no unapplied edit", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("radio", {name: "JSON"}));
        await user.click(screen.getByRole("radio", {name: "Form"}));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("radio", {name: "Form"})).toBeChecked();
    });

    it("a successful Apply JSON clears the draft-dirty flag, so switching away afterwards needs no confirm", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url) => Promise.reject(new Error(`unexpected fetch ${url}`));
        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.click(screen.getByRole("radio", {name: "JSON"}));
        const newBlueprint = {
            manifest: {id: "json-applied", name: "JSON Applied", version: "0.1.0"},
            reels: 5,
            rows: 3,
            symbols: [],
            paytable: {},
            availableBets: [1],
        };
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: JSON.stringify(newBlueprint)}});
        await user.click(screen.getByRole("button", {name: "Apply JSON"}));

        await user.click(screen.getByRole("radio", {name: "Form"}));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Game id")).toHaveValue("json-applied");
    });
});
