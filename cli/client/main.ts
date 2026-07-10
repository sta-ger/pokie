import {FetchLike, spin} from "./apiClient.js";
import {renderRawJson, renderRoundView, renderScreen, renderStages, renderStatus, wireSpinButton} from "./dom.js";
import {extractKnownRoundView, extractStages} from "./interpretResponse.js";
import {ensureSession} from "./sessionFlow.js";
import type {SessionResponse} from "./types.js";

type Elements = {
    status: HTMLElement;
    gameTitle: HTMLElement;
    bet: HTMLElement;
    credits: HTMLElement;
    win: HTMLElement;
    screen: HTMLElement;
    spinButton: HTMLButtonElement;
    rawJson: HTMLElement;
    stagesSection: HTMLElement;
    stageLabel: HTMLElement;
    prevStageButton: HTMLButtonElement;
    nextStageButton: HTMLButtonElement;
    stageScreen: HTMLElement;
    stageRawJson: HTMLElement;
};

function requireElement<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (el === null) {
        throw new Error(`Missing #${id} in index.html.`);
    }
    return el as T;
}

function queryElements(): Elements {
    return {
        status: requireElement("status"),
        gameTitle: requireElement("game-title"),
        bet: requireElement("bet"),
        credits: requireElement("credits"),
        win: requireElement("win"),
        screen: requireElement("screen"),
        spinButton: requireElement("spin-button"),
        rawJson: requireElement("raw-json"),
        stagesSection: requireElement("stages-section"),
        stageLabel: requireElement("stage-label"),
        prevStageButton: requireElement("prev-stage"),
        nextStageButton: requireElement("next-stage"),
        stageScreen: requireElement("stage-screen"),
        stageRawJson: requireElement("stage-raw-json"),
    };
}

async function fetchConfig(fetchImpl: FetchLike): Promise<{apiBaseUrl: string}> {
    const response = await fetchImpl("/config");
    return (await response.json()) as {apiBaseUrl: string};
}

function render(elements: Elements, response: SessionResponse, stageIndex: number, onStageChange: (index: number) => void): void {
    elements.gameTitle.textContent = `${response.game.name} — POKIE client preview`;
    renderRoundView(elements, extractKnownRoundView(response));
    renderRawJson(elements.rawJson, response);
    renderStages(
        {
            section: elements.stagesSection,
            label: elements.stageLabel,
            prevButton: elements.prevStageButton,
            nextButton: elements.nextStageButton,
            screen: elements.stageScreen,
            rawJson: elements.stageRawJson,
        },
        extractStages(response),
        stageIndex,
        onStageChange,
    );
}

async function main(): Promise<void> {
    const elements = queryElements();
    const fetchImpl = window.fetch.bind(window) as FetchLike;

    try {
        renderStatus(elements.status, "Connecting…");
        const {apiBaseUrl} = await fetchConfig(fetchImpl);

        let current = await ensureSession(fetchImpl, window.localStorage, apiBaseUrl);
        let stageIndex = 0;

        const rerender = (): void => {
            render(elements, current, stageIndex, (nextIndex) => {
                stageIndex = nextIndex;
                rerender();
            });
        };

        renderStatus(elements.status, `Connected to ${apiBaseUrl}`);
        rerender();
        elements.spinButton.disabled = false;

        wireSpinButton(elements.spinButton, () => {
            elements.spinButton.disabled = true;
            spin(fetchImpl, apiBaseUrl, current.sessionId)
                .then((response) => {
                    current = response;
                    stageIndex = 0;
                    rerender();
                })
                .catch((error: unknown) => {
                    renderStatus(elements.status, error instanceof Error ? error.message : String(error));
                })
                .finally(() => {
                    elements.spinButton.disabled = false;
                });
        });
    } catch (error) {
        renderStatus(elements.status, error instanceof Error ? error.message : String(error));
        renderScreen(elements.screen, undefined);
    }
}

main().catch((error: unknown) => {
    console.error(error);
});
