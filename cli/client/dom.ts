import type {KnownRoundView} from "./interpretResponse.js";

// Thin DOM-manipulation layer — deliberately not unit-tested (no DOM globals in this repo's Jest
// environment, see main.ts's own comment); every function here is a small, direct, manually
// verified translation of a value into markup. All the actual decision-making (what to show, what
// a response means) lives in the DOM-free modules this only renders the output of.

export function renderStatus(el: HTMLElement, text: string): void {
    el.textContent = text;
}

export function renderRoundView(
    elements: {bet: HTMLElement; credits: HTMLElement; win: HTMLElement; screen: HTMLElement},
    view: KnownRoundView,
): void {
    elements.bet.textContent = view.bet !== undefined ? String(view.bet) : "—";
    elements.credits.textContent = String(view.credits);
    elements.win.textContent = view.win !== undefined ? String(view.win) : "—";
    renderScreen(elements.screen, view.screen);
}

export function renderScreen(el: HTMLElement, screen: unknown[][] | undefined): void {
    el.textContent = "";
    if (screen === undefined) {
        el.textContent = "(no screen in this response)";
        return;
    }

    const table = document.createElement("table");
    table.className = "screen-grid";
    const rowCount = Math.max(0, ...screen.map((reel) => reel.length));
    for (let row = 0; row < rowCount; row++) {
        const tr = document.createElement("tr");
        for (const reel of screen) {
            const td = document.createElement("td");
            td.textContent = reel[row] !== undefined ? String(reel[row]) : "";
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    el.appendChild(table);
}

export function renderRawJson(el: HTMLElement, value: unknown): void {
    el.textContent = JSON.stringify(value, null, 2);
}

export function wireSpinButton(button: HTMLButtonElement, onClick: () => void): void {
    button.addEventListener("click", onClick);
}

// A simple "stage i of N" view with prev/next navigation, generic enough for any
// MultiStageRoundSessionSerializer-based `stages` array — falls back to a raw-JSON view of the
// current stage (plus a best-effort screen render, when that stage object happens to have one).
export function renderStages(
    elements: {
        section: HTMLElement;
        label: HTMLElement;
        prevButton: HTMLButtonElement;
        nextButton: HTMLButtonElement;
        screen: HTMLElement;
        rawJson: HTMLElement;
    },
    stages: unknown[] | undefined,
    currentIndex: number,
    onNavigate: (nextIndex: number) => void,
): void {
    if (stages === undefined || stages.length === 0) {
        elements.section.hidden = true;
        return;
    }

    elements.section.hidden = false;
    elements.label.textContent = `Stage ${currentIndex + 1} of ${stages.length}`;
    elements.prevButton.disabled = currentIndex <= 0;
    elements.nextButton.disabled = currentIndex >= stages.length - 1;
    elements.prevButton.onclick = () => onNavigate(currentIndex - 1);
    elements.nextButton.onclick = () => onNavigate(currentIndex + 1);

    const stage = stages[currentIndex];
    const stageScreen =
        stage !== null && typeof stage === "object" && Array.isArray((stage as {screen?: unknown}).screen)
            ? ((stage as {screen: unknown[][]}).screen)
            : undefined;
    renderScreen(elements.screen, stageScreen);
    renderRawJson(elements.rawJson, stage);
}
