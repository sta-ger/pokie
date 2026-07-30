import {screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useState} from "react";
import {PaylinesEditor} from "../../../../../../cli/studio-client/src/components/blueprintEditor/PaylinesEditor";
import type {BlueprintMutate} from "../../../../../../cli/studio-client/src/hooks/useBlueprintEditor";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

function Harness({initialBlueprint}: {initialBlueprint: Record<string, unknown>}) {
    const [blueprint, setBlueprint] = useState(initialBlueprint);
    const mutate: BlueprintMutate = (fn) => {
        const next = {...blueprint};
        fn(next);
        setBlueprint(next);
    };
    return <PaylinesEditor blueprint={blueprint} mutate={mutate} />;
}

// Mantine's Modal mounts its content through a fade transition -- the same reason every existing modal
// test in this app (see NewBlueprintDialog's own test suite) awaits its first post-open query with
// findBy* instead of getBy*. Waiting here for a button that's always present once the modal has actually
// mounted lets every query after this one use the synchronous getBy*/queryBy* forms.
async function openPresetModal(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("button", {name: "Apply preset…"}));
    await screen.findByRole("button", {name: "Close"});
}

describe("PaylinesEditor presets", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("lists the required 5x3 preset family with mini previews", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness initialBlueprint={{reels: 5, rows: 3, paylines: []}} />);

        await openPresetModal(user);
        const group5x3 = within(screen.getByRole("group", {name: "5 reels × 3 rows preset group"}));

        expect(group5x3.getByText("Center (1 line)")).toBeInTheDocument();
        expect(group5x3.getByText("3 horizontals")).toBeInTheDocument();
        expect(group5x3.getByText("Classic 5")).toBeInTheDocument();
        expect(group5x3.getByText("Classic 9")).toBeInTheDocument();
        expect(group5x3.getByText("Classic 10")).toBeInTheDocument();
        expect(group5x3.getByText("Classic 20")).toBeInTheDocument();
        expect(group5x3.getByLabelText("Preview: 5 × 3, 9 lines")).toBeInTheDocument();
    });

    it("Replace swaps existing paylines for the preset's lines", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness initialBlueprint={{reels: 5, rows: 3, paylines: [[2, 2, 2, 2, 2]]}} />);

        await openPresetModal(user);
        const group5x3 = within(screen.getByRole("group", {name: "5 reels × 3 rows preset group"}));
        const centerRow = group5x3.getByText("Center (1 line)").closest("tr") as HTMLElement;
        await user.click(within(centerRow).getByRole("button", {name: "Replace"}));

        expect(screen.getByLabelText("Payline 1 reel 1 row")).toHaveValue("1");
        expect(screen.queryByLabelText("Payline 2 reel 1 row")).not.toBeInTheDocument();
    });

    it("Append adds the preset's lines after the existing manual ones, never erasing them", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness initialBlueprint={{reels: 5, rows: 3, paylines: [[2, 2, 2, 2, 2]]}} />);

        await openPresetModal(user);
        const group5x3 = within(screen.getByRole("group", {name: "5 reels × 3 rows preset group"}));
        const centerRow = group5x3.getByText("Center (1 line)").closest("tr") as HTMLElement;
        await user.click(within(centerRow).getByRole("button", {name: "Append"}));

        expect(screen.getByLabelText("Payline 1 reel 1 row")).toHaveValue("2");
        expect(screen.getByLabelText("Payline 2 reel 1 row")).toHaveValue("1");
    });

    it("disables an incompatible-shape preset group's Apply buttons and explains why", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness initialBlueprint={{reels: 6, rows: 3, paylines: []}} />);

        await openPresetModal(user);
        const group5x3 = within(screen.getByRole("group", {name: "5 reels × 3 rows preset group"}));
        const classic9Row = group5x3.getByText("Classic 9").closest("tr") as HTMLElement;

        expect(within(classic9Row).getByRole("button", {name: "Replace"})).toBeDisabled();
        expect(within(classic9Row).getByRole("button", {name: "Append"})).toBeDisabled();
        expect(group5x3.getByText(/Requires 5 reels/)).toBeInTheDocument();
    });

    it("saves the current paylines as a named custom set, then it's reusable, renamable, and deletable", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness initialBlueprint={{reels: 3, rows: 3, paylines: [[1, 1, 1], [0, 0, 0]]}} />);

        await openPresetModal(user);
        await user.type(screen.getByLabelText("New custom set name"), "My set");
        await user.click(screen.getByRole("button", {name: "Save current paylines as custom set"}));

        expect(await screen.findByLabelText('Custom set "My set" name')).toHaveValue("My set");

        // Rename in place.
        const nameInput = screen.getByLabelText('Custom set "My set" name');
        await user.clear(nameInput);
        await user.type(nameInput, "Renamed set");
        await user.tab();

        expect(await screen.findByLabelText('Custom set "Renamed set" name')).toBeInTheDocument();

        // Reuse via Append.
        const customRow = screen.getByLabelText('Custom set "Renamed set" name').closest("tr") as HTMLElement;
        await user.click(within(customRow).getByRole("button", {name: "Append"}));
        expect(screen.getByLabelText("Payline 3 reel 1 row")).toHaveValue("1");
        expect(screen.getByLabelText("Payline 4 reel 1 row")).toHaveValue("0");

        // Delete it back out.
        await openPresetModal(user);
        await user.click(screen.getByRole("button", {name: 'Delete custom set "Renamed set"'}));
        expect(screen.queryByLabelText('Custom set "Renamed set" name')).not.toBeInTheDocument();
    });

    it("disables Save while there's no name or no current paylines to save", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness initialBlueprint={{reels: 3, rows: 3, paylines: []}} />);

        await openPresetModal(user);

        expect(screen.getByRole("button", {name: "Save current paylines as custom set"})).toBeDisabled();
    });
});
