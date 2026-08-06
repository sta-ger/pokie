import {FetchLike, spin} from "./apiClient.js";
import {renderRawJson, renderRoundView, renderStages, renderStatus, wireSpinButton} from "./dom.js";
import {extractKnownRoundView, extractStages} from "./interpretResponse.js";
import {
    applyPersistentHighlights,
    clearConnectionError,
    renderBetInfo,
    renderConnectionError,
    renderFeatureCounters,
    renderLineDefinitionsList,
    renderPaytable,
    renderReelsGrid,
    renderWinHighlightsList,
    renderWinsSection,
} from "./player/renderPlayer.js";
import {
    deriveAvailableBets,
    deriveFeatureCounters,
    deriveLineDefinitions,
    derivePaytableView,
    deriveWinHighlights,
    isVideoSlotRoundResponse,
    LineDefinitionView,
    PaytableView,
    VideoSlotRoundResponse,
} from "./player/videoSlotRoundView.js";
import {ensureSession} from "./sessionFlow.js";
import {clearSessionId} from "./sessionStorage.js";
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
    playerSection: HTMLElement;
    playerGridContainer: HTMLElement;
    playerBetInfo: HTMLElement;
    playerFeatures: HTMLElement;
    playerWinsSection: HTMLElement;
    playerWinsList: HTMLElement;
    playerLinesList: HTMLElement;
    playerPaytableHead: HTMLElement;
    playerPaytableBody: HTMLElement;
    connectionError: HTMLElement;
    connectionErrorMessage: HTMLElement;
    connectionErrorDetail: HTMLElement;
    connectionRetryButton: HTMLButtonElement;
    spinError: HTMLElement;
    spinErrorMessage: HTMLElement;
    spinErrorDetail: HTMLElement;
    spinRetryButton: HTMLButtonElement;
    spinReconnectButton: HTMLButtonElement;
};

// The paytable/lines-definitions/availableBets snapshot taken right after connecting -- see
// deriveStaticVideoSlotView's own doc comment for why this is captured once rather than re-derived
// from every round response.
type StaticVideoSlotView = {
    paytable: PaytableView | undefined;
    lines: LineDefinitionView[];
    availableBets: number[];
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
        playerSection: requireElement("player-section"),
        playerGridContainer: requireElement("player-grid-container"),
        playerBetInfo: requireElement("player-bet-info"),
        playerFeatures: requireElement("player-features"),
        playerWinsSection: requireElement("player-wins-section"),
        playerWinsList: requireElement("player-wins-list"),
        playerLinesList: requireElement("player-lines-list"),
        playerPaytableHead: requireElement("player-paytable-head"),
        playerPaytableBody: requireElement("player-paytable-body"),
        connectionError: requireElement("connection-error"),
        connectionErrorMessage: requireElement("connection-error-message"),
        connectionErrorDetail: requireElement("connection-error-detail"),
        connectionRetryButton: requireElement("connection-retry-button"),
        spinError: requireElement("spin-error"),
        spinErrorMessage: requireElement("spin-error-message"),
        spinErrorDetail: requireElement("spin-error-detail"),
        spinRetryButton: requireElement("spin-retry-button"),
        spinReconnectButton: requireElement("spin-reconnect-button"),
    };
}

async function fetchConfig(fetchImpl: FetchLike): Promise<{apiBaseUrl: string}> {
    const response = await fetchImpl("/config");
    return (await response.json()) as {apiBaseUrl: string};
}

// paytable/linesDefinitions/availableBets only ever appear on a VideoSlotInitialNetworkData payload
// (POST /sessions, or GET /sessions/:id's merged restore) -- a spin's own response is only ever the
// narrower VideoSlotRoundNetworkData (see src/net/videoslot/VideoSlotNetworkData.ts), which carries
// none of them. Capturing this once, right after connecting, means the paytable/lines/bet-options view
// stays populated across every subsequent spin instead of disappearing the moment a round response
// doesn't happen to repeat game-static data that was never going to change round to round anyway.
function deriveStaticVideoSlotView(response: SessionResponse): StaticVideoSlotView {
    const view = response as VideoSlotRoundResponse;
    return {
        paytable: derivePaytableView(view.paytable),
        lines: deriveLineDefinitions(view.linesDefinitions),
        availableBets: deriveAvailableBets(view.availableBets),
    };
}

function renderVideoSlotRound(
    elements: Elements,
    response: VideoSlotRoundResponse & {reelsSymbols: string[][]},
    staticView: StaticVideoSlotView,
    selectedBet: number | undefined,
    onSelectBet: (bet: number) => void,
): void {
    renderReelsGrid(elements.playerGridContainer, response.reelsSymbols);

    const highlights = deriveWinHighlights(response);
    applyPersistentHighlights(elements.playerGridContainer, highlights);
    renderWinsSection(elements.playerWinsSection, highlights.length > 0);
    renderWinHighlightsList(elements.playerWinsList, elements.playerGridContainer, highlights);

    renderFeatureCounters(elements.playerFeatures, deriveFeatureCounters(response));
    renderBetInfo(elements.playerBetInfo, staticView.availableBets, selectedBet, onSelectBet);
    renderLineDefinitionsList(elements.playerLinesList, elements.playerGridContainer, staticView.lines);
    renderPaytable(elements.playerPaytableHead, elements.playerPaytableBody, staticView.paytable);
}

function render(
    elements: Elements,
    response: SessionResponse,
    staticView: StaticVideoSlotView,
    stageIndex: number,
    onStageChange: (index: number) => void,
    selectedBet: number | undefined,
    onSelectBet: (bet: number) => void,
): void {
    elements.gameTitle.textContent = `${response.game.name} — POKIE client preview`;
    renderRoundView(elements, extractKnownRoundView(response));

    const isVideoSlot = isVideoSlotRoundResponse(response);
    elements.playerSection.hidden = !isVideoSlot;
    elements.screen.hidden = isVideoSlot;
    if (isVideoSlot) {
        renderVideoSlotRound(elements, response, staticView, selectedBet, onSelectBet);
    }

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

function describeError(error: unknown): {readable: string; detail: string} {
    const message = error instanceof Error ? error.message : String(error);
    const detail = error instanceof Error && error.stack ? error.stack : message;
    return {readable: message, detail};
}

function showConnectionError(elements: Elements, error: unknown, onRetry: () => void): void {
    const {readable, detail} = describeError(error);
    renderConnectionError(
        {
            container: elements.connectionError,
            message: elements.connectionErrorMessage,
            detail: elements.connectionErrorDetail,
            retryButton: elements.connectionRetryButton,
        },
        `Couldn't connect: ${readable}`,
        detail,
        onRetry,
    );
}

function showSpinError(elements: Elements, error: unknown, onRetry: () => void, onReconnect: () => void): void {
    const {readable, detail} = describeError(error);
    renderConnectionError(
        {
            container: elements.spinError,
            message: elements.spinErrorMessage,
            detail: elements.spinErrorDetail,
            retryButton: elements.spinRetryButton,
        },
        `Spin failed: ${readable}`,
        detail,
        onRetry,
    );
    elements.spinReconnectButton.onclick = onReconnect;
}

async function boot(elements: Elements, fetchImpl: FetchLike): Promise<void> {
    clearConnectionError(elements.connectionError);
    elements.spinError.hidden = true;

    try {
        renderStatus(elements.status, "Connecting…");
        const {apiBaseUrl} = await fetchConfig(fetchImpl);

        let current = await ensureSession(fetchImpl, window.localStorage, apiBaseUrl);
        let stageIndex = 0;
        const staticView = deriveStaticVideoSlotView(current);
        let selectedBet = typeof current.bet === "number" ? current.bet : staticView.availableBets[0];

        const rerender = (): void => {
            render(
                elements,
                current,
                staticView,
                stageIndex,
                (nextIndex) => {
                    stageIndex = nextIndex;
                    rerender();
                },
                selectedBet,
                (bet) => {
                    selectedBet = bet;
                    rerender();
                },
            );
        };

        renderStatus(elements.status, `Connected to ${apiBaseUrl}`);
        rerender();
        elements.spinButton.disabled = false;

        const attemptSpin = (): void => {
            elements.spinButton.disabled = true;
            spin(fetchImpl, apiBaseUrl, current.sessionId, undefined, selectedBet)
                .then((response) => {
                    current = response;
                    stageIndex = 0;
                    selectedBet = typeof current.bet === "number" ? current.bet : selectedBet;
                    elements.spinError.hidden = true;
                    rerender();
                })
                .catch((error: unknown) => {
                    showSpinError(elements, error, attemptSpin, () => reconnect(elements, fetchImpl));
                })
                .finally(() => {
                    elements.spinButton.disabled = false;
                });
        };

        wireSpinButton(elements.spinButton, attemptSpin);
    } catch (error) {
        renderStatus(elements.status, "Unable to connect.");
        showConnectionError(elements, error, () => {
            boot(elements, fetchImpl).catch((retryError: unknown) => console.error(retryError));
        });
    }
}

// Discards the locally stored sessionId and reconnects from scratch (a fresh session, not a restore) --
// used when a spin fails in a way that suggests the session itself is stale (e.g. the server was
// restarted and no longer knows this sessionId), rather than a transient network error a plain retry
// would already recover from.
function reconnect(elements: Elements, fetchImpl: FetchLike): void {
    clearSessionId(window.localStorage);
    boot(elements, fetchImpl).catch((error: unknown) => console.error(error));
}

async function main(): Promise<void> {
    const elements = queryElements();
    const fetchImpl = window.fetch.bind(window) as FetchLike;
    await boot(elements, fetchImpl);
}

main().catch((error: unknown) => {
    console.error(error);
});
