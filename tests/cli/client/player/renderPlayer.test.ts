/** @jest-environment jsdom */
import {createPlayerRoundElements, renderPlayerRound} from "../../../../cli/client/player/renderPlayer.js";

describe("canonical player presentation", () => {
    it("outlines winning cells and labels every symbol on screen", () => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const elements = createPlayerRoundElements(root);
        renderPlayerRound(elements, {
            reelsSymbols: [["A", "K"], ["A", "Q"]],
            highlights: [{
                id: "line-0",
                kind: "line",
                label: "Line 1 · A × 2",
                winAmount: 5,
                positions: [[0, 0], [1, 0]],
            }],
            paytable: {multipliers: [2], rows: [{symbolId: "A", amounts: [5]}]},
        });

        expect(root.querySelector('[data-cell="0:0"]')?.getAttribute("data-winning")).toBe("true");
        expect(root.querySelector('[data-cell="0:1"]')?.getAttribute("data-winning")).toBe("true");
        expect(root.querySelector('[data-cell="1:1"]')?.getAttribute("data-winning")).toBeNull();
        expect(root.querySelector('[data-symbol="A"]')?.textContent).toContain("2 symbols → ×5");
        expect(root.querySelector(".player-wins")?.textContent).toContain("Winning cells are outlined");
    });

    it("keeps the legend but hides the wins section when there is no win", () => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const elements = createPlayerRoundElements(root);
        renderPlayerRound(elements, {
            reelsSymbols: [["A", "K"]],
            highlights: [],
        });
        expect(elements.winsSection.hidden).toBe(true);
        expect(root.querySelector(".player-symbol-legend")?.hasAttribute("hidden")).toBe(false);
        expect(root.querySelector('[data-cell="0:0"]')?.getAttribute("data-winning")).toBeNull();
    });
});
