import {screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useRef, useState} from "react";
import {LayoutFieldset} from "../../../../../../cli/studio-client/src/components/blueprintEditor/LayoutFieldset";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

function Harness() {
    const [blueprint, setBlueprint] = useState<Record<string, unknown>>({
        reels: 5,
        rows: 3,
        paylines: [[0, 0, 0, 0, 0]],
        reelStrips: [["A"], ["A"], ["A"], ["A"], ["A"]],
    });
    const [mutationCount, setMutationCount] = useState(0);
    const blueprintRef = useRef(blueprint);
    return <>
        <LayoutFieldset
            blueprint={blueprint}
            mutate={(change) => {
                const current = blueprintRef.current;
                const draft = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
                change(draft);
                if (draft.reels !== current.reels) {
                    setMutationCount((count) => count + 1);
                }
                blueprintRef.current = draft;
                setBlueprint(draft);
            }}
        />
        <output aria-label="Saved layout">{JSON.stringify(blueprint)}</output>
        <output aria-label="Layout mutation count">{mutationCount}</output>
    </>;
}

describe("LayoutFieldset", () => {
    it("explains required layout fields and confirms before reducing authored reel data", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness />);

        expect(screen.getByText(/Required: choose the number of reels and visible rows/)).toBeVisible();
        expect(screen.getByText(/Reducing reels can remove custom reel or payline data/)).toBeVisible();

        const reels = screen.getByLabelText("Reels");
        await user.clear(reels);
        await user.type(reels, "3");
        await user.tab();

        const confirmation = await screen.findByRole("dialog");
        expect(confirmation).toHaveTextContent("Reduce reels from 5 to 3? Custom paylines and reel definitions beyond reel 3 will be removed.");
        expect(screen.getByLabelText("Saved layout")).toHaveTextContent('"reels":5');
        expect(screen.getByLabelText("Saved layout")).toHaveTextContent('"reelStrips":[["A"],["A"],["A"],["A"],["A"]]');

        await user.click(within(confirmation).getByRole("button", {name: "Cancel"}));
        expect(screen.getByLabelText("Saved layout")).toHaveTextContent('"reels":5');
        expect(reels).toHaveValue("5");
        expect(screen.getByLabelText("Layout mutation count")).toHaveTextContent("0");

        await user.clear(reels);
        await user.type(reels, "3");
        await user.tab();
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", {name: "Confirm"}));

        expect(screen.getByLabelText("Saved layout")).toHaveTextContent('"reels":3');
        expect(screen.getByLabelText("Saved layout")).toHaveTextContent('"reelStrips":[["A"],["A"],["A"]]');
        expect(screen.getByLabelText("Layout mutation count")).toHaveTextContent("1");
    });
});
