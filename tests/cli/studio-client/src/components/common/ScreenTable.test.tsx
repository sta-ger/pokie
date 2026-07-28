import {MantineProvider} from "@mantine/core";
import {render, screen, within} from "@testing-library/react";
import {ScreenTable} from "../../../../../../cli/studio-client/src/components/common/ScreenTable";

function renderWithMantine(ui: React.ReactElement) {
    return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("ScreenTable orientation", () => {
    it("treats input as reel-major (screen[reelIndex][rowIndex]) and renders reels as columns, visible rows as table rows", () => {
        renderWithMantine(
            <ScreenTable
                screen={[
                    ["A1", "A2", "A3"],
                    ["B1", "B2", "B3"],
                    ["C1", "C2", "C3"],
                ]}
            />,
        );

        const rows = screen.getAllByRole("row");
        expect(rows).toHaveLength(3);
        // Each table row must read across reels at a fixed visible-row position, not down a single
        // reel's own strip -- the exact transposition bug this guards against.
        expect(within(rows[0]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["A1", "B1", "C1"]);
        expect(within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["A2", "B2", "C2"]);
        expect(within(rows[2]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["A3", "B3", "C3"]);
    });

    it("pads a shorter reel with an empty cell instead of misaligning ragged reels", () => {
        renderWithMantine(
            <ScreenTable
                screen={[
                    ["A1", "A2"],
                    ["B1"],
                ]}
            />,
        );

        const rows = screen.getAllByRole("row");
        expect(rows).toHaveLength(2);
        expect(within(rows[0]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["A1", "B1"]);
        expect(within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["A2", ""]);
    });

    it("renders a single reel's visible window as stacked rows, one cell per row", () => {
        renderWithMantine(<ScreenTable screen={[["X1", "X2", "X3"]]} />);

        const rows = screen.getAllByRole("row");
        expect(rows).toHaveLength(3);
        rows.forEach((row, index) => {
            expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([`X${index + 1}`]);
        });
    });
});
