import {initializeUi} from "../src/ui/ui.ts";
import {initializeData} from "../src/data.ts";

// Proves this example project actually renders through pokie's own canonical
// "pokie/client/player" surface (see vite.config.js/tsconfig.json's own alias for how that
// specifier resolves here, and cli/client/player/renderPlayer.ts for the functions under test) --
// not a fork of it -- by driving the real, migrated ui.ts/data.ts against a fully controlled fake
// session+serializer, the same way tests/server/spin/SpinCommandHandler.test.ts's own fakes control
// pokie's server-side session boundary.

type RoundFixture = {
    reelsSymbols: string[][];
    totalWin?: number;
    winningLines?: Record<string, unknown>;
    winningScatters?: Record<string, unknown>;
};

const PAYTABLE = {
    "10": {Ace: {3: 6, 4: 8, 5: 10}, Scatter1: {3: 10, 4: 20, 5: 30}},
    "20": {Ace: {3: 6, 4: 8, 5: 10}, Scatter1: {3: 10, 4: 20, 5: 30}},
};
const LINES_DEFINITIONS = {"0": [0, 1, 0, 0, 0], "1": [1, 1, 1, 1, 1]};
const AVAILABLE_BETS = [10, 20, 30];
const AVAILABLE_BET_MODE_IDS = ["base", "ante"];

const plainGrid: string[][] = [
    ["Ace", "King", "Queen", "Jack"],
    ["Ace", "Ace", "Ace", "Ten"],
    ["Ace", "King", "Queen", "Jack"],
    ["King", "Queen", "Jack", "Nine"],
    ["Queen", "Jack", "Ten", "Nine"],
];

const lineWinRound: RoundFixture = {
    reelsSymbols: plainGrid,
    totalWin: 40,
    winningLines: {
        "0": {definition: [0, 1, 0, 0, 0], pattern: [1, 1, 1, 0, 0], symbolId: "Ace", symbolsPositions: [0, 1, 2], winAmount: 40},
    },
};

const lineAndScatterWinRound: RoundFixture = {
    reelsSymbols: plainGrid,
    totalWin: 100,
    winningLines: {
        "0": {definition: [0, 1, 0, 0, 0], pattern: [1, 1, 1, 0, 0], symbolId: "Ace", symbolsPositions: [0, 1, 2], winAmount: 40},
    },
    winningScatters: {
        Scatter1: {symbolId: "Scatter1", symbolsPositions: [[0, 3], [2, 0], [4, 1]], winAmount: 60},
    },
};

const noWinRound: RoundFixture = {reelsSymbols: plainGrid, totalWin: 0};

// A minimal stand-in for pokie's own VideoSlotSession + VideoSlotWithBetModesSession, controlled
// entirely by the test: play() serves the next queued fixture (or throws, for the retry/reconnect
// tests below), setBet()/setBetMode() are recorded rather than validated. AnyVideoSlotSession /
// VideoSlotSessionSerializer are real pokie classes data.ts's own types are pinned to -- this is
// cast past that at the call site the same way every other pokie-examples game only ever hands
// initializeData() a real session/serializer pair it built itself; this test needs the
// determinism a real RNG-backed session can't give it.
class FakeSession {
    public bet = 20;
    public betModeId = "base";
    public credits = 980;
    public shouldFail = false;
    private queue: RoundFixture[];
    private current: RoundFixture;

    constructor(initial: RoundFixture, queue: RoundFixture[]) {
        this.current = initial;
        this.queue = queue;
    }

    setBet(bet: number): void {
        this.bet = bet;
    }

    setBetMode(modeId: string): void {
        this.betModeId = modeId;
    }

    getBetModeId(): string {
        return this.betModeId;
    }

    getAvailableBetModeIds(): string[] {
        return AVAILABLE_BET_MODE_IDS;
    }

    play(): void {
        if (this.shouldFail) {
            throw new Error("Simulated round failure");
        }
        this.current = this.queue.shift() ?? this.current;
    }

    getCurrent(): RoundFixture {
        return this.current;
    }
}

class FakeSerializer {
    getInitialData(session: FakeSession) {
        return {
            ...session.getCurrent(),
            bet: session.bet,
            betModeId: session.betModeId,
            credits: session.credits,
            paytable: PAYTABLE,
            linesDefinitions: LINES_DEFINITIONS,
            availableBets: AVAILABLE_BETS,
            availableBetModeIds: AVAILABLE_BET_MODE_IDS,
        };
    }

    getRoundData(session: FakeSession) {
        return {
            ...session.getCurrent(),
            bet: session.bet,
            betModeId: session.betModeId,
            credits: session.credits,
        };
    }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// jsdom never lays anything out, so offsetParent/offsetHeight are always 0 regardless of CSS --
// the only way to tell "visible" from "hidden" here is to walk the element's own ancestor chain
// (mirroring what a real browser -- and libraries like @testing-library/jest-dom's toBeVisible(),
// unavailable in this project) checks: no ancestor computed to display:none or visibility:hidden.
function isRenderedVisible(el: HTMLElement): boolean {
    let node: HTMLElement | null = el;
    while (node) {
        const style = node.ownerDocument.defaultView!.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") {
            return false;
        }
        node = node.parentElement;
    }
    return true;
}

async function renderExample(initial: RoundFixture, queue: RoundFixture[]) {
    const session = new FakeSession(initial, queue);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initializeData(session as any, new FakeSerializer() as any);
    const div = document.createElement("div");
    document.body.appendChild(div);
    await initializeUi(div);
    await flush();
    return {div, session};
}

describe("pokie-examples' ui.ts adoption of pokie/client/player", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("renders the grid through the shared player's own renderReelsGrid, not a bespoke table", async () => {
        const {div} = await renderExample(noWinRound, []);
        expect(div.querySelector(".player-grid")).not.toBeNull();
        expect(div.querySelectorAll(".player-cell")).toHaveLength(5 * 4);
        expect(div.querySelector("#reels")).toBeNull();
    });

    it("renders a winning payline via the shared player's win-highlight list", async () => {
        const {div} = await renderExample(noWinRound, [lineWinRound]);
        (div.querySelector("#playButton") as HTMLButtonElement).click();
        await flush();

        expect((div.querySelector("#winningLines") as HTMLElement).hidden).toBe(false);
        const buttons = Array.from(div.querySelectorAll("#winningLinesList .player-highlight-button")) as HTMLButtonElement[];
        expect(buttons.map((b) => b.textContent)).toEqual(["Line: 0, win: 40"]);
    });

    it("renders multiple win kinds (line + scatter) from the same round together", async () => {
        const {div} = await renderExample(noWinRound, [lineAndScatterWinRound]);
        (div.querySelector("#playButton") as HTMLButtonElement).click();
        await flush();

        const buttons = Array.from(div.querySelectorAll("#winningLinesList .player-highlight-button")) as HTMLButtonElement[];
        expect(buttons.map((b) => b.textContent)).toEqual(["Line: 0, win: 40", "Scatter: Scatter1, win: 60"]);
        expect(div.querySelector("#win")?.textContent).toBe("Win: 100");
    });

    it("lets a player pick one of the session's own available bets, and re-spins staked at it", async () => {
        const {div, session} = await renderExample(noWinRound, [noWinRound]);
        const options = Array.from(div.querySelectorAll("#betInfo .player-bet-option")) as HTMLButtonElement[];
        expect(options.map((b) => b.textContent)).toEqual(["10", "20", "30"]);

        options.find((b) => b.textContent === "10")!.click();
        await flush();

        expect(session.bet).toBe(10);
        expect(div.querySelector("#betInfo .player-bet-current")?.textContent).toBe("Bet: 10");
    });

    it("lets a player pick one of the session's own available bet modes, and re-spins with it", async () => {
        const {div, session} = await renderExample(noWinRound, [noWinRound]);
        const options = Array.from(div.querySelectorAll("#modeInfo .player-mode-option")) as HTMLButtonElement[];
        expect(options.map((b) => b.textContent)).toEqual(["base", "ante"]);

        options.find((b) => b.textContent === "ante")!.click();
        await flush();

        expect(session.betModeId).toBe("ante");
        expect(div.querySelector("#modeInfo .player-mode-current")?.textContent).toBe("Mode: ante");
    });

    it("keeps the reels grid's own narrow-viewport styling", async () => {
        const {div} = await renderExample(noWinRound, []);
        const style = div.ownerDocument.getElementById("ui-style") as HTMLStyleElement;
        expect(style.textContent).toMatch(/@media \(max-width: 480px\)/);
        expect(style.textContent).toMatch(/\.player-cell\s*{\s*font-size: 12px;/);
    });

    it("shows a retryable error when a round fails, and retrying re-spins successfully", async () => {
        const {div, session} = await renderExample(noWinRound, [lineWinRound]);
        session.shouldFail = true;
        (div.querySelector("#playButton") as HTMLButtonElement).click();
        await flush();

        const errorSection = div.querySelector("#roundError") as HTMLElement;
        const errorMessage = div.querySelector("#roundErrorMessage") as HTMLElement;
        const retryButton = div.querySelector("#roundRetryButton") as HTMLButtonElement;
        const reconnectButton = div.querySelector("#roundReconnectButton") as HTMLButtonElement;

        // hidden=false alone doesn't prove a user can see it -- the panel also carried an inline
        // style="display: none" that survived toggling `hidden`, so assert the actual rendered
        // (ancestor-chain) visibility, not just the property renderConnectionError() sets.
        expect(errorSection.hidden).toBe(false);
        expect(isRenderedVisible(errorSection)).toBe(true);
        expect(isRenderedVisible(errorMessage)).toBe(true);
        expect(errorMessage.textContent).toContain("Simulated round failure");

        // The technical <details> stay visibly present (collapsed by default), and retry/reconnect
        // stay visible and clickable alongside the readable message -- not just non-null in the DOM.
        expect(isRenderedVisible(div.querySelector("details") as HTMLElement)).toBe(true);
        expect((div.querySelector("details") as HTMLDetailsElement).open).toBe(false);
        expect(isRenderedVisible(retryButton)).toBe(true);
        expect(isRenderedVisible(reconnectButton)).toBe(true);
        expect(retryButton.disabled).toBe(false);

        session.shouldFail = false;
        retryButton.click();
        await flush();

        expect(errorSection.hidden).toBe(true);
        expect(isRenderedVisible(errorSection)).toBe(false);
        expect(div.querySelector("#win")?.textContent).toBe("Win: 40");
    });

    it("falls back to the last-known-good initial round when reconnecting after a failure", async () => {
        const {div, session} = await renderExample(noWinRound, [lineWinRound]);
        session.shouldFail = true;
        (div.querySelector("#playButton") as HTMLButtonElement).click();
        await flush();

        const errorSection = div.querySelector("#roundError") as HTMLElement;
        expect(isRenderedVisible(errorSection)).toBe(true);
        expect(isRenderedVisible(div.querySelector("#roundReconnectButton") as HTMLElement)).toBe(true);

        (div.querySelector("#roundReconnectButton") as HTMLButtonElement).click();
        await flush();

        expect(errorSection.hidden).toBe(true);
        expect(isRenderedVisible(errorSection)).toBe(false);
        expect(div.querySelector("#win")?.textContent).toBe("Win: 0");
    });
});
