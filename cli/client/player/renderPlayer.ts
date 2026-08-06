import {
    highlightHoverColor,
    highlightPersistentColor,
    type FeatureCounter,
    type LineDefinitionView,
    type PaytableView,
    type WinHighlight,
    type WinHighlightKind,
} from "./videoSlotRoundView.js";

// Thin DOM-manipulation layer, deliberately not unit-tested -- same rationale as cli/client/dom.ts's
// own comment (no DOM globals in this repo's fast Jest environment). Every function here is a direct,
// manually-verified translation of an already-derived view (see videoSlotRoundView.ts) into markup; no
// decision-making about what a response means lives here.

type CellElement = HTMLElement & {baseColor: string};

function cellId(reelIndex: number, rowIndex: number): string {
    return `${rowIndex}:${reelIndex}`;
}

function getCell(gridEl: HTMLElement, reelIndex: number, rowIndex: number): CellElement | null {
    return gridEl.querySelector<HTMLElement>(`[data-cell="${cellId(reelIndex, rowIndex)}"]`) as CellElement | null;
}

function clearChildren(el: HTMLElement): void {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}

// Renders one row with one column per reel, each column an independently-sized stack of cells -- this
// handles both a uniform grid (every reel the same height) and a jagged one (reels of different
// heights) without a separate code path, since reels never need to line up row-for-row here. Mirrors
// pokie-examples' own drawReelsSymbols.
export function renderReelsGrid(container: HTMLElement, reelsSymbols: string[][]): void {
    clearChildren(container);
    const table = document.createElement("table");
    table.className = "player-grid";
    const tr = document.createElement("tr");
    reelsSymbols.forEach((reelSymbols, reelIndex) => {
        const td = document.createElement("td");
        td.className = "player-reel";
        reelSymbols.forEach((symbol, rowIndex) => {
            const cell = document.createElement("div") as unknown as CellElement;
            cell.dataset.cell = cellId(reelIndex, rowIndex);
            cell.className = "player-cell";
            cell.textContent = symbol;
            cell.baseColor = "";
            td.appendChild(cell);
        });
        tr.appendChild(td);
    });
    table.appendChild(tr);
    container.appendChild(table);
}

// Applies every win's persistent tint, in the same lines-then-scatters/clusters/values/ways order
// deriveWinHighlights returns them -- a cell covered by more than one win ends up tinted by whichever
// highlight was applied last, matching pokie-examples' own drawOutcome sequencing.
export function applyPersistentHighlights(gridEl: HTMLElement, highlights: WinHighlight[]): void {
    highlights.forEach((highlight) => {
        const color = highlightPersistentColor(highlight.kind);
        highlight.positions.forEach(([reelIndex, rowIndex]) => {
            const cell = getCell(gridEl, reelIndex, rowIndex);
            if (cell) {
                cell.style.backgroundColor = color;
                cell.baseColor = color;
            }
        });
    });
}

function addHoverRow(listEl: HTMLElement, label: string, onEnter: () => void, onLeave: () => void): void {
    const wrapper = document.createElement("div");
    wrapper.className = "player-highlight-item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "player-highlight-button";
    button.textContent = label;
    button.addEventListener("mouseenter", onEnter);
    button.addEventListener("mouseleave", onLeave);
    wrapper.appendChild(button);
    listEl.appendChild(wrapper);
}

// The hover-to-highlight win list: a winning line highlights its own winning cells green and every
// other cell on its own definition grey (the pattern-based behavior only a line has); every other win
// kind highlights all of its own cells in one uniform color. Both restore every touched cell back to
// its persistent tint (`baseColor`, set by applyPersistentHighlights) on mouseleave. Mirrors
// pokie-examples' own drawWinningLinesList/addHighlightButton.
export function renderWinHighlightsList(listEl: HTMLElement, gridEl: HTMLElement, highlights: WinHighlight[]): void {
    clearChildren(listEl);

    highlights.forEach((highlight) => {
        if (highlight.kind === "line" && highlight.line) {
            const line = highlight.line;
            addHoverRow(
                listEl,
                highlight.label,
                () => {
                    line.definition.forEach((rowIndex, reelIndex) => {
                        const cell = getCell(gridEl, reelIndex, rowIndex);
                        if (!cell) {
                            return;
                        }
                        const isWinning = line.symbolsPositions.includes(reelIndex) && !!line.pattern[reelIndex];
                        cell.style.backgroundColor = isWinning ? "#00FF00" : "#999999";
                    });
                },
                () => {
                    line.definition.forEach((rowIndex, reelIndex) => {
                        const cell = getCell(gridEl, reelIndex, rowIndex);
                        if (cell) {
                            cell.style.backgroundColor = cell.baseColor;
                        }
                    });
                },
            );
            return;
        }

        const hoverColor = highlightHoverColor(highlight.kind as Exclude<WinHighlightKind, "line">);
        addHoverRow(
            listEl,
            highlight.label,
            () => {
                highlight.positions.forEach(([reelIndex, rowIndex]) => {
                    const cell = getCell(gridEl, reelIndex, rowIndex);
                    if (cell) {
                        cell.style.backgroundColor = hoverColor;
                    }
                });
            },
            () => {
                highlight.positions.forEach(([reelIndex, rowIndex]) => {
                    const cell = getCell(gridEl, reelIndex, rowIndex);
                    if (cell) {
                        cell.style.backgroundColor = cell.baseColor;
                    }
                });
            },
        );
    });
}

export function renderWinsSection(sectionEl: HTMLElement, hasAnyWin: boolean): void {
    sectionEl.hidden = !hasAnyWin;
}

// Hover-to-preview a line's own definition (not a win -- shown regardless of whether that line paid
// this round), grey on hover, restored to the current persistent tint on leave. Mirrors ui.ts's own
// linesDefinitionsList block.
export function renderLineDefinitionsList(listEl: HTMLElement, gridEl: HTMLElement, lines: LineDefinitionView[]): void {
    clearChildren(listEl);
    lines.forEach((line) => {
        addHoverRow(
            listEl,
            `Line: ${line.lineId}`,
            () => {
                line.definition.forEach((rowIndex, reelIndex) => {
                    const cell = getCell(gridEl, reelIndex, rowIndex);
                    if (cell) {
                        cell.style.backgroundColor = "#999999";
                    }
                });
            },
            () => {
                line.definition.forEach((rowIndex, reelIndex) => {
                    const cell = getCell(gridEl, reelIndex, rowIndex);
                    if (cell) {
                        cell.style.backgroundColor = cell.baseColor;
                    }
                });
            },
        );
    });
}

export function renderFeatureCounters(el: HTMLElement, counters: FeatureCounter[]): void {
    clearChildren(el);
    el.hidden = counters.length === 0;
    counters.forEach((counter) => {
        const dt = document.createElement("dt");
        dt.textContent = counter.label;
        const dd = document.createElement("dd");
        dd.textContent = String(counter.value);
        el.appendChild(dt);
        el.appendChild(dd);
    });
}

export function renderPaytable(headEl: HTMLElement, bodyEl: HTMLElement, paytable: PaytableView | undefined): void {
    clearChildren(headEl);
    clearChildren(bodyEl);
    if (!paytable) {
        return;
    }

    const symbolHeader = document.createElement("th");
    symbolHeader.textContent = "Symbol";
    headEl.appendChild(symbolHeader);
    paytable.multipliers.forEach((multiplier) => {
        const th = document.createElement("th");
        th.textContent = String(multiplier);
        headEl.appendChild(th);
    });

    paytable.rows.forEach((row) => {
        const tr = document.createElement("tr");
        const symbolCell = document.createElement("td");
        symbolCell.textContent = row.symbolId;
        tr.appendChild(symbolCell);
        row.amounts.forEach((amount) => {
            const td = document.createElement("td");
            td.textContent = amount === undefined ? "" : String(amount);
            tr.appendChild(td);
        });
        bodyEl.appendChild(tr);
    });
}

// Interactive whenever the runtime actually exposes more than one bet to choose from (see
// deriveAvailableBets/GameSessionHandling.getAvailableBets() -- every video-slot session always
// reports its own real availableBets, never an invented list) -- clicking a bet other than the
// round's own current one calls onSelectBet(bet), which the caller wires to spin()'s own optional
// bet parameter (see cli/client/apiClient.ts and src/server/spin/SpinCommandHandling.ts) so the next
// spin actually runs staked at that amount, not just displays it. A single available bet renders as
// plain text -- nothing to choose between, so no button.
export function renderBetInfo(el: HTMLElement, availableBets: number[], currentBet: number | undefined, onSelectBet: (bet: number) => void): void {
    clearChildren(el);
    if (currentBet !== undefined) {
        const current = document.createElement("span");
        current.className = "player-bet-current";
        current.textContent = `Bet: ${currentBet}`;
        el.appendChild(current);
    }
    if (availableBets.length <= 1) {
        return;
    }

    const options = document.createElement("span");
    options.className = "player-bet-options";
    availableBets.forEach((bet) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "player-bet-option" + (bet === currentBet ? " player-bet-option-selected" : "");
        button.textContent = String(bet);
        button.disabled = bet === currentBet;
        button.addEventListener("click", () => onSelectBet(bet));
        options.appendChild(button);
    });
    el.appendChild(options);
}

// A short, readable message plus the raw technical detail (an Error's message/stack, or a response
// body) behind a collapsed <details> -- never shown expanded by default, so a player sees "couldn't
// connect, try again" instead of a stack trace, while the detail is still one click away for whoever's
// debugging it.
export function renderConnectionError(
    elements: {container: HTMLElement; message: HTMLElement; detail: HTMLElement; retryButton: HTMLButtonElement},
    readableMessage: string,
    technicalDetail: string,
    onRetry: () => void,
): void {
    elements.container.hidden = false;
    elements.message.textContent = readableMessage;
    elements.detail.textContent = technicalDetail;
    elements.retryButton.onclick = onRetry;
}

export function clearConnectionError(container: HTMLElement): void {
    container.hidden = true;
}
