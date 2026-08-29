import {
    highlightHoverColor,
    highlightPersistentColor,
    type FeatureCounter,
    type LineDefinitionView,
    type PaytableView,
    type WinHighlight,
} from "./videoSlotRoundView.js";

// Thin DOM-manipulation layer, deliberately not unit-tested -- same rationale as cli/client/dom.ts's
// own comment (no DOM globals in this repo's fast Jest environment). Every function here is a direct,
// manually-verified translation of an already-derived view (see videoSlotRoundView.ts) into markup; no
// decision-making about what a response means lives here.

type CellElement = HTMLElement & {baseColor: string};

// This stylesheet is intentionally installed by the renderer instead of being copied into each host
// application's stylesheet.  The dev client, Studio and package consumers therefore share both the
// player DOM and the rules that make that DOM usable at narrow widths.
export const PLAYER_PRESENTATION_STYLE_ID = "pokie-canonical-player-presentation";

const PLAYER_PRESENTATION_CSS = `
.pokie-player { max-width: 100%; min-width: 0; }
.pokie-player-grid-scroll { max-width: 100%; overflow-x: auto; }
.player-grid { border-collapse: collapse; margin-bottom: 1rem; max-width: 100%; }
.player-reel { vertical-align: top; padding: 0; }
.player-cell { box-sizing: border-box; height: 3rem; min-width: 3rem; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 700; border: 3px solid currentColor; overflow: hidden; }
.player-symbol-artwork { max-width: 100%; }
.player-bet-info, .player-mode-info { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center; }
.player-bet-options, .player-mode-options { display: inline-flex; gap: .35rem; flex-wrap: wrap; }
.player-bet-option, .player-mode-option, .player-highlight-button { font-size: .875rem; padding: .35rem .75rem; }
.player-bet-option-selected, .player-mode-option-selected { font-weight: 700; }
.player-highlight-item { display: inline-block; padding-right: 1rem; padding-bottom: .5rem; }
.player-paytable-scroll { max-width: 100%; overflow-x: auto; }
.player-paytable { border-collapse: collapse; width: 100%; }
.player-paytable th, .player-paytable td { border: 1px solid currentColor; padding: .35rem .6rem; text-align: center; }
@media (max-width: 480px) { .player-cell { height: 2.25rem; min-width: 2.25rem; font-size: .75rem; } }
`;

/** Installs the canonical, scoped player CSS once for DOM hosts outside the dev client. */
export function installPlayerPresentationStyles(doc: Document = document): void {
    if (doc.getElementById(PLAYER_PRESENTATION_STYLE_ID) !== null) {
        return;
    }
    const style = doc.createElement("style");
    style.id = PLAYER_PRESENTATION_STYLE_ID;
    style.textContent = PLAYER_PRESENTATION_CSS;
    doc.head.appendChild(style);
}

// The complete DOM contract of one Player surface.  Hosts own only these mounting points and the
// transport that supplies PlayerRoundView; this module owns the ordering and rendering of every
// player-specific section.  Keeping that composition here prevents an examples app, the dev client
// and Studio from each growing a subtly different "screen with wins" implementation.
export type PlayerRoundElements = {
    totals?: HTMLElement;
    creditsRow?: HTMLElement;
    totalWinRow?: HTMLElement;
    payoutMultiplierRow?: HTMLElement;
    credits?: HTMLElement;
    totalWin?: HTMLElement;
    payoutMultiplier?: HTMLElement;
    gridContainer: HTMLElement;
    winsSection: HTMLElement;
    winsList: HTMLElement;
    linesDetails?: HTMLDetailsElement;
    linesList: HTMLElement;
    features: HTMLElement;
    betInfo: HTMLElement;
    modeInfo: HTMLElement;
    paytableHead: HTMLElement;
    paytableBody: HTMLElement;
    paytableDetails?: HTMLDetailsElement;
};

/**
 * Creates the complete, ordered Player DOM contract inside a host-owned mount point.
 *
 * A host is deliberately not given individual section markup to reproduce: it supplies one
 * empty mount point and already-computed round data to renderPlayerRound().  That makes the
 * player window, controls, totals, wins, feature state and paytable one implementation whether
 * it is mounted by the standalone client, Studio, or a package consumer.
 */
export function createPlayerRoundElements(root: HTMLElement): PlayerRoundElements {
    const doc = root.ownerDocument;
    clearChildren(root);
    root.classList.add("pokie-player");
    root.dataset.pokiePlayer = "canonical-v1";
    root.setAttribute("aria-label", "Game player");

    const create = <T extends keyof HTMLElementTagNameMap>(tag: T, className?: string): HTMLElementTagNameMap[T] => {
        const element = doc.createElement(tag);
        if (className !== undefined) {
            element.className = className;
        }
        return element;
    };
    const appendValue = (totals: HTMLDListElement, label: string): {row: HTMLElement; value: HTMLElement} => {
        const row = create("div", "player-round-total");
        const term = create("dt");
        term.textContent = label;
        const value = create("dd");
        row.append(term, value);
        totals.appendChild(row);
        return {row, value};
    };

    const betInfo = create("div", "player-bet-info");
    const modeInfo = create("div", "player-mode-info");
    const gridScroll = create("div", "pokie-player-grid-scroll");
    const gridContainer = create("div");
    gridScroll.appendChild(gridContainer);

    const totals = create("dl", "player-round-totals");
    totals.setAttribute("aria-label", "Round totals");
    const credits = appendValue(totals, "Credits");
    const totalWin = appendValue(totals, "Total win");
    const payoutMultiplier = appendValue(totals, "Payout multiplier");

    const features = create("dl", "player-features");
    const winsSection = create("section", "player-wins");
    const winsHeading = create("h2");
    winsHeading.textContent = "Wins";
    const winsList = create("div", "player-wins-list");
    winsSection.append(winsHeading, winsList);

    const linesDetails = create("details", "player-lines-details");
    const linesSummary = create("summary");
    linesSummary.textContent = "Paylines / ways";
    const linesList = create("div", "player-lines-list");
    linesDetails.append(linesSummary, linesList);

    const paytableDetails = create("details", "player-paytable-details");
    const paytableSummary = create("summary");
    paytableSummary.textContent = "Paytable";
    const paytableScroll = create("div", "player-paytable-scroll");
    const paytable = create("table", "player-paytable");
    const paytableHead = create("tr");
    const head = create("thead");
    const paytableBody = create("tbody");
    head.appendChild(paytableHead);
    paytable.append(head, paytableBody);
    paytableScroll.appendChild(paytable);
    paytableDetails.append(paytableSummary, paytableScroll);

    root.append(betInfo, modeInfo, gridScroll, totals, features, winsSection, linesDetails, paytableDetails);
    return {
        totals,
        creditsRow: credits.row,
        totalWinRow: totalWin.row,
        payoutMultiplierRow: payoutMultiplier.row,
        credits: credits.value,
        totalWin: totalWin.value,
        payoutMultiplier: payoutMultiplier.value,
        gridContainer,
        winsSection,
        winsList,
        linesDetails,
        linesList,
        features,
        betInfo,
        modeInfo,
        paytableHead,
        paytableBody,
        paytableDetails,
    };
}

export type PlayerRoundView = {
    // Round-level facts are rendered here with the grid and its individual wins, rather than being
    // independently composed by each host surface.  Undefined is an honest unavailable value, not 0.
    credits?: number;
    totalWin?: number;
    payoutMultiplier?: number;
    creditsLabel?: string;
    totalWinLabel?: string;
    payoutMultiplierLabel?: string;
    payoutMultiplierSuffix?: string;
    formatTotalWin?: (value: number) => string;
    formatPayoutMultiplier?: (value: number) => string;
    reelsSymbols: string[][];
    highlights: WinHighlight[];
    featureCounters?: FeatureCounter[];
    lines?: LineDefinitionView[];
    paytable?: PaytableView;
    availableBets?: number[];
    currentBet?: number;
    onSelectBet?: (bet: number) => void;
    availableModeIds?: string[];
    currentModeId?: string;
    onSelectMode?: (modeId: string) => void;
    // An artwork URL is deliberately presentation-only: an unavailable image restores the symbol
    // text and never changes a round's already-computed result.
    artworkUrlForSymbol?: (symbolId: string) => string | undefined;
};

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
export function renderReelsGrid(
    container: HTMLElement,
    reelsSymbols: string[][],
    artworkUrlForSymbol?: (symbolId: string) => string | undefined,
): void {
    clearChildren(container);
    const doc = container.ownerDocument;
    const table = doc.createElement("table");
    table.className = "player-grid";
    const tr = document.createElement("tr");
    reelsSymbols.forEach((reelSymbols, reelIndex) => {
        const td = doc.createElement("td");
        td.className = "player-reel";
        reelSymbols.forEach((symbol, rowIndex) => {
            const cell = doc.createElement("div") as unknown as CellElement;
            cell.dataset.cell = cellId(reelIndex, rowIndex);
            cell.className = "player-cell";
            cell.textContent = symbol;
            cell.baseColor = "";
            const artworkUrl = artworkUrlForSymbol?.(symbol);
            if (artworkUrl !== undefined) {
                const image = doc.createElement("img");
                image.className = "player-symbol-artwork";
                image.src = artworkUrl;
                image.alt = symbol;
                image.width = 28;
                image.height = 28;
                image.style.objectFit = "contain";
                image.onerror = () => {
                    cell.textContent = symbol;
                };
                cell.textContent = "";
                cell.appendChild(image);
            }
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
// other cell on its own configured payline grey (the "trace the whole line" behavior only a line with a
// known full path has -- see WinHighlight.paylinePositions); every other win kind (or a line whose full
// path isn't known -- see videoSlotRoundView.ts's own resolveRoundArtifactLineDefinition) highlights all
// of its own winning cells in one uniform color. Both restore every touched cell back to its persistent
// tint (`baseColor`, set by applyPersistentHighlights) on mouseleave. Mirrors pokie-examples' own
// drawWinningLinesList/addHighlightButton. Reads only positions/paylinePositions -- the same generic
// WinHighlight contract videoSlotRoundView.ts's own deriveWinHighlights (VideoSlot response) and
// deriveWinHighlightsFromRoundArtifactWins (any other game's RoundArtifact, via Studio's own WinOverlay)
// both produce, so this one function renders either without knowing which DTO a highlight came from.
export function renderWinHighlightsList(listEl: HTMLElement, gridEl: HTMLElement, highlights: WinHighlight[]): void {
    clearChildren(listEl);

    highlights.forEach((highlight) => {
        if (highlight.kind === "line" && highlight.paylinePositions) {
            const paylinePositions = highlight.paylinePositions;
            const winningPositions = new Set(highlight.positions.map(([reelIndex, rowIndex]) => cellId(reelIndex, rowIndex)));
            addHoverRow(
                listEl,
                highlight.label,
                () => {
                    paylinePositions.forEach(([reelIndex, rowIndex]) => {
                        const cell = getCell(gridEl, reelIndex, rowIndex);
                        if (!cell) {
                            return;
                        }
                        cell.style.backgroundColor = winningPositions.has(cellId(reelIndex, rowIndex)) ? "#00FF00" : "#999999";
                    });
                },
                () => {
                    paylinePositions.forEach(([reelIndex, rowIndex]) => {
                        const cell = getCell(gridEl, reelIndex, rowIndex);
                        if (cell) {
                            cell.style.backgroundColor = cell.baseColor;
                        }
                    });
                },
            );
            return;
        }

        const hoverColor = highlightHoverColor(highlight.kind);
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

// Shared by renderBetInfo/renderModeInfo below: a current-value label plus, only when there's
// actually more than one option to choose from, a row of buttons -- one per option, the current one
// disabled/marked selected, each click reporting its own raw value back to the caller. Neither
// renderBetInfo nor renderModeInfo does anything beyond mapping its own values to/from strings
// around this, so a bet mode's runtime-supported ids and a bet's runtime-supported amounts render
// identically instead of two independently-maintained near-duplicates.
function renderOptionsRow(
    el: HTMLElement,
    classPrefix: string,
    currentLabel: string | undefined,
    options: string[],
    currentValue: string | undefined,
    onSelect: (value: string) => void,
): void {
    clearChildren(el);
    if (currentLabel !== undefined) {
        const current = document.createElement("span");
        current.className = `${classPrefix}-current`;
        current.textContent = currentLabel;
        el.appendChild(current);
    }
    if (options.length <= 1) {
        return;
    }

    const optionsEl = document.createElement("span");
    optionsEl.className = `${classPrefix}-options`;
    options.forEach((value) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `${classPrefix}-option` + (value === currentValue ? ` ${classPrefix}-option-selected` : "");
        button.textContent = value;
        button.disabled = value === currentValue;
        button.setAttribute("aria-pressed", value === currentValue ? "true" : "false");
        button.setAttribute("aria-label", `Select ${classPrefix === "player-bet" ? "bet" : "mode"} ${value}`);
        button.addEventListener("click", () => onSelect(value));
        optionsEl.appendChild(button);
    });
    el.appendChild(optionsEl);
}

// Interactive whenever the runtime actually exposes more than one bet to choose from (see
// deriveAvailableBets/GameSessionHandling.getAvailableBets() -- every video-slot session always
// reports its own real availableBets, never an invented list) -- clicking a bet other than the
// round's own current one calls onSelectBet(bet), which the caller wires to spin()'s own optional
// bet parameter (see cli/client/apiClient.ts and src/server/spin/SpinCommandHandling.ts) so the next
// spin actually runs staked at that amount, not just displays it. A single available bet renders as
// plain text -- nothing to choose between, so no button.
export function renderBetInfo(el: HTMLElement, availableBets: number[], currentBet: number | undefined, onSelectBet: (bet: number) => void): void {
    renderOptionsRow(
        el,
        "player-bet",
        currentBet === undefined ? undefined : `Bet: ${currentBet}`,
        availableBets.map(String),
        currentBet === undefined ? undefined : String(currentBet),
        (value) => onSelectBet(Number(value)),
    );
}

// Interactive whenever the runtime actually exposes more than one bet mode to choose from (see
// deriveAvailableBetModeIds/BetModeSelecting.getAvailableBetModeIds() -- absent entirely for a
// session that never opted into bet-mode selection at all, so this renders nothing rather than an
// invented single "base" choice). Clicking a mode other than the round's own current one calls
// onSelectMode(modeId), wired the same way onSelectBet is -- see renderBetInfo above.
export function renderModeInfo(el: HTMLElement, availableModeIds: string[], currentModeId: string | undefined, onSelectMode: (modeId: string) => void): void {
    renderOptionsRow(
        el,
        "player-mode",
        currentModeId === undefined ? undefined : `Mode: ${currentModeId}`,
        availableModeIds,
        currentModeId,
        onSelectMode,
    );
}

function renderRoundValue(
    el: HTMLElement | undefined,
    value: number | undefined,
    label = "",
    suffix = "",
    format: (value: number) => string = String,
): void {
    if (el !== undefined) {
        el.textContent = value === undefined ? "—" : `${label}${format(value)}${suffix}`;
    }
}

// The single presentation entrypoint used by all user-facing game surfaces.  The input is already
// computed transport data (or its structural adapter), so this function performs no game math.
// Empty/undefined optional data is rendered as an empty section, which also prevents stale details
// from a preceding round from surviving when a feature or selector is not applicable.
export function renderPlayerRound(elements: PlayerRoundElements, view: PlayerRoundView): void {
    installPlayerPresentationStyles(elements.gridContainer.ownerDocument);
    renderRoundValue(elements.credits, view.credits, view.creditsLabel);
    renderRoundValue(elements.totalWin, view.totalWin, view.totalWinLabel, "", view.formatTotalWin);
    renderRoundValue(
        elements.payoutMultiplier,
        view.payoutMultiplier,
        view.payoutMultiplierLabel,
        view.payoutMultiplierSuffix,
        view.formatPayoutMultiplier,
    );
    if (elements.totals !== undefined) {
        const hasTotals = view.credits !== undefined || view.totalWin !== undefined || view.payoutMultiplier !== undefined;
        elements.totals.hidden = !hasTotals;
        if (!hasTotals) {
            elements.totals.querySelectorAll("dd").forEach((value) => {
                value.textContent = "";
            });
        }
    }
    for (const [row, value, present] of [
        [elements.creditsRow, elements.credits, view.credits !== undefined],
        [elements.totalWinRow, elements.totalWin, view.totalWin !== undefined],
        [elements.payoutMultiplierRow, elements.payoutMultiplier, view.payoutMultiplier !== undefined],
    ] as const) {
        if (row !== undefined) {
            row.hidden = !present;
            if (!present && value !== undefined) {
                value.textContent = "";
            }
        }
    }
    renderReelsGrid(elements.gridContainer, view.reelsSymbols, view.artworkUrlForSymbol);
    applyPersistentHighlights(elements.gridContainer, view.highlights);
    renderWinsSection(elements.winsSection, view.highlights.length > 0);
    renderWinHighlightsList(elements.winsList, elements.gridContainer, view.highlights);
    renderFeatureCounters(elements.features, view.featureCounters ?? []);
    renderBetInfo(elements.betInfo, view.availableBets ?? [], view.currentBet, view.onSelectBet ?? (() => undefined));
    renderModeInfo(elements.modeInfo, view.availableModeIds ?? [], view.currentModeId, view.onSelectMode ?? (() => undefined));
    renderLineDefinitionsList(elements.linesList, elements.gridContainer, view.lines ?? []);
    renderPaytable(elements.paytableHead, elements.paytableBody, view.paytable);
    if (elements.linesDetails !== undefined) {
        elements.linesDetails.hidden = (view.lines?.length ?? 0) === 0;
    }
    if (elements.paytableDetails !== undefined) {
        elements.paytableDetails.hidden = view.paytable === undefined || view.paytable.rows.length === 0;
    }
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
