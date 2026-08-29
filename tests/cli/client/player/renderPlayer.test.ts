/**
 * @jest-environment jsdom
 */
import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import * as canonicalPlayer from "../../../../cli/client/player/index.js";
import {
    applyPersistentHighlights,
    clearConnectionError,
    renderBetInfo,
    renderConnectionError,
    renderFeatureCounters,
    renderLineDefinitionsList,
    renderModeInfo,
    renderPaytable,
    renderPlayerRound,
    renderReelsGrid,
    renderWinHighlightsList,
    renderWinsSection,
    PLAYER_PRESENTATION_STYLE_ID,
} from "../../../../cli/client/player/renderPlayer.js";
import {
    deriveAvailableBetModeIds,
    deriveAvailableBets,
    deriveBetModeId,
    deriveFeatureCounters,
    deriveLineDefinitions,
    derivePaytableView,
    deriveTotalWin,
    deriveWinHighlights,
    deriveWinHighlightsFromRoundArtifactWins,
    type VideoSlotRoundResponse,
    type WinHighlight,
} from "../../../../cli/client/player/videoSlotRoundView.js";

// pokie-examples is a separately checked-out companion project.  The canonical-player
// reachability assertions below run whenever that companion is provided, while this
// repository's standalone test suite remains runnable from an isolated worktree.
const pokieExamplesRoot = process.env.POKIE_EXAMPLES_PATH
    ? resolve(process.env.POKIE_EXAMPLES_PATH)
    : resolve(process.cwd(), "..", "pokie-examples");
const pokieExamplesAvailable = existsSync(pokieExamplesRoot);

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
                paylinePositions: [[0, 0], [1, 0]],
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

describe("renderPlayerRound", () => {
    function createElements() {
        return {
            credits: document.createElement("div"),
            totalWin: document.createElement("div"),
            payoutMultiplier: document.createElement("div"),
            gridContainer: document.createElement("div"),
            winsSection: document.createElement("section"),
            winsList: document.createElement("div"),
            linesList: document.createElement("div"),
            features: document.createElement("dl"),
            betInfo: document.createElement("div"),
            modeInfo: document.createElement("div"),
            paytableHead: document.createElement("tr"),
            paytableBody: document.createElement("tbody"),
        };
    }

    it("renders the complete computed round through one entrypoint and clears disabled sections on the next round", () => {
        const elements = createElements();
        const selectBet = jest.fn();
        const selectMode = jest.fn();

        renderPlayerRound(elements, {
            credits: 88,
            totalWin: 12,
            payoutMultiplier: 1.2,
            reelsSymbols: [["A", "K"], ["Q"]],
            highlights: [{id: "line:0", kind: "line", label: "Line: 0, win: 12", winAmount: 12, positions: [[0, 0]], paylinePositions: [[0, 0], [1, 0]]}],
            featureCounters: [{label: "FG num", value: 2}],
            lines: [{lineId: "0", definition: [0, 0]}],
            paytable: {multipliers: [3], rows: [{symbolId: "A", amounts: [12]}]},
            availableBets: [10, 20],
            currentBet: 10,
            onSelectBet: selectBet,
            availableModeIds: ["base", "ante"],
            currentModeId: "base",
            onSelectMode: selectMode,
            artworkUrlForSymbol: (symbol) => (symbol === "A" ? "/artwork/A.png" : undefined),
        });

        expect(elements.gridContainer.querySelector('[data-cell="0:0"] img')?.getAttribute("src")).toBe("/artwork/A.png");
        const image = elements.gridContainer.querySelector('[data-cell="0:0"] img') as HTMLImageElement;
        image.dispatchEvent(new Event("error"));
        expect(elements.gridContainer.querySelector('[data-cell="0:0"]')?.textContent).toBe("A");
        expect(elements.credits.textContent).toBe("88");
        expect(elements.totalWin.textContent).toBe("12");
        expect(elements.payoutMultiplier.textContent).toBe("1.2");
        expect(elements.winsSection.hidden).toBe(false);
        expect(elements.winsList.textContent).toContain("Line: 0, win: 12");
        expect(elements.features.textContent).toContain("FG num2");
        expect(elements.linesList.textContent).toContain("Line: 0");
        expect(elements.paytableBody.textContent).toContain("A12");
        expect(elements.betInfo.querySelectorAll("button")).toHaveLength(2);
        expect(elements.modeInfo.querySelectorAll("button")).toHaveLength(2);

        renderPlayerRound(elements, {reelsSymbols: [["B"]], highlights: []});

        expect(elements.winsSection.hidden).toBe(true);
        expect(elements.winsList.children).toHaveLength(0);
        expect(elements.features.hidden).toBe(true);
        expect(elements.linesList.children).toHaveLength(0);
        expect(elements.paytableHead.children).toHaveLength(0);
        expect(elements.paytableBody.children).toHaveLength(0);
        expect(elements.betInfo.children).toHaveLength(0);
        expect(elements.modeInfo.children).toHaveLength(0);
        expect(elements.credits.textContent).toBe("—");
        expect(elements.totalWin.textContent).toBe("—");
        expect(elements.payoutMultiplier.textContent).toBe("—");
        expect(elements.gridContainer.querySelector('[data-cell="0:0"]')?.textContent).toBe("B");
    });

    it("installs the shared responsive presentation stylesheet and exposes selected controls to assistive technology", () => {
        const elements = createElements();
        renderPlayerRound(elements, {
            reelsSymbols: [["A"]],
            highlights: [],
            availableBets: [1, 2],
            currentBet: 1,
            availableModeIds: ["base", "ante"],
            currentModeId: "base",
        });

        expect(document.getElementById(PLAYER_PRESENTATION_STYLE_ID)?.textContent).toContain("@media (max-width: 480px)");
        expect(elements.betInfo.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
        expect((elements.betInfo.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
        expect(elements.modeInfo.querySelector("button")?.getAttribute("aria-label")).toBe("Select mode base");
    });
});

describe("canonical Player source reachability", () => {
    it("makes the dev client and Studio invoke the barrel's single round entrypoint", () => {
        const devClient = readFileSync(resolve(process.cwd(), "cli/client/main.ts"), "utf8");
        const studio = readFileSync(
            resolve(process.cwd(), "cli/studio-client/src/components/common/CanonicalPlayerView.tsx"),
            "utf8",
        );

        expect(devClient).toContain('from "./player/index.js"');
        expect(devClient).toContain("renderPlayerRound(");
        expect(studio).toContain('from "../../../../client/player"');
        expect(studio).toContain("renderPlayerRound(");
        expect(studio).not.toContain('from "../../../../client/player/renderPlayer"');
    });

    (pokieExamplesAvailable ? it : it.skip)("makes pokie-examples invoke the barrel's single round entrypoint", () => {
        const examplesUi = readFileSync(resolve(pokieExamplesRoot, "src/ui/ui.ts"), "utf8");
        const fixturePage = readFileSync(resolve(pokieExamplesRoot, "fixture-slot.html"), "utf8");
        const fixtureEntry = readFileSync(resolve(pokieExamplesRoot, "src/fixture-slot.ts"), "utf8");
        const fixtureGame = readFileSync(resolve(pokieExamplesRoot, "src/games/fixture-slot/index.ts"), "utf8");
        const examplesIndex = readFileSync(resolve(pokieExamplesRoot, "index.html"), "utf8");

        expect(examplesUi).toContain('from "pokie/client/player"');
        expect(examplesUi).toContain("renderPlayerRound(");
        // The public examples index exposes a real navigation control to the fixture page; that
        // page boots the normal initializeUi() Player workflow, whose rendered Play control runs a
        // genuine seeded VideoSlotSession.  This intentionally proves source reachability through
        // the same canonical renderer rather than an automation-only DOM/state injection route.
        expect(examplesIndex).toContain('href="fixture-slot.html"');
        expect(fixturePage).toContain('src="/src/fixture-slot.ts"');
        expect(fixtureEntry).toContain("initializeUi(");
        expect(fixtureEntry).toContain("createFixtureSession");
        expect(fixtureGame).toContain('FIXTURE_SEED = "fixture-round"');
        expect(fixtureGame).toContain("new VideoSlotSession(");
        expect(fixtureGame).toContain("new SymbolsCombinationsGenerator(");
        for (const legacyRenderer of [
            "renderReelsGrid(",
            "applyPersistentHighlights(",
            "renderWinsSection(",
            "renderWinHighlightsList(",
            "renderFeatureCounters(",
            "renderBetInfo(",
            "renderModeInfo(",
            "renderLineDefinitionsList(",
            "renderPaytable(",
        ]) {
            expect(examplesUi).not.toContain(legacyRenderer);
        }
    });

    it("publishes the canonical Player barrel", () => {
        const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
            version: string;
            exports: Record<string, {types: string; default: string}>;
            files: string[];
        };
        const exportedPlayer = packageJson.exports["./client/player"];

        expect(exportedPlayer).toEqual({
            types: "./dist/cli/client/player/index.d.ts",
            default: "./dist/cli/client/player/index.js",
        });
        expect(packageJson.files).toContain("dist/");
        expect(canonicalPlayer.renderPlayerRound).toBe(renderPlayerRound);
    });

    (pokieExamplesAvailable ? it : it.skip)("makes the package-consumer example resolve the Player barrel without a workspace alias", () => {
        const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {version: string};
        const examplesPackage = JSON.parse(readFileSync(resolve(pokieExamplesRoot, "package.json"), "utf8")) as {
            dependencies: Record<string, string>;
        };
        const examplesViteConfig = readFileSync(resolve(pokieExamplesRoot, "vite.config.js"), "utf8");
        const examplesTsconfig = readFileSync(resolve(pokieExamplesRoot, "tsconfig.json"), "utf8");

        expect(examplesPackage.dependencies.pokie).toBe(`^${packageJson.version}`);
        expect(examplesViteConfig).not.toContain("/workspace");
        expect(examplesViteConfig).not.toContain("pokieClientPlayerPath");
        expect(examplesTsconfig).not.toContain("/workspace");
        expect(examplesTsconfig).not.toContain('"paths"');
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

// One fixture round (a real, already-computed VideoSlotWithFreeGames response, not something this test
// derives a win from) rendered through the exact call sequence cli/client/main.ts's own
// renderVideoSlotRound() and pokie-examples' src/ui/ui.ts's own renderRound() both make against this same
// "./player" barrel -- proving those two consumers, plus this repo's own tests, all exercise one shared
// canonical player rather than each having drifted onto its own copy. The Studio-side counterpart of this
// same fixture round (identical reels/win, expressed as a RoundArtifact) lives in
// tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx's own
// "canonical player parity" describe block -- a separate file/jsdom-vs-RTL runtime is unavoidable (Jest's
// own "pokie" and "studio-client-workflows" projects use different tsconfigs/transforms), but the
// "reaches the same shared presentation entrypoint" describe block right below this one closes that gap
// from this side: it imports deriveWinHighlightsFromRoundArtifactWins -- the exact function Studio's own
// WinOverlay calls -- directly into this jsdom-only file and proves it derives the identical highlight
// this fixture's own VideoSlotRoundResponse-derived highlight is, then renders it through this same
// module's own DOM functions, unmodified.
describe("canonical player fixture round parity (dev client / pokie-examples)", () => {
    const FIXTURE_RESPONSE: VideoSlotRoundResponse = {
        reelsSymbols: [
            ["cherry", "K", "Q"],
            ["cherry", "K", "Q"],
            ["lemon", "K", "Q"],
        ],
        totalWin: 12.5,
        winningLines: {
            "0": {definition: [0, 0, 0], pattern: [1, 1, 0], symbolsPositions: [0, 1], winAmount: 12.5},
        },
        paytable: {
            "5": {
                cherry: {"2": 12.5, "3": 20},
                lemon: {"3": 5},
                K: {"3": 3},
                Q: {"3": 2},
            },
        },
        linesDefinitions: {"0": [0, 0, 0]},
        availableBets: [5, 10],
        bet: 5,
        availableBetModeIds: ["base", "ante"],
        betModeId: "base",
    };

    // Mirrors renderVideoSlotRound()/renderRound() exactly: their inputs are adapted from the response,
    // then the canonical entrypoint owns every Player section without client-side recomputation of
    // FIXTURE_RESPONSE's own already-computed winningLines/totalWin.
    function renderFixtureRound() {
        const gridContainer = document.createElement("div");
        const credits = document.createElement("div");
        const totalWin = document.createElement("div");
        const payoutMultiplier = document.createElement("div");
        const winsSection = document.createElement("div");
        const winsList = document.createElement("div");
        const linesList = document.createElement("div");
        const features = document.createElement("dl");
        const betInfo = document.createElement("div");
        const modeInfo = document.createElement("div");
        const paytableHead = document.createElement("tr");
        const paytableBody = document.createElement("tbody");

        const highlights = deriveWinHighlights(FIXTURE_RESPONSE);
        const winAmount = deriveTotalWin(FIXTURE_RESPONSE);
        renderPlayerRound(
            {credits, totalWin, payoutMultiplier, gridContainer, winsSection, winsList, linesList, features, betInfo, modeInfo, paytableHead, paytableBody},
            {
                credits: 87.5,
                totalWin: winAmount,
                payoutMultiplier: 2.5,
                reelsSymbols: FIXTURE_RESPONSE.reelsSymbols as string[][],
                highlights,
                featureCounters: deriveFeatureCounters(FIXTURE_RESPONSE),
                lines: deriveLineDefinitions(FIXTURE_RESPONSE.linesDefinitions),
                paytable: derivePaytableView(FIXTURE_RESPONSE.paytable),
                availableBets: deriveAvailableBets(FIXTURE_RESPONSE.availableBets),
                currentBet: FIXTURE_RESPONSE.bet as number,
                onSelectBet: () => undefined,
                availableModeIds: deriveAvailableBetModeIds(FIXTURE_RESPONSE.availableBetModeIds),
                currentModeId: deriveBetModeId(FIXTURE_RESPONSE.betModeId),
                onSelectMode: () => undefined,
            },
        );

        return {
            credits,
            totalWin,
            payoutMultiplier,
            gridContainer,
            winsSection,
            winsList,
            linesList,
            features,
            betInfo,
            modeInfo,
            paytableHead,
            paytableBody,
        };
    }

    it("presents orientation, win highlighting, paytable, bets/modes and navigation consistently for the one fixture round", () => {
        const view = renderFixtureRound();

        // Orientation: reel-major input, addressable by its own [data-cell="rowIndex:reelIndex"] id (see
        // renderReelsGrid's own cellId()).
        expect(view.gridContainer.querySelector('[data-cell="0:0"]')?.textContent).toBe("cherry");
        expect(view.gridContainer.querySelector('[data-cell="0:1"]')?.textContent).toBe("cherry");
        expect(view.gridContainer.querySelector('[data-cell="0:2"]')?.textContent).toBe("lemon");

        // Winning-line highlight: exactly the two matched cells this response's own winningLines already
        // computed, never a third cell this test would only get right by recomputing the win itself.
        const winningCellA = view.gridContainer.querySelector('[data-cell="0:0"]') as HTMLElement;
        const winningCellB = view.gridContainer.querySelector('[data-cell="0:1"]') as HTMLElement;
        const nonWinningCell = view.gridContainer.querySelector('[data-cell="0:2"]') as HTMLElement;
        expect(winningCellA.style.backgroundColor).not.toBe("");
        expect(winningCellB.style.backgroundColor).toBe(winningCellA.style.backgroundColor);
        expect(nonWinningCell.style.backgroundColor).toBe("");
        expect(view.winsSection.hidden).toBe(false);
        expect(view.winsList.querySelector("button")?.textContent).toBe("Line: 0, win: 12.5");
        expect(view.credits.textContent).toBe("87.5");
        expect(view.totalWin.textContent).toBe("12.5");
        expect(view.payoutMultiplier.textContent).toBe("2.5");

        // Paytable, straight off the response's own bet-keyed table.
        expect(view.paytableHead.textContent).toBe("Symbol23");
        expect(view.paytableBody.textContent).toBe("cherry12.520lemon5K3Q2");

        // Bets/modes: the response's own current values, plus a clickable option per alternative.
        expect(view.betInfo.textContent).toContain("Bet: 5");
        expect(Array.from(view.betInfo.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["5", "10"]);
        expect(view.modeInfo.textContent).toContain("Mode: base");
        expect(Array.from(view.modeInfo.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["base", "ante"]);

        // Navigation: this round's own line definitions are hover-browsable regardless of which won.
        expect(view.linesList.querySelector("button")?.textContent).toBe("Line: 0");
    });
});

// Proves cli/client's own DOM player and Studio's own React player reach the same shared presentation
// entrypoint for the identical fixture round above -- not just two adapters that happen to produce
// similarly-shaped output, but the literal same deriveWinHighlightsFromRoundArtifactWins function Studio's
// own cli/studio-client/src/components/common/WinOverlay.tsx calls, exercised here and rendered through
// this module's own unmodified DOM functions.
describe("canonical player fixture round parity: reaches the same shared presentation entrypoint as Studio", () => {
    // The identical round above (cherry/cherry/lemon, line win amount 12.5, symbolsPositions [0, 1],
    // definition [0, 0, 0]), expressed as a RoundArtifact's own wins -- the exact same shape
    // ProjectDashboardPage.playWorkflow.test.tsx's own fixtureArtifact() constructs for Play's real
    // session/spin workflow.
    const ROUND_ARTIFACT_WINS = [
        {
            type: "line",
            id: "0",
            symbolId: "cherry",
            winAmount: 12.5,
            winningPositions: [[0, 0], [1, 0]],
            metadata: {definition: [0, 0, 0]},
        },
    ];

    it("derives the same highlight from a RoundArtifact win as from the equivalent VideoSlotRoundResponse, and renders it through the same DOM functions", () => {
        const videoSlotHighlights = deriveWinHighlights({
            reelsSymbols: [["cherry", "K", "Q"], ["cherry", "K", "Q"], ["lemon", "K", "Q"]],
            winningLines: {"0": {definition: [0, 0, 0], pattern: [1, 1, 0], symbolsPositions: [0, 1], winAmount: 12.5}},
        });
        const roundArtifactHighlights = deriveWinHighlightsFromRoundArtifactWins(ROUND_ARTIFACT_WINS, 3);

        // Same positions/paylinePositions/winAmount -- only `id`/`label` differ (a RoundArtifact win's own
        // id/type-based label convention vs. VideoSlotRoundResponse's own lineId-based one), proving the
        // shared entrypoint converges both DTOs onto the same highlight rather than each deriving its own.
        expect(roundArtifactHighlights).toEqual([
            expect.objectContaining({
                kind: "line",
                winAmount: 12.5,
                positions: videoSlotHighlights[0].positions,
                paylinePositions: videoSlotHighlights[0].paylinePositions,
            }),
        ]);

        // Rendered through this module's own unmodified DOM functions -- the same functions
        // cli/client/main.ts and pokie-examples call -- exactly as the VideoSlotRoundResponse-driven
        // fixture round above is.
        const gridContainer = document.createElement("div");
        renderReelsGrid(gridContainer, [["cherry", "K", "Q"], ["cherry", "K", "Q"], ["lemon", "K", "Q"]]);
        applyPersistentHighlights(gridContainer, roundArtifactHighlights);

        const winningCellA = gridContainer.querySelector('[data-cell="0:0"]') as HTMLElement;
        const winningCellB = gridContainer.querySelector('[data-cell="0:1"]') as HTMLElement;
        const nonWinningCell = gridContainer.querySelector('[data-cell="0:2"]') as HTMLElement;
        expect(winningCellA.style.backgroundColor).not.toBe("");
        expect(winningCellB.style.backgroundColor).toBe(winningCellA.style.backgroundColor);
        expect(nonWinningCell.style.backgroundColor).toBe("");
    });
});
