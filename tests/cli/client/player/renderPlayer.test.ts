/**
 * @jest-environment jsdom
 */
import {existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import * as canonicalPlayer from "../../../../cli/client/player/index.js";
import {
    applyPersistentHighlights,
    clearConnectionError,
    createPlayerRoundElements,
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
function adaptExamplesCandidate(original: string, candidate: string, spec: string): string {
    execFileSync(process.execPath, ["--input-type=module", "--eval", `
        import {adaptPc12CandidateConsumer} from ${JSON.stringify(pathToFileURL(resolve(process.cwd(), "scripts/pc-12-player-parity-browser.mjs")).href)};
        await adaptPc12CandidateConsumer(...process.argv.slice(1));
    `, original, candidate, spec], {timeout: 10_000});
    return candidate;
}

const suppliedExamples = process.env.POKIE_EXAMPLES_PATH;
const pokieExamplesAvailable = suppliedExamples !== undefined && existsSync(suppliedExamples);
let pokieExamplesRoot: string;
let examplesStaging: string;
beforeAll(() => {
    if (!pokieExamplesAvailable) return;
    examplesStaging = mkdtempSync(resolve(process.cwd(), "node_modules/.cache/pokie-tmp/player-examples-"));
    const version = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")).version;
    pokieExamplesRoot = adaptExamplesCandidate(resolve(suppliedExamples!), resolve(examplesStaging, "candidate"), `^${version}`);
});
afterAll(() => {
    if (examplesStaging) rmSync(examplesStaging, {recursive: true, force: true});
});

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
        expect(buttons[0].title).toBe("Current bet selection");
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
    it("owns the complete player section order in one reusable mount contract", () => {
        const root = document.createElement("section");
        root.appendChild(document.createElement("p"));
        const elements = createPlayerRoundElements(root);

        expect(root.classList.contains("pokie-player")).toBe(true);
        expect(root.getAttribute("data-pokie-player")).toBe("canonical-v1");
        expect(root.getAttribute("aria-label")).toBe("Game player");
        expect(Array.from(root.children).map((element) => element.className)).toEqual([
            "player-bet-info",
            "player-mode-info",
            "player-round-overview",
            "player-features",
            "player-wins",
            "player-lines-details",
            "player-paytable-details",
        ]);
        expect(elements.gridContainer.closest(".pokie-player-grid-scroll")).not.toBeNull();
        expect(Array.from(root.querySelector(".player-round-overview")!.children).map(element => element.className)).toEqual([
            "pokie-player-grid-scroll", "player-round-totals",
        ]);
        expect(root.classList.contains("pokie-player-card")).toBe(false);
        expect(elements.paytableBody.closest(".player-paytable-details")).not.toBeNull();
        expect(root.querySelector("p")).toBeNull();
    });

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

    it("composes Studio reels and metrics in wrapping tracks without changing the standalone host or round data", () => {
        const standalone = document.createElement("div");
        const studio = document.createElement("div");
        studio.className = "pokie-player-card";
        document.body.append(standalone, studio);
        try {
            for (const root of [standalone, studio]) {
                const elements = createPlayerRoundElements(root);
                renderPlayerRound(elements, {
                    reelsSymbols: [["A", "K"], ["Q"]], highlights: [],
                    credits: 0, totalWin: 7.5, payoutMultiplier: 1.5,
                });
            }
            // Same canonical nodes and values; only the host-selected presentation differs.
            expect(studio.innerHTML).toBe(standalone.innerHTML);
            const overview = studio.querySelector<HTMLElement>(".player-round-overview")!;
            const grid = studio.querySelector<HTMLElement>(".pokie-player-grid-scroll")!;
            const totals = studio.querySelector<HTMLElement>(".player-round-totals")!;
            expect(getComputedStyle(overview).display).toBe("flex");
            expect(getComputedStyle(overview).flexWrap).toBe("wrap");
            expect(getComputedStyle(overview).gap).toBe("1.5rem");
            expect(getComputedStyle(grid).flex).toBe("2 1 22rem");
            expect(getComputedStyle(totals).flex).toBe("1 1 14rem");
            expect(getComputedStyle(grid).minWidth).toBe("0");
            expect(getComputedStyle(grid).overflowX).toBe("auto");
            expect(getComputedStyle(studio.querySelector(".player-grid")!).margin).toBe("0px auto");
            expect(getComputedStyle(standalone.querySelector(".player-round-overview")!).display).toBe("block");
            expect(getComputedStyle(standalone.querySelector(".player-round-totals")!).display).toBe("block");

            // Hiding unavailable totals must still work despite the card's flex styling.
            renderPlayerRound(createPlayerRoundElements(studio), {reelsSymbols: [["B"]], highlights: []});
            const missingTotals = studio.querySelector<HTMLElement>(".player-round-totals")!;
            expect(missingTotals.hidden).toBe(true);
            expect(getComputedStyle(missingTotals).display).toBe("none");
            expect(missingTotals.textContent).toBe("CreditsTotal winPayout multiplier");
        } finally {
            standalone.remove();
            studio.remove();
        }
    });

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

    it("hides empty payline and paytable disclosures after a later plain round", () => {
        const root = document.createElement("section");
        const elements = createPlayerRoundElements(root);

        renderPlayerRound(elements, {
            reelsSymbols: [["A"]],
            highlights: [],
            lines: [{lineId: "0", definition: [0]}],
            paytable: {multipliers: [3], rows: [{symbolId: "A", amounts: [1]}]},
        });
        expect(elements.linesDetails?.hidden).toBe(false);
        expect(elements.paytableDetails?.hidden).toBe(false);

        renderPlayerRound(elements, {reelsSymbols: [["B"]], highlights: []});

        expect(elements.linesDetails?.hidden).toBe(true);
        expect(elements.paytableDetails?.hidden).toBe(true);
        expect(elements.linesList.children).toHaveLength(0);
        expect(elements.paytableBody.children).toHaveLength(0);
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
        expect(document.getElementById(PLAYER_PRESENTATION_STYLE_ID)?.textContent).toContain("font-family: system-ui");
        expect(elements.betInfo.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
        expect((elements.betInfo.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
        expect(elements.modeInfo.querySelector("button")?.getAttribute("aria-label")).toBe("Select mode base");
    });
});

describe("canonical Player source reachability", () => {
    it("adapts a legacy companion only in an owned candidate copy", () => {
        const staging = mkdtempSync(resolve(process.cwd(), "node_modules/.cache/pokie-tmp/player-adaptation-"));
        const original = resolve(staging, "original"),
            candidate = resolve(staging, "candidate");
        const ui = 'import {renderPlayerRound} from "pokie/client/player"; const schema = "pokie.round";';
        const manifest = JSON.stringify({private: true, dependencies: {pokie: "^1.3.0", vite: "4.3.9"}});
        try {
            mkdirSync(resolve(original, "src/ui"), {recursive: true});
            writeFileSync(resolve(original, "src/ui/ui.ts"), ui);
            writeFileSync(resolve(original, "package.json"), manifest);
            writeFileSync(resolve(original, "package-lock.json"), "original lock bytes");
            adaptExamplesCandidate(original, candidate, "^1.3.0");
            expect(readFileSync(resolve(candidate, "src/ui/ui.ts"), "utf8")).toBe(ui.replace('"pokie/client/player"', '"@fromstan/pokie/client/player"'));
            expect(JSON.parse(readFileSync(resolve(candidate, "package.json"), "utf8")).dependencies).toEqual({"@fromstan/pokie": "^1.3.0", vite: "4.3.9"});
            expect(existsSync(resolve(candidate, "package-lock.json"))).toBe(false);
            expect(readFileSync(resolve(original, "package.json"), "utf8")).toBe(manifest);
            expect(readFileSync(resolve(original, "src/ui/ui.ts"), "utf8")).toBe(ui);
            expect(readFileSync(resolve(original, "package-lock.json"), "utf8")).toBe("original lock bytes");
        } finally {
            rmSync(staging, {recursive: true, force: true});
        }
    });

    it("makes the dev client and Studio invoke the barrel's single round entrypoint", () => {
        const devClient = readFileSync(resolve(process.cwd(), "cli/client/main.ts"), "utf8");
        const studio = readFileSync(
            resolve(process.cwd(), "cli/studio-client/src/components/common/CanonicalPlayerView.tsx"),
            "utf8",
        );

        expect(devClient).toContain('from "./player/index.js"');
        expect(devClient).toContain("createPlayerRoundElements(");
        expect(devClient).toContain("renderPlayerRound(");
        expect(studio).toContain('from "../../../../client/player"');
        expect(studio).toContain("createPlayerRoundElements(");
        expect(studio).toContain("renderPlayerRound(");
        expect(studio).not.toContain('from "../../../../client/player/renderPlayer"');
    });

    (pokieExamplesAvailable ? it : it.skip)("makes pokie-examples invoke the barrel's single round entrypoint", () => {
        const examplesUi = readFileSync(resolve(pokieExamplesRoot, "src/ui/ui.ts"), "utf8");
        const fixturePage = readFileSync(resolve(pokieExamplesRoot, "fixture-slot.html"), "utf8");
        const fixtureEntry = readFileSync(resolve(pokieExamplesRoot, "src/fixture-slot.ts"), "utf8");
        const fixtureGame = readFileSync(resolve(pokieExamplesRoot, "src/games/fixture-slot/index.ts"), "utf8");
        const examplesIndex = readFileSync(resolve(pokieExamplesRoot, "index.html"), "utf8");

        expect(examplesUi).toContain('from "@fromstan/pokie/client/player"');
        expect(examplesUi).toContain("createPlayerRoundElements(");
        expect(examplesUi).toContain("renderPlayerRound(");
        expect(examplesUi).toContain("onSelectBet:");
        expect(examplesUi).toContain("onSelectMode:");
        // The public examples index exposes a real navigation control to the fixture page; that
        // page boots the normal initializeUi() Player workflow, whose rendered Play control runs a
        // genuine seeded VideoSlotSession.  This intentionally proves source reachability through
        // the same canonical renderer rather than an automation-only DOM/state injection route.
        expect(examplesIndex).toContain('href="fixture-slot.html"');
        expect(fixturePage).toContain('src="/src/fixture-slot.ts"');
        expect(fixtureEntry).toContain("initializeUi(");
        expect(fixtureEntry).toContain("createFixtureSession");
        expect(fixtureGame).toContain("FIXTURE_SEED = PC_12_FEATURED_ROUND_SEED");
        expect(fixtureGame).toContain("createPc12FreeGamesFixtureSession(FIXTURE_SEED)");
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
            exports: Record<string, {import: {types: string; default: string}}>;
            files: string[];
        };
        const exportedPlayer = packageJson.exports["./client/player"];

        expect(exportedPlayer).toEqual({
            import: {
                types: "./dist/cli/client/player/index.d.ts",
                default: "./dist/cli/client/player/index.js",
            },
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

        expect(examplesPackage.dependencies["@fromstan/pokie"]).toBe(`^${packageJson.version}`);
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


describe("Viewport-only player data", () => {
    it("F7 scales fractional rows with the active desktop/mobile cell size and keeps visible highlights", () => {
        const response = {winningLines: {edge: {lineId: "edge", definition: [], symbolsPositions: [0, 1, 2], wildSymbolsPositions: [0], visiblePositions: [[0, 1], [1, 1]], symbolId: "A", winAmount: 3}}};
        const highlights = deriveWinHighlights(response);
        expect(highlights[0].positions).toEqual([[0, 1], [1, 1]]);
        const root = document.createElement("div");
        const elements = createPlayerRoundElements(root);
        renderPlayerRound(elements, {reelsSymbols: [["W", "A", "A"], ["W", "A", "A"], ["W", "A", "A"]], visibleRowCoverage: [0.75, 1, 0.75], highlights});
        const partial = root.querySelector('[data-cell="0:0"]') as HTMLElement;
        const full = root.querySelector('[data-cell="1:0"]') as HTMLElement;
        expect(partial.getAttribute("data-visible-coverage")).toBe("0.75");
        expect(partial.style.getPropertyValue("--player-row-coverage")).toBe("0.75");
        expect(full.style.getPropertyValue("--player-row-coverage")).toBe("");
        const stylesheet = document.getElementById(PLAYER_PRESENTATION_STYLE_ID)!.textContent!;
        expect(stylesheet).toContain(".pokie-player { --player-cell-size: 3rem;");
        expect(stylesheet).toContain("height: calc(var(--player-cell-size) * var(--player-row-coverage, 1))");
        expect(stylesheet).toContain("@media (max-width: 480px) { .pokie-player { --player-cell-size: 2.25rem; }");
        expect(stylesheet).not.toContain("height: 2.25rem");
        expect((root.querySelector('[data-cell="1:0"]') as HTMLElement).style.backgroundColor).toBe("rgb(221, 255, 221)");
        expect((root.querySelector('[data-cell="0:2"]') as HTMLElement).style.backgroundColor).toBe("");
    });
});

it("renders the retained weighted bonus identity and zero remaining duration", () => {
    const root = document.createElement("div");
    const data = {boundedMechanics: {weightedBonus: {selection: {tableId: "prizes", outcomeId: "large", context: "logical:known"}, payout: 0, remaining: 0, executed: 2}}};
    renderFeatureCounters(root, deriveFeatureCounters(data));
    expect(root.textContent).toContain("Bonus outcomeId");
    expect(root.textContent).toContain("large");
    expect(root.textContent).toContain("logical:known");
    expect(root.textContent).toContain("Bonus remaining");
    expect(root.textContent).toContain("0");
});
