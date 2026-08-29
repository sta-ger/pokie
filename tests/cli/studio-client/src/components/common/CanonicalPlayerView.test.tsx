import {MantineProvider} from "@mantine/core";
import {fireEvent, render, within} from "@testing-library/react";
import {CanonicalPlayerView} from "../../../../../../cli/studio-client/src/components/common/CanonicalPlayerView";

function renderPlayer(view: React.ComponentProps<typeof CanonicalPlayerView>) {
    return render(<MantineProvider><CanonicalPlayerView {...view} /></MantineProvider>);
}

describe("CanonicalPlayerView", () => {
    it("mounts the package player contract with the same controls, highlights and player region semantics as external DOM hosts", () => {
        const onSelectBet = jest.fn();
        const onSelectMode = jest.fn();
        const {container} = renderPlayer({
            reelsSymbols: [["cherry"], ["cherry"], ["lemon"]],
            wins: [{
                type: "line",
                id: "line-1",
                symbolId: "cherry",
                winAmount: 10,
                winningPositions: [[0, 0], [1, 0]],
                metadata: {definition: [0, 0, 0]},
            }],
            credits: 110,
            totalWin: 10,
            payoutMultiplier: 2,
            featureCounters: [{label: "Free games", value: 3}],
            lines: [{lineId: "1", definition: [0, 0, 0]}],
            paytable: {multipliers: [3], rows: [{symbolId: "cherry", amounts: [10]}]},
            availableBets: [5, 10],
            currentBet: 5,
            onSelectBet,
            availableModeIds: ["base", "ante"],
            currentModeId: "base",
            onSelectMode,
        });

        const player = container.querySelector('[data-pokie-player="canonical-v1"]') as HTMLElement;
        expect(player).toHaveAttribute("aria-label", "Game player");
        expect(player.querySelector('[data-cell="0:0"]')?.textContent).toBe("cherry");
        expect(within(player).getByText("Total win").nextElementSibling).toHaveTextContent("10.00");
        expect(within(player).getByText("Free games").nextElementSibling).toHaveTextContent("3");

        const win = within(player).getByRole("button", {name: "line: cherry, win: 10"});
        fireEvent.mouseEnter(win);
        expect((within(player.querySelector(".player-grid") as HTMLElement).getAllByText("cherry")[0] as HTMLElement).style.backgroundColor).toBe("rgb(0, 255, 0)");
        fireEvent.mouseLeave(win);

        fireEvent.click(within(player).getByRole("button", {name: "Select bet 10"}));
        fireEvent.click(within(player).getByRole("button", {name: "Select mode ante"}));
        expect(onSelectBet).toHaveBeenCalledWith(10);
        expect(onSelectMode).toHaveBeenCalledWith("ante");
    });

    it("clears player-only details when a later plain round replaces a winning feature round", () => {
        const {container, rerender} = renderPlayer({
            reelsSymbols: [["A"]],
            wins: [{type: "scatter", id: "scatter", symbolId: "S", winAmount: 2, winningPositions: [[0, 0]], metadata: {}}],
            featureCounters: [{label: "Free games", value: 1}],
            lines: [{lineId: "1", definition: [0]}],
            paytable: {multipliers: [3], rows: [{symbolId: "A", amounts: [2]}]},
        });

        rerender(<MantineProvider><CanonicalPlayerView reelsSymbols={[["B"]]} /></MantineProvider>);

        const player = container.querySelector('[data-pokie-player="canonical-v1"]') as HTMLElement;
        expect(within(player).getByText("B")).toHaveAttribute("data-cell", "0:0");
        expect(player.querySelector(".player-wins")).toHaveProperty("hidden", true);
        expect(player.querySelector(".player-features")).toHaveProperty("hidden", true);
        expect(player.querySelector(".player-lines-details")).toHaveProperty("hidden", true);
        expect(player.querySelector(".player-paytable-details")).toHaveProperty("hidden", true);
        expect(player.querySelectorAll(".player-highlight-button")).toHaveLength(0);
        expect(player.querySelectorAll(".player-paytable tbody tr")).toHaveLength(0);
    });
});
