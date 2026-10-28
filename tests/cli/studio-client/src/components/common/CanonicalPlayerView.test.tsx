import {MantineProvider} from "@mantine/core";
import {fireEvent, render, within} from "@testing-library/react";
import {CanonicalPlayerView} from "../../../../../../cli/studio-client/src/components/common/CanonicalPlayerView";
import {boundedPlayChain} from "../../../../studio/runtime/fixtures/boundedPlayChain";

function renderPlayer(view: React.ComponentProps<typeof CanonicalPlayerView>) {
    return render(<MantineProvider><CanonicalPlayerView {...view} /></MantineProvider>);
}

describe("CanonicalPlayerView", () => {
    it.each(["cascade", "cascade-respins-collection"] as const)("uses the real %s step screen, highlights and win basis without mixing in aggregate multipliers", async variant => {
        const chain = await boundedPlayChain(variant, 26);
        const {rerender, container} = renderPlayer({reelsSymbols: []});
        for (const view of chain) {
            const round = view.logicalRound!;
            const step = round.currentStep!;
            const artifact = view.debug!.artifact!;
            rerender(<MantineProvider><CanonicalPlayerView
                logicalRound={round} reelsSymbols={artifact.screen as string[][]} wins={artifact.wins}
                credits={view.credits} totalWin={artifact.totalWin} payoutMultiplier={artifact.payoutMultiplier}
            /></MantineProvider>);
            expect(within(container).getByText("Step win").nextElementSibling).toHaveTextContent(step.totalWin.toFixed(2));
            expect(within(container).getByText("Step win / entry bet").nextElementSibling).toHaveTextContent((step.totalWin / round.entry.bet).toFixed(2));
            expect(Array.from(container.querySelectorAll("[data-cell]")).map(cell => cell.textContent)).toEqual(step.screen[0].map((_, row) => step.screen.map(reel => reel[row])).flat());
            if (round.cursor === 1) {
                expect(container.querySelectorAll(".player-highlight-button").length).toBeGreaterThan(0);
                for (let reel = 0; reel < 3; reel++) expect(container.querySelector<HTMLElement>(`[data-cell="0:${reel}"]`)!.style.backgroundColor).not.toBe("");
            }
            if (step.totalWin === 0) {
                expect(container.querySelectorAll(".player-highlight-button")).toHaveLength(0);
                for (const cell of container.querySelectorAll<HTMLElement>("[data-cell]")) expect(cell.style.backgroundColor).toBe("");
            }
        }
        const terminal = chain[chain.length - 1].logicalRound!;
        expect(terminal.status).toBe("completed");
        expect(terminal.totalWin).toBeGreaterThan(0);
        expect(terminal.currentStep!.totalWin).toBe(0);
        // Reusing the mount for an ordinary round restores the canonical labels and supplied basis.
        rerender(<MantineProvider><CanonicalPlayerView reelsSymbols={[["B"]]} totalWin={0} payoutMultiplier={0} /></MantineProvider>);
        expect(within(container).getByText("Total win").nextElementSibling).toHaveTextContent("0.00");
        expect(within(container).getByText("Payout multiplier").nextElementSibling).toHaveTextContent("0.00");
        expect(within(container).queryByText("Step win")).toBeNull();
    });

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
        expect(player).toHaveClass("pokie-player-card");
        const overview = player.querySelector(".player-round-overview") as HTMLElement;
        expect(overview.querySelector(".player-grid")).not.toBeNull();
        expect(overview.querySelector(".player-round-totals")).not.toBeNull();
        expect(getComputedStyle(overview).display).toBe("flex");
        expect(getComputedStyle(overview).flexWrap).toBe("wrap");
        expect(player.querySelector('[data-cell="0:0"]')?.textContent).toBe("cherry");
        expect(within(player).getByText("Total win").nextElementSibling).toHaveTextContent("10.00");
        expect(within(player).getByText("Free games").nextElementSibling).toHaveTextContent("3");

        const win = within(player).getByRole("button", {name: "Line: line-1, win: 10"});
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
        expect(player).toHaveClass("pokie-player-card");
        expect(player.querySelectorAll(".player-round-overview")).toHaveLength(1);
        expect(within(player).getByText("B")).toHaveAttribute("data-cell", "0:0");
        expect(player.querySelector(".player-wins")).toHaveProperty("hidden", true);
        expect(player.querySelector(".player-features")).toHaveProperty("hidden", true);
        expect(player.querySelector(".player-lines-details")).toHaveProperty("hidden", true);
        expect(player.querySelector(".player-paytable-details")).toHaveProperty("hidden", true);
        expect(player.querySelectorAll(".player-highlight-button")).toHaveLength(0);
        expect(player.querySelectorAll(".player-paytable tbody tr")).toHaveLength(0);
    });
});
