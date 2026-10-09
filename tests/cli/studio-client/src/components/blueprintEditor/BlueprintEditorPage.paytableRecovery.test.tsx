import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("P9-07 payout edits in Blueprint authoring", () => {
    it("revalidates the focused guided payout and keeps Create disabled for the rejected draft", async () => {
        const user = userEvent.setup();
        const validatedPayouts: number[] = [];
        const fetchImpl: FetchLike = () => Promise.reject(new Error("Unexpected request"));
        const validateFetch: FetchLike = (url, init) => {
            if (url !== "/api/home/blueprints/validate") return fetchImpl(url, init);
            const payout = JSON.parse(init!.body!).blueprint.paytable.Q[3] as number;
            validatedPayouts.push(payout);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(payout > 0
                ? {status: "ok", warnings: []}
                : {status: "invalid", errors: [{code: "blueprint-paytable-invalid-multiplier", severity: "error", message: "Payout must be positive.", path: "paytable.Q.3"}], warnings: []})});
        };
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl: validateFetch});
        const create = screen.getByRole("button", {name: "Create game"});
        await waitFor(() => expect(create).toBeEnabled());
        await user.click(screen.getByRole("tab", {name: /^Paytable/}));
        const payout = screen.getByLabelText("Q x3 payout");
        await user.clear(payout);
        await waitFor(() => expect(validatedPayouts).toContain(0));
        await waitFor(() => expect(create).toHaveAttribute("data-pokie-validation-state", "invalid"));
        expect(create).toBeDisabled();
        // Preserve the guided editor's existing jump to the first error section.
        expect(screen.getByRole("tab", {name: /^Paytable/})).toHaveFocus();
        await user.type(payout, "7");
        expect(create).toBeDisabled();
        await waitFor(() => expect(validatedPayouts.at(-1)).toBe(7));
        await waitFor(() => expect(create).toBeEnabled());
        expect(payout).toHaveFocus();
        expect(screen.queryByText(/Payout must be positive/)).not.toBeInTheDocument();
    });

    it("marks a raw Blueprint payout dirty before blur and carries its current value into JSON", async () => {
        const user = userEvent.setup();
        const onDirtyChange = jest.fn();
        const blueprintOnDisk = {
            manifest: {id: "tiny", name: "Tiny", version: "1.0.0"}, reels: 2, rows: 1,
            symbols: ["A"], paytable: {A: {2: 5}}, availableBets: [1], reelStrips: [["A"], ["A"]],
        };
        const fetchImpl: FetchLike = (url) => Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(
            url === "/api/home/blueprints/load"
                ? {status: "ok", path: "/games/tiny.json", blueprint: blueprintOnDisk, blueprintHash: "h1"}
                : {status: "unchanged"},
        )});
        renderWithProviders(<BlueprintEditorPage initialPath="/games/tiny.json" onDirtyChange={onDirtyChange} />, {fetchImpl});
        const payout = await screen.findByLabelText("A x2 payout");
        onDirtyChange.mockClear();
        await user.clear(payout);
        await user.type(payout, "7");
        expect(payout).toHaveFocus();
        expect(onDirtyChange).toHaveBeenCalledWith(true);
        await user.click(screen.getByRole("radio", {name: "JSON"}));
        const blueprint = JSON.parse((screen.getByLabelText("Blueprint JSON") as HTMLTextAreaElement).value);
        expect(blueprint.paytable).toEqual({A: {2: 7}});
    });
});
