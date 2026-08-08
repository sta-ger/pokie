/**
 * @jest-environment jsdom
 */
import {
    applyPersistentHighlights,
    clearConnectionError,
    renderBetInfo,
    renderConnectionError,
    renderFeatureCounters,
    renderLineDefinitionsList,
    renderModeInfo,
    renderPaytable,
    renderReelsGrid,
    renderWinHighlightsList,
    renderWinsSection,
} from "../../../../cli/client/player/renderPlayer.js";
import type {WinHighlight} from "../../../../cli/client/player/videoSlotRoundView.js";

// The one place this repo's own fast Jest environment renders the canonical player's DOM half --
// videoSlotRoundView.test.ts already covers the pure derive* functions this module is built on top
// of; this file is what's missing per renderPlayer.ts's own top-of-file comment ("deliberately not
// unit-tested"). Kept deliberately narrow: proving each function produces markup a consumer (this
// repo's own cli/client/main.ts, or pokie-examples' ui.ts) can rely on, not re-testing derivation.

describe("renderReelsGrid", () => {
    it("renders one cell per symbol, addressable by its own [reelIndex, rowIndex] cell id", () => {
        const container = document.createElement("div");
        renderReelsGrid(container, [["A", "K"], ["Q"]]);

        const cells = container.querySelectorAll("[data-cell]");
        expect(cells).toHaveLength(3);
        expect(container.querySelector('[data-cell="0:0"]')?.textContent).toBe("A");
        expect(container.querySelector('[data-cell="1:0"]')?.textContent).toBe("K");
        expect(container.querySelector('[data-cell="0:1"]')?.textContent).toBe("Q");
    });

    it("clears any previously rendered grid before rendering the new one", () => {
        const container = document.createElement("div");
        renderReelsGrid(container, [["A"]]);
        renderReelsGrid(container, [["B"]]);

        expect(container.querySelectorAll("[data-cell]")).toHaveLength(1);
        expect(container.querySelector('[data-cell="0:0"]')?.textContent).toBe("B");
    });
});

describe("applyPersistentHighlights", () => {
    it("tints every highlighted cell with its own kind's persistent color", () => {
        const container = document.createElement("div");
        renderReelsGrid(container, [["A"], ["A"]]);

        const highlights: WinHighlight[] = [{id: "line:0", kind: "line", label: "Line: 0", winAmount: 10, positions: [[0, 0]]}];
        applyPersistentHighlights(container, highlights);

        const cell = container.querySelector('[data-cell="0:0"]') as HTMLElement;
        expect(cell.style.backgroundColor).not.toBe("");
        expect(container.querySelector('[data-cell="0:1"]')).toHaveProperty("style.backgroundColor", "");
    });
});

describe("renderWinHighlightsList", () => {
    it("renders one hover row per highlight, restoring a line's own cells to their persistent tint on mouseleave", () => {
        const grid = document.createElement("div");
        renderReelsGrid(grid, [["A"], ["A"]]);
        const highlights: WinHighlight[] = [
            {
                id: "line:0",
                kind: "line",
                label: "Line: 0, win: 10",
                winAmount: 10,
                positions: [[0, 0]],
                line: {lineId: "0", definition: [0, 0], pattern: [1, 0], symbolsPositions: [0], winAmount: 10},
            },
        ];
        applyPersistentHighlights(grid, highlights);

        const list = document.createElement("div");
        renderWinHighlightsList(list, grid, highlights);

        const button = list.querySelector("button") as HTMLButtonElement;
        expect(button.textContent).toBe("Line: 0, win: 10");

        const winningCell = grid.querySelector('[data-cell="0:0"]') as HTMLElement;
        const baseColor = winningCell.style.backgroundColor;

        button.dispatchEvent(new MouseEvent("mouseenter"));
        expect(winningCell.style.backgroundColor).toBe("rgb(0, 255, 0)");

        button.dispatchEvent(new MouseEvent("mouseleave"));
        expect(winningCell.style.backgroundColor).toBe(baseColor);
    });

    it("clears any previously rendered list before rendering the new one", () => {
        const grid = document.createElement("div");
        const list = document.createElement("div");
        renderWinHighlightsList(list, grid, [{id: "scatter:S", kind: "scatter", label: "Scatter: S", winAmount: 5, positions: []}]);
        renderWinHighlightsList(list, grid, []);

        expect(list.children).toHaveLength(0);
    });
});

describe("renderWinsSection", () => {
    it("hides the section when there's no win, shows it otherwise", () => {
        const section = document.createElement("div");
        renderWinsSection(section, false);
        expect(section.hidden).toBe(true);
        renderWinsSection(section, true);
        expect(section.hidden).toBe(false);
    });
});

describe("renderLineDefinitionsList", () => {
    it("renders one hover row per line definition, independent of whether it won this round", () => {
        const list = document.createElement("div");
        const grid = document.createElement("div");
        renderLineDefinitionsList(list, grid, [{lineId: "0", definition: [0, 1]}, {lineId: "1", definition: [1, 0]}]);

        expect(list.querySelectorAll("button")).toHaveLength(2);
        expect(list.textContent).toContain("Line: 0");
        expect(list.textContent).toContain("Line: 1");
    });
});

describe("renderFeatureCounters", () => {
    it("hides the element and clears it when there are no counters", () => {
        const el = document.createElement("dl");
        el.appendChild(document.createElement("dt"));
        renderFeatureCounters(el, []);
        expect(el.hidden).toBe(true);
        expect(el.children).toHaveLength(0);
    });

    it("renders a dt/dd pair per counter and unhides the element", () => {
        const el = document.createElement("dl");
        renderFeatureCounters(el, [{label: "FG num", value: 3}]);
        expect(el.hidden).toBe(false);
        expect(el.querySelector("dt")?.textContent).toBe("FG num");
        expect(el.querySelector("dd")?.textContent).toBe("3");
    });
});

describe("renderPaytable", () => {
    it("renders nothing when there's no paytable", () => {
        const head = document.createElement("tr");
        const body = document.createElement("tbody");
        renderPaytable(head, body, undefined);
        expect(head.children).toHaveLength(0);
        expect(body.children).toHaveLength(0);
    });

    it("renders a Symbol header plus one column per multiplier, and one row per symbol", () => {
        const head = document.createElement("tr");
        const body = document.createElement("tbody");
        renderPaytable(head, body, {multipliers: [3, 4], rows: [{symbolId: "Ace", amounts: [6, 8]}, {symbolId: "King", amounts: [undefined, 4]}]});

        expect(head.textContent).toBe("Symbol34");
        expect(body.querySelectorAll("tr")).toHaveLength(2);
        expect(body.textContent).toBe("Ace68King4");
    });
});

describe("renderBetInfo / renderModeInfo", () => {
    it("renders the current bet as plain text with no options when only one bet is available", () => {
        const el = document.createElement("div");
        renderBetInfo(el, [10], 10, () => undefined);
        expect(el.textContent).toBe("Bet: 10");
        expect(el.querySelectorAll("button")).toHaveLength(0);
    });

    it("renders a clickable option per available bet, disabling the current one, and reports the raw number back on selection", () => {
        const el = document.createElement("div");
        const onSelectBet = jest.fn();
        renderBetInfo(el, [10, 20], 10, onSelectBet);

        const buttons = Array.from(el.querySelectorAll("button"));
        expect(buttons.map((b) => b.textContent)).toEqual(["10", "20"]);
        expect(buttons[0].disabled).toBe(true);
        expect(buttons[1].disabled).toBe(false);

        buttons[1].dispatchEvent(new MouseEvent("click", {bubbles: true}));
        expect(onSelectBet).toHaveBeenCalledWith(20);
    });

    it("renders nothing when there's no current bet mode and no available modes (a session that never opted into bet-mode selection)", () => {
        const el = document.createElement("div");
        renderModeInfo(el, [], undefined, () => undefined);
        expect(el.textContent).toBe("");
        expect(el.querySelectorAll("button")).toHaveLength(0);
    });

    it("reports the selected mode id back on selection", () => {
        const el = document.createElement("div");
        const onSelectMode = jest.fn();
        renderModeInfo(el, ["base", "ante"], "base", onSelectMode);

        const anteButton = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "ante") as HTMLButtonElement;
        anteButton.dispatchEvent(new MouseEvent("click", {bubbles: true}));
        expect(onSelectMode).toHaveBeenCalledWith("ante");
    });
});

describe("renderConnectionError / clearConnectionError", () => {
    it("unhides the container, sets the readable message and technical detail, and wires the retry button", () => {
        const container = document.createElement("div");
        const message = document.createElement("p");
        const detail = document.createElement("pre");
        const retryButton = document.createElement("button");
        container.hidden = true;
        const onRetry = jest.fn();

        renderConnectionError({container, message, detail, retryButton}, "Round failed: network error", "Error: network error\n  at ...", onRetry);

        expect(container.hidden).toBe(false);
        expect(message.textContent).toBe("Round failed: network error");
        expect(detail.textContent).toBe("Error: network error\n  at ...");

        retryButton.dispatchEvent(new MouseEvent("click"));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("hides the container again", () => {
        const container = document.createElement("div");
        container.hidden = false;
        clearConnectionError(container);
        expect(container.hidden).toBe(true);
    });
});
