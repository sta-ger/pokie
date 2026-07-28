import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useState} from "react";
import {BetModesEditor} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BetModesEditor";
import type {BlueprintMutate} from "../../../../../../cli/studio-client/src/hooks/useBlueprintEditor";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

// A minimal controlled harness -- newBetModeId/onNewBetModeIdChange are normally lifted into
// MechanicsEditorTab (so the draft survives switching Stepper steps, see BetModesEditor's own doc
// comment), but that lifecycle detail doesn't matter to this component's own validation/next-action
// behavior, which this harness exercises directly with a plain useState in its place.
function Harness({initialBlueprint}: {initialBlueprint: Record<string, unknown>}) {
    const [blueprint, setBlueprint] = useState(initialBlueprint);
    const [newBetModeId, setNewBetModeId] = useState("");
    const mutate: BlueprintMutate = (fn) => {
        const next = {...blueprint};
        fn(next);
        setBlueprint(next);
    };
    return <BetModesEditor blueprint={blueprint} mutate={mutate} newBetModeId={newBetModeId} onNewBetModeIdChange={setNewBetModeId} />;
}

describe("BetModesEditor", () => {
    it("renders existing bet modes and disables Add while the new-mode id is blank", () => {
        renderWithProviders(<Harness initialBlueprint={{betModes: [{id: "base"}]}} />);

        expect(screen.getByLabelText("Bet mode 1 id")).toHaveValue("base");
        expect(screen.getByRole("button", {name: "Add bet mode"})).toBeDisabled();
    });

    it("adds a new bet mode and clears the draft once it's ready", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness initialBlueprint={{betModes: [{id: "base"}]}} />);

        await user.type(screen.getByLabelText("New bet mode id"), "buy-bonus");
        expect(screen.getByRole("button", {name: "Add bet mode"})).toBeEnabled();

        await user.click(screen.getByRole("button", {name: "Add bet mode"}));

        expect(screen.getByLabelText("Bet mode 2 id")).toHaveValue("buy-bonus");
        expect(screen.getByLabelText("New bet mode id")).toHaveValue("");
    });

    it("submits on Enter the same as clicking Add", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness initialBlueprint={{betModes: []}} />);

        await user.type(screen.getByLabelText("New bet mode id"), "ante{Enter}");

        expect(screen.getByLabelText("Bet mode 1 id")).toHaveValue("ante");
    });

    it("shows a validation error and disables Add for a duplicate id, without touching the blueprint", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness initialBlueprint={{betModes: [{id: "base"}]}} />);

        await user.type(screen.getByLabelText("New bet mode id"), "base");

        expect(await screen.findByText(/already used by another bet mode/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Add bet mode"})).toBeDisabled();
        expect(screen.queryByLabelText("Bet mode 2 id")).not.toBeInTheDocument();
    });
});
