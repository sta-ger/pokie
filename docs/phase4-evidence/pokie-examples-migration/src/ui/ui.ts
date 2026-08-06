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
} from "pokie/client/player";
import {
    deriveAvailableBetModeIds,
    deriveAvailableBets,
    deriveBetModeId,
    deriveFeatureCounters,
    deriveLineDefinitions,
    derivePaytableView,
    deriveTotalWin,
    deriveWinHighlights,
    LineDefinitionView,
    PaytableView,
    VideoSlotRoundResponse,
} from "pokie/client/player";
import {VideoSlotWithFreeGamesInitialNetworkData, VideoSlotWithFreeGamesRoundNetworkData} from "pokie";
import {getAnyWinData, getCustomScenarioData, getInitialData, getRoundData, getSymbolWinData} from "../data.ts";

type Elements = {
    reelsContainer: HTMLElement;
    credits: HTMLElement;
    win: HTMLElement;
    betInfo: HTMLElement;
    modeInfo: HTMLElement;
    fgCounters: HTMLElement;
    winningLinesSection: HTMLElement;
    winningLinesList: HTMLElement;
    linesDefinitionsList: HTMLElement;
    paytableHead: HTMLElement;
    paytableBody: HTMLElement;
    playButton: HTMLButtonElement;
    playWinButton: HTMLButtonElement;
    dropDownList: HTMLElement;
    roundError: HTMLElement;
    roundErrorMessage: HTMLElement;
    roundErrorDetail: HTMLElement;
    roundRetryButton: HTMLButtonElement;
    roundReconnectButton: HTMLButtonElement;
};

// Everything this example needs to know about a game's own static, round-independent shape --
// captured once right after connecting (see cli/client/main.ts's own StaticVideoSlotView, which this
// mirrors), since a round response only ever carries what changed, not the paytable/lines/available
// bets and modes all over again.
type StaticVideoSlotView = {
    paytable: PaytableView | undefined;
    lines: LineDefinitionView[];
    availableBets: number[];
    availableBetModeIds: string[];
};

function requireElement<T extends HTMLElement>(div: HTMLDivElement, id: string): T {
    const el = div.querySelector<T>(`#${id}`);
    if (el === null) {
        throw new Error(`Missing #${id} in the example's own markup.`);
    }
    return el;
}

function queryElements(div: HTMLDivElement): Elements {
    return {
        reelsContainer: requireElement(div, "reelsContainer"),
        credits: requireElement(div, "credits"),
        win: requireElement(div, "win"),
        betInfo: requireElement(div, "betInfo"),
        modeInfo: requireElement(div, "modeInfo"),
        fgCounters: requireElement(div, "fgCounters"),
        winningLinesSection: requireElement(div, "winningLines"),
        winningLinesList: requireElement(div, "winningLinesList"),
        linesDefinitionsList: requireElement(div, "linesDefinitionsList"),
        paytableHead: requireElement(div, "paytableHead"),
        paytableBody: requireElement(div, "paytableBody"),
        playButton: requireElement(div, "playButton"),
        playWinButton: requireElement(div, "playWinButton"),
        dropDownList: requireElement(div, "dropDownList"),
        roundError: requireElement(div, "roundError"),
        roundErrorMessage: requireElement(div, "roundErrorMessage"),
        roundErrorDetail: requireElement(div, "roundErrorDetail"),
        roundRetryButton: requireElement(div, "roundRetryButton"),
        roundReconnectButton: requireElement(div, "roundReconnectButton"),
    };
}

function deriveStaticVideoSlotView(data: VideoSlotWithFreeGamesInitialNetworkData): StaticVideoSlotView {
    const view = data as VideoSlotRoundResponse;
    return {
        paytable: derivePaytableView(view.paytable),
        lines: deriveLineDefinitions(view.linesDefinitions),
        availableBets: deriveAvailableBets(view.availableBets),
        availableBetModeIds: deriveAvailableBetModeIds(view.availableBetModeIds),
    };
}

function renderRound(
    elements: Elements,
    data: VideoSlotWithFreeGamesRoundNetworkData,
    staticView: StaticVideoSlotView,
    selectedBet: number | undefined,
    onSelectBet: (bet: number) => void,
    selectedMode: string | undefined,
    onSelectMode: (modeId: string) => void,
): void {
    const response = data as VideoSlotRoundResponse;
    renderReelsGrid(elements.reelsContainer, data.reelsSymbols);

    const highlights = deriveWinHighlights(response);
    applyPersistentHighlights(elements.reelsContainer, highlights);
    renderWinsSection(elements.winningLinesSection, highlights.length > 0);
    renderWinHighlightsList(elements.winningLinesList, elements.reelsContainer, highlights);

    elements.credits.textContent = "Credits: " + data.credits;
    elements.win.textContent = "Win: " + (deriveTotalWin(response) ?? 0);

    renderFeatureCounters(elements.fgCounters, deriveFeatureCounters(response));
    renderBetInfo(elements.betInfo, staticView.availableBets, selectedBet, onSelectBet);
    renderModeInfo(elements.modeInfo, staticView.availableBetModeIds, selectedMode, onSelectMode);
    renderLineDefinitionsList(elements.linesDefinitionsList, elements.reelsContainer, staticView.lines);
    renderPaytable(elements.paytableHead, elements.paytableBody, staticView.paytable);
}

function describeError(error: unknown): {readable: string; detail: string} {
    const message = error instanceof Error ? error.message : String(error);
    const detail = error instanceof Error && error.stack ? error.stack : message;
    return {readable: message, detail};
}

const PLAYER_STYLE = `
    #reelsContainer {
        width: 100%;
    }

    .player-grid {
        width: 100%;
        table-layout: fixed;
    }

    .player-reel {
        vertical-align: top;
    }

    .player-cell {
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-weight: bold;
        color: #444444;
        background-color: #dddddd;
        border: 3px solid white;
        overflow: hidden;
    }

    .player-highlight-item {
        display: inline-block;
        padding-right: 20px;
        padding-bottom: 20px;
    }

    .player-highlight-button {
        font-size: inherit;
    }

    .player-bet-current,
    .player-mode-current {
        font-weight: bold;
        margin-right: 0.5rem;
    }

    .player-bet-options,
    .player-mode-options {
        display: inline-flex;
        gap: 0.35rem;
        flex-wrap: wrap;
    }

    .player-bet-option-selected,
    .player-mode-option-selected {
        font-weight: bold;
    }

    .paragraph {
        padding-top: 20px;
    }

    @media (max-width: 480px) {
        .player-cell {
            font-size: 12px;
        }
    }
`;

// Builds this example's own page shell (title, bootstrap, reels/bet/mode/paytable markup) once, then
// hands every game-round render off to the same "pokie/client/player" surface cli/client/main.ts
// renders with -- see that module's own render()/renderVideoSlotRound() for the CLI-side counterpart
// of what this function's runRound()/renderRound() do here.
export const initializeUi = async (div: HTMLDivElement, customScenarios?: [string, string][]) => {
    const style = document.createElement("style");
    style.textContent = PLAYER_STYLE;
    style.id = "ui-style";

    if (!document.getElementById("ui-style")) {
        document.head.appendChild(style);
    }

    const link = document.createElement("link");
    link.href = "https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css";
    link.rel = "stylesheet";
    link.integrity = "sha384-EVSTQN3/azprG1Anm3QDgpJLIm9Nao0Yz1ztcQTwFspd3yD65VohhpuuCOmLASjC";
    link.crossOrigin = "anonymous";
    link.id = "bootstrap-link";

    if (!document.getElementById("ui-link")) {
        document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js";
    script.integrity = "sha384-MrcW6ZMFYlzcLA8Nl+NtUVF0sA7MsXsP1UyJoMp4YLEuNSfAP+JcXn/tWtIaxVXM";
    script.crossOrigin = "anonymous";
    script.id = "bootstrap-script";

    if (!document.getElementById("bootstrap-script")) {
        document.head.appendChild(script);
    }

    div.className = "container";
    div.style.maxWidth = "600px";

    div.innerHTML = `
            <div class="d-flex flex-column flex-sm-row align-items-start align-items-sm-center
                        justify-content-sm-between gap-1 pt-4 pb-3 mb-2 border-bottom">
                <h1 class="h4 mb-0">${document.title.replace(" with POKIE", "")}</h1>
                <a href="index.html" class="text-decoration-none">&larr; All examples</a>
            </div>

            <div class="paragraph" id="roundError" hidden>
                <p id="roundErrorMessage"></p>
                <details>
                    <summary>Technical details</summary>
                    <pre id="roundErrorDetail"></pre>
                </details>
                <button id="roundRetryButton" type="button" class="btn btn-secondary btn-sm">Retry</button>
                <button id="roundReconnectButton" type="button" class="btn btn-secondary btn-sm">Reconnect</button>
            </div>

            <div class="paragraph">
                <div id="reelsContainer"></div>
            </div>

            <div class="paragraph">
                <div style="display: flex; justify-content: center;">
                    <div id="credits" style="flex: 1; text-align: center;">Credits</div>
                    <div id="win" style="flex: 1; text-align: center;">Win</div>
                </div>
                <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;">
                    <div id="betInfo" class="player-bet-info"></div>
                    <div id="modeInfo" class="player-mode-info"></div>
                </div>
                <dl id="fgCounters" class="d-flex justify-content-center gap-3" hidden></dl>
            </div>

            <div class="paragraph">
                <div class="d-flex align-items-center gap-2">
                    <button id="playButton" type="button" class="btn btn-primary btn-lg">Play</button>
                    <button id="playWinButton" type="button" class="btn btn-primary btn-lg"">
                        Win
                    </button>
                    <div class="flex-grow-1"></div>
                    <div class="dropdown">
                        <a
                            class="btn btn-secondary dropdown-toggle"
                            href="#"
                            role="button"
                            id="dropdownMenuLink"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                        >
                            Simulations
                        </a>
                        <ul id="dropDownList" class="dropdown-menu" aria-labelledby="dropdownMenuLink">
                        </ul>
                    </div>
                </div>
            </div>


            <div class="paragraph" id="winningLines" hidden>
                <h4>Winning lines</h4>
                <div class="paragraph" id="winningLinesList"></div>
            </div>

            <div class="paragraph" id="customInfo"></div>

            <div class="paragraph">
                <div class="accordion" id="accordionMath">
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="headingLinesDefinitions">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                                    data-bs-target="#collapseLinesDefinitions" aria-expanded="true" aria-controls="collapseLinesDefinitions">
                                Lines definitions
                            </button>
                        </h2>
                        <div id="collapseLinesDefinitions" class="accordion-collapse collapse" aria-labelledby="headingLinesDefinitions"
                             data-bs-parent="#accordionMath">
                            <div id="linesDefinitionsList" class="accordion-body" >

                            </div>
                        </div>
                    </div>
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="headingPaytable">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                                    data-bs-target="#collapsePaytable" aria-expanded="true" aria-controls="collapsePaytable">
                                Paytable
                            </button>
                        </h2>
                        <div id="collapsePaytable" class="accordion-collapse collapse" aria-labelledby="headingPaytable"
                             data-bs-parent="#accordionMath">
                            <div class="accordion-body">
                                <div class="table-responsive">
                                    <table class="table">
                                        <thead>
                                        <tr id="paytableHead">
                                            <th scope="col">Symbol</th>
                                        </tr>
                                        </thead>
                                        <tbody id="paytableBody">
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                <div>
            <div>

        `;

    const elements = queryElements(div);

    const initialData = (await getInitialData()) as VideoSlotWithFreeGamesInitialNetworkData;
    const staticView = deriveStaticVideoSlotView(initialData);

    let selectedBet: number | undefined = typeof initialData.bet === "number" ? initialData.bet : staticView.availableBets[0];
    let selectedMode: string | undefined = deriveBetModeId((initialData as VideoSlotRoundResponse).betModeId) ?? staticView.availableBetModeIds[0];

    const rerender = (data: VideoSlotWithFreeGamesRoundNetworkData): void => {
        renderRound(
            elements,
            data,
            staticView,
            selectedBet,
            (bet) => {
                selectedBet = bet;
                runRound(() => getRoundData(selectedBet, selectedMode));
            },
            selectedMode,
            (modeId) => {
                selectedMode = modeId;
                runRound(() => getRoundData(selectedBet, selectedMode));
            },
        );
    };

    // Runs one round-producing action (a spin, a "play until any win" simulation, a custom scenario,
    // ...), rendering its result on success or a retryable error -- via the exact same
    // renderConnectionError/clearConnectionError pair cli/client/main.ts's own attemptSpin() shows a
    // failed spin with -- on failure. "Retry" re-runs this same action; "Reconnect" discards it and
    // re-renders the game's last-known-good initial data instead, the same fallback cli/client's own
    // reconnect() falls back to a fresh session for.
    const runRound = (action: () => Promise<VideoSlotWithFreeGamesRoundNetworkData>): void => {
        elements.playButton.disabled = true;
        elements.playWinButton.disabled = true;
        action()
            .then((data) => {
                clearConnectionError(elements.roundError);
                rerender(data);
            })
            .catch((error: unknown) => {
                const {readable, detail} = describeError(error);
                renderConnectionError(
                    {
                        container: elements.roundError,
                        message: elements.roundErrorMessage,
                        detail: elements.roundErrorDetail,
                        retryButton: elements.roundRetryButton,
                    },
                    `Round failed: ${readable}`,
                    detail,
                    () => runRound(action),
                );
                elements.roundReconnectButton.onclick = () => {
                    clearConnectionError(elements.roundError);
                    rerender(initialData);
                };
            })
            .finally(() => {
                elements.playButton.disabled = false;
                elements.playWinButton.disabled = false;
            });
    };

    rerender(initialData);

    elements.playButton.onclick = () => runRound(() => getRoundData(selectedBet, selectedMode));
    elements.playWinButton.onclick = () => runRound(() => getAnyWinData() as Promise<VideoSlotWithFreeGamesRoundNetworkData>);

    const pt = initialData.paytable["10"] ?? Object.values(initialData.paytable)[0];
    Object.keys(pt).forEach((itemId) => {
        const entry = pt[itemId];
        Object.keys(entry).forEach((times) => {
            const intTimes = parseInt(times, 10);
            const a = document.createElement("a");
            a.className = "dropdown-item";
            a.innerText = 'Symbol "' + itemId + '" x ' + times;
            a.onclick = () => runRound(() => getSymbolWinData(itemId, intTimes) as Promise<VideoSlotWithFreeGamesRoundNetworkData>);
            const li = document.createElement("li");
            li.appendChild(a);
            elements.dropDownList.appendChild(li);
        });
    });

    customScenarios?.forEach((scenario) => {
        const a = document.createElement("a");
        a.className = "dropdown-item";
        a.innerText = scenario[1];
        a.onclick = () => runRound(() => getCustomScenarioData(scenario[0]) as Promise<VideoSlotWithFreeGamesRoundNetworkData>);
        const li = document.createElement("li");
        li.appendChild(a);
        elements.dropDownList.appendChild(li);
    });
};
