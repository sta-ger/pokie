import {useState} from "react";
import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {SymbolWeightsEditor} from "../../../../../../cli/studio-client/src/components/blueprintEditor/SymbolWeightsEditor";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

function Editor({weights = {}}: {weights?: Record<string, number>}) {
    const [blueprint, setBlueprint] = useState<Record<string, unknown>>({symbols: ["A", "B"], symbolWeights: weights});
    return <>
        <SymbolWeightsEditor blueprint={blueprint} mutate={change => setBlueprint(previous => {
            const next = JSON.parse(JSON.stringify(previous)) as Record<string, unknown>;
            change(next);
            return next;
        })} />
        <div data-testid="applied-weights">{JSON.stringify(blueprint.symbolWeights)}</div>
    </>;
}

describe("SymbolWeightsEditor invalid-input recovery", () => {
    beforeAll(() => {
        Element.prototype.scrollIntoView = jest.fn();
    });
    it("retains the observed blank-symbol/-1 submission with field feedback, then adds only a corrected weight", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Editor />);
        const weight = screen.getByRole("textbox", {name: "Weight"});
        await user.type(weight, "-1");
        await user.click(screen.getByRole("button", {name: "Add weight"}));
        expect(weight).toHaveValue("-1");
        expect(weight).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText("Choose a symbol before adding a weight.")).toBeVisible();
        expect(screen.getByText("Weight must be a positive integer.")).toBeVisible();
        expect(screen.getByTestId("applied-weights")).toHaveTextContent("{}");
        await user.click(screen.getByRole("combobox", {name: "Symbol"}));
        await user.keyboard("{ArrowDown}{Enter}");
        expect(screen.getByRole("combobox", {name: "Symbol"})).toHaveValue("A");
        // The same -1 is rejected with a selected symbol as well.
        await user.click(screen.getByRole("button", {name: "Add weight"}));
        expect(weight).toHaveValue("-1");
        expect(screen.getByTestId("applied-weights")).toHaveTextContent("{}");
        await user.clear(weight);
        await user.type(weight, "2");
        await user.click(screen.getByRole("button", {name: "Add weight"}));
        expect(screen.getByTestId("applied-weights")).toHaveTextContent('{"A":2}');
        expect(screen.getByRole("status")).toHaveTextContent("A weight added to the draft. Save to keep the change.");
        expect(weight).not.toHaveAttribute("aria-invalid", "true");
        expect(screen.queryByText("Choose a symbol before adding a weight.")).not.toBeInTheDocument();
    });

    it("keeps invalid existing-row edits visible without changing the applied value, then reuses the row", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Editor weights={{A: 2}} />);
        const weight = screen.getByRole("textbox", {name: "A weight"});
        for (const invalid of ["-1", "", "1.5"]) {
            await user.clear(weight);
            if (invalid) await user.type(weight, invalid);
            await user.tab();
            expect(weight).toHaveValue(invalid);
            expect(weight).toHaveAttribute("aria-invalid", "true");
            expect(screen.getByTestId("applied-weights")).toHaveTextContent('{"A":2}');
        }
        for (const valid of ["3", "4"]) {
            await user.clear(weight);
            await user.type(weight, valid);
            await user.tab();
            expect(weight).not.toHaveAttribute("aria-invalid", "true");
            expect(screen.getByTestId("applied-weights")).toHaveTextContent(`{"A":${valid}}`);
        }
    });
});
