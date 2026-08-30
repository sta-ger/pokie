import {MantineProvider} from "@mantine/core";
import {fireEvent, render, within} from "@testing-library/react";
import type {RoundArtifact, RoundArtifactJson, StudioRuntimeSessionView} from "../../../../../../cli/studio-client/src/api/types";
import {RoundArtifactInspector} from "../../../../../../cli/studio-client/src/components/common/RoundArtifactInspector";
import {RoundSummary} from "../../../../../../cli/studio-client/src/components/common/RoundSummary";
import {describeRoundArtifact} from "../../../../../../cli/studio-client/src/domain/interpret/Replay";

const GAME = {id: "a", name: "A", version: "1.0.0"};

// A reel-major matrix (screen[reelIndex][rowIndex]) where every cell's label encodes both its reel and
// its row -- if RoundArtifactInspector's own ScreenTable call site (or describeRoundArtifact upstream of
// it) ever reintroduces the row/column transposition bug this guards against, reading down a table row
// would surface a single reel's own strip instead of one cell from each reel.
function artifactFor(overrides: Partial<RoundArtifact> = {}): RoundArtifactJson {
    const base: RoundArtifact = {
        schemaVersion: 1,
        roundId: "replay:demo-seed:1",
        provenance: {game: GAME, pokieVersion: "1.0.0"},
        betMode: "base",
        stake: 1,
        totalWin: 0,
        payoutMultiplier: 0,
        screen: [
            ["R0P0", "R0P1", "R0P2"],
            ["R1P0", "R1P1", "R1P2"],
            ["R2P0", "R2P1", "R2P2"],
        ],
        steps: [{index: 0, screen: [["R0P0", "R0P1", "R0P2"]], totalWin: 0, wins: []}],
        wins: [],
        ...overrides,
    };
    return {...base, hash: "hash-1"};
}

function renderWithMantine(ui: React.ReactElement) {
    return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("RoundArtifactInspector screen orientation", () => {
    it("renders the round-level canonical player grid so cells are addressable by their own [reelIndex, rowIndex], using the same describeRoundArtifact view-model the Inspect step actually consumes", () => {
        const artifact = describeRoundArtifact(artifactFor());
        const {container} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);

        // screen[reelIndex][rowIndex] -- reel-major, the same orientation cli/client/player's own
        // renderReelsGrid consumes directly (see its own cellId(), "rowIndex:reelIndex"), so this is a
        // straight readout of the fixture's own screen, never a transposition RoundArtifactInspector (or
        // describeRoundArtifact upstream of it) performs itself.
        const grid = container.querySelector(".player-grid") as HTMLElement;
        if (!grid) {
            throw new Error("Expected the round-level canonical player grid to render.");
        }
        expect(within(grid).getByText("R0P0")).toHaveAttribute("data-cell", "0:0");
        expect(within(grid).getByText("R1P0")).toHaveAttribute("data-cell", "0:1");
        expect(within(grid).getByText("R2P0")).toHaveAttribute("data-cell", "0:2");
        expect(within(grid).getByText("R0P1")).toHaveAttribute("data-cell", "1:0");
        expect(within(grid).getByText("R1P1")).toHaveAttribute("data-cell", "1:1");
        expect(within(grid).getByText("R2P1")).toHaveAttribute("data-cell", "1:2");
        expect(within(grid).getByText("R0P2")).toHaveAttribute("data-cell", "2:0");
        expect(within(grid).getByText("R1P2")).toHaveAttribute("data-cell", "2:1");
        expect(within(grid).getByText("R2P2")).toHaveAttribute("data-cell", "2:2");
    });
});

// Every case a win row can actually present, per RoundArtifactWin's own supported shapes (see
// src/session/videoslot/winevaluation/*WinComponent.ts and
// src/stakeengine/internal/StakeEngineImportSyntheticWinComponent.ts): a known individual win (real
// symbol, real winningPositions), a known aggregate win reconstructed from a Stake Engine import
// (metadata-flagged, no positions), a known aggregate win with no symbol at all (jackpot/legacy-style),
// and a win with no multiplier applied. Guards against ever reverting to the old anonymous placeholders
// ("0" positions, the literal string "undefined", or a bare "—").
describe("RoundArtifactInspector win amount presentation", () => {
    function stepWithWins(wins: RoundArtifact["wins"]) {
        return artifactFor({
            totalWin: wins.reduce((sum, win) => sum + win.winAmount, 0),
            steps: [{index: 0, screen: [["R0P0", "R0P1", "R0P2"]], totalWin: wins.reduce((sum, win) => sum + win.winAmount, 0), wins}],
            wins,
        });
    }

    function winsTable(getByText: ReturnType<typeof renderWithMantine>["getByText"]) {
        const table = getByText("Positions").closest("table");
        if (!table) {
            throw new Error("Expected a wins table with a 'Positions' column header.");
        }
        return table;
    }

    it("renders a known individual win's real symbol and position count, with no 'aggregate' badge", () => {
        const artifact = describeRoundArtifact(
            stepWithWins([
                {
                    type: "line",
                    id: "w1",
                    symbolId: "cherry",
                    winAmount: 5,
                    winningPositions: [[0, 0], [1, 0]],
                    multiplierBreakdown: [],
                    metadata: {},
                },
            ]),
        );
        const {getByText, queryByText} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);
        const table = winsTable(getByText);

        expect(within(table).getByText("cherry")).toBeTruthy();
        expect(within(table).getByText("2")).toBeTruthy();
        expect(queryByText("aggregate")).toBeNull();
    });

    it("labels a Stake Engine import's reconstructed win as aggregate and explains why positions aren't available, instead of showing a bare '0'", () => {
        const artifact = describeRoundArtifact(
            stepWithWins([
                {
                    type: "value",
                    id: "stakeEngineImportSynthetic",
                    symbolId: "wild",
                    winAmount: 12.5,
                    winningPositions: [],
                    multiplierBreakdown: [],
                    metadata: {stakeEngineImportSynthetic: true},
                },
            ]),
        );
        const {getByText, queryByText} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);
        const table = winsTable(getByText);

        expect(within(table).getByText("aggregate")).toBeTruthy();
        expect(queryByText("0", {selector: "td"})).toBeNull();
        expect(within(table).getByText(/unavailable.*reconstructed from an imported round/)).toBeTruthy();
    });

    it("labels a symbol-less aggregate win (jackpot/legacy-style) with an explicit reason instead of the literal string 'undefined'", () => {
        const artifact = describeRoundArtifact(
            stepWithWins([
                {
                    type: "jackpot",
                    id: "pool-1",
                    symbolId: undefined as unknown as string,
                    winAmount: 100,
                    winningPositions: [],
                    multiplierBreakdown: [],
                    metadata: {poolId: "pool-1"},
                },
            ]),
        );
        const {getByText, queryByText} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);
        const table = winsTable(getByText);

        expect(within(table).getByText("no symbol (aggregate win)")).toBeTruthy();
        expect(queryByText("undefined")).toBeNull();
        expect(within(table).getByText(/not applicable.*aggregate win, not attributed to specific positions/)).toBeTruthy();
    });

    it("explains a win with no multiplier applied instead of showing a bare dash", () => {
        const artifact = describeRoundArtifact(
            stepWithWins([
                {
                    type: "line",
                    id: "w1",
                    symbolId: "cherry",
                    winAmount: 5,
                    winningPositions: [[0, 0]],
                    multiplierBreakdown: [],
                    metadata: {},
                },
            ]),
        );
        const {getByText, queryByText} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);
        const table = winsTable(getByText);

        expect(within(table).getByText("not applicable — no multiplier applied to this win")).toBeTruthy();
        expect(queryByText("—")).toBeNull();
    });

    it("states a known individual win's amount alongside its own multiple of stake, the same 'x stake' unit the round-level Total win row already uses", () => {
        const artifact = describeRoundArtifact(
            stepWithWins([
                {
                    type: "line",
                    id: "w1",
                    symbolId: "cherry",
                    winAmount: 5,
                    winningPositions: [[0, 0], [1, 0]],
                    multiplierBreakdown: [],
                    metadata: {},
                },
            ]),
        );
        const artifactWithStake = {...artifact, stake: 2};
        const {getByText} = renderWithMantine(<RoundArtifactInspector artifact={artifactWithStake} />);
        const table = winsTable(getByText);

        expect(within(table).getByText("5.00 (2.50x stake)")).toBeTruthy();
    });

    it("states an aggregate (Stake Engine import) win's amount alongside its own multiple of stake, not a bare number", () => {
        const artifact = describeRoundArtifact(
            stepWithWins([
                {
                    type: "value",
                    id: "stakeEngineImportSynthetic",
                    symbolId: "wild",
                    winAmount: 12.5,
                    winningPositions: [],
                    multiplierBreakdown: [],
                    metadata: {stakeEngineImportSynthetic: true},
                },
            ]),
        );
        const artifactWithStake = {...artifact, stake: 5};
        const {getByText} = renderWithMantine(<RoundArtifactInspector artifact={artifactWithStake} />);
        const table = winsTable(getByText);

        expect(within(table).getByText("12.50 (2.50x stake)")).toBeTruthy();
    });

    it("renders a zero-amount win as an explicit 0.00 with its own zero unit, never a blank cell", () => {
        const artifact = describeRoundArtifact(
            stepWithWins([
                {
                    type: "line",
                    id: "w1",
                    symbolId: "cherry",
                    winAmount: 0,
                    winningPositions: [[0, 0]],
                    multiplierBreakdown: [],
                    metadata: {},
                },
            ]),
        );
        const {getByText} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);
        const table = winsTable(getByText);

        expect(within(table).getByText("0.00 (0.00x stake)")).toBeTruthy();
    });

    it("states a win amount's payout unit is unavailable rather than a misleading 0.00x when stake is 0", () => {
        const artifact = describeRoundArtifact(
            stepWithWins([
                {
                    type: "line",
                    id: "w1",
                    symbolId: "cherry",
                    winAmount: 5,
                    winningPositions: [[0, 0]],
                    multiplierBreakdown: [],
                    metadata: {},
                },
            ]),
        );
        const artifactWithNoStake = {...artifact, stake: 0};
        const {getByText} = renderWithMantine(<RoundArtifactInspector artifact={artifactWithNoStake} />);
        const table = winsTable(getByText);

        expect(within(table).getByText("5.00 (payout unit unavailable — stake is 0)")).toBeTruthy();
    });
});

// The Advanced details section's own two data-availability branches -- present for any game/session type
// that captured them, absent otherwise (see RoundArtifactInspector's own doc comment) -- covering both a
// genuinely reconstructed (Stake Engine import) artifact and an incomplete/partial `debug` payload,
// neither of which is exercised by the win-amount-focused tests above.
describe("RoundArtifactInspector imported-artifact and incomplete-debug presentation", () => {
    it("renders an imported (Stake Engine reconstruction) round's aggregate win and its own debug payload without state snapshots, rather than silently omitting either section", () => {
        const artifact = describeRoundArtifact(
            artifactFor({
                stake: 5,
                totalWin: 12.5,
                payoutMultiplier: 2.5,
                steps: [
                    {
                        index: 0,
                        screen: [["R0P0", "R0P1", "R0P2"]],
                        totalWin: 12.5,
                        wins: [
                            {
                                type: "value",
                                id: "stakeEngineImportSynthetic",
                                symbolId: "wild",
                                winAmount: 12.5,
                                winningPositions: [],
                                multiplierBreakdown: [],
                                metadata: {stakeEngineImportSynthetic: true},
                            },
                        ],
                    },
                ],
                wins: [
                    {
                        type: "value",
                        id: "stakeEngineImportSynthetic",
                        symbolId: "wild",
                        winAmount: 12.5,
                        winningPositions: [],
                        multiplierBreakdown: [],
                        metadata: {stakeEngineImportSynthetic: true},
                    },
                ],
                // Only ever partial for a reconstructed round -- Stake Engine's own export format never
                // preserved RNG/reel-stop data, so an import's debug bag (when a caller attaches one at
                // all) can't carry the same fields a live-played round's debug would.
                debug: {source: "stake-engine-import"},
            }),
        );
        const {getByText, getAllByText, queryByText} = renderWithMantine(
            <RoundArtifactInspector artifact={artifact} stateBefore={undefined} stateAfter={undefined} />,
        );

        expect(getByText("aggregate")).toBeTruthy();
        expect(getByText("unavailable — reconstructed from an imported round, per-position detail wasn't preserved")).toBeTruthy();
        expect(getByText("Debug data")).toBeTruthy();
        expect(getByText("game-provided, may include RNG/reel-stop data")).toBeTruthy();
        // Both the "Debug data" CodeBlock and the "Full artifact" CodeBlock at the bottom of Advanced
        // details legitimately contain this same substring (the latter dumps the whole artifact,
        // debug field included) -- getAllByText (not getByText) so that expected duplication doesn't
        // itself throw.
        expect(getAllByText(/"source": "stake-engine-import"/).length).toBeGreaterThan(0);
        expect(getByText("State snapshot unavailable for this game/session type.")).toBeTruthy();
        expect(queryByText("State before")).toBeNull();
    });

    it("renders an incomplete debug payload (missing conventional RNG/reel-stop fields) as-is instead of hiding the section or crashing", () => {
        const artifact = describeRoundArtifact(artifactFor({debug: {}}));
        const {getByText} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);

        expect(getByText("Debug data")).toBeTruthy();
        expect(getByText("game-provided, may include RNG/reel-stop data")).toBeTruthy();
    });
});

// P4-POLISH-12: every named "round we can inspect" surface (Replay's recorded/recreated/simulation-sampled
// rounds, Session Spin, an Outcome Source draw) must present the exact same round the exact same way --
// same screen orientation, same win/position table, same collapsed-by-default Advanced details -- rather
// than each surface growing its own bespoke rendering of the same underlying RoundArtifact shape. Replay
// already renders directly through RoundArtifactInspector (see ReplayTab.tsx); these guard the other
// consumers actually delegate to it too, instead of drifting back to a page-local clone.
describe("Cross-surface round presentation parity", () => {
    function sessionWithArtifact(artifact: RoundArtifactJson, overrides: Partial<StudioRuntimeSessionView> = {}): StudioRuntimeSessionView {
        return {
            sessionId: "sess-1",
            game: GAME,
            credits: 1005,
            bet: 5,
            win: 12.5,
            debug: {artifact, stateBefore: {phase: "base"}, stateAfter: {phase: "base"}},
            ...overrides,
        };
    }

    function winningArtifact(): RoundArtifactJson {
        return artifactFor({
            stake: 5,
            totalWin: 12.5,
            payoutMultiplier: 2.5,
            steps: [
                {
                    index: 0,
                    screen: [["R0P0", "R0P1", "R0P2"]],
                    totalWin: 12.5,
                    wins: [
                        {type: "line", id: "w1", symbolId: "cherry", winAmount: 12.5, winningPositions: [[0, 0], [1, 0]], multiplierBreakdown: [], metadata: {}},
                    ],
                },
            ],
            wins: [{type: "line", id: "w1", symbolId: "cherry", winAmount: 12.5, winningPositions: [[0, 0], [1, 0]], multiplierBreakdown: [], metadata: {}}],
        });
    }

    it("RoundSummary keeps the player result primary and the full RoundArtifactInspector expandable", () => {
        const artifact = winningArtifact();

        const direct = renderWithMantine(<RoundArtifactInspector artifact={describeRoundArtifact(artifact)} credits={1005} />);
        const viaSummary = renderWithMantine(<RoundSummary session={sessionWithArtifact(artifact)} />);

        expect(within(direct.container).getByText("R0P0")).toBeTruthy();
        expect(within(direct.container).getByText("cherry")).toBeTruthy();
        expect(within(direct.container).getByText("12.50 (2.50x stake)")).toBeTruthy();
        expect(within(direct.container).getByText("2")).toBeTruthy();

        // Session Play puts the screen, balance and actual win before forensic data.  The artifact
        // inspector is not mounted until the reader explicitly opens it, so it cannot duplicate the
        // primary grid or make provenance/JSON the first thing a player sees.
        expect(within(viaSummary.container).getByText("R0P0")).toBeTruthy();
        expect(within(viaSummary.container).getByRole("button", {name: "Line: w1, win: 12.5"})).toBeTruthy();
        expect(within(viaSummary.container).getByText("Inspect round artifact")).toBeTruthy();
        expect(within(viaSummary.container).queryByText("Full artifact")).toBeNull();
    });

    it("RoundSummary falls back to the flat balance/bet/win summary -- never a crash -- when this round's session captured no artifact (debug mode off, or a non-video-slot session)", () => {
        const {getByText, queryByText} = renderWithMantine(
            <RoundSummary session={{sessionId: "sess-1", game: GAME, credits: 1005, bet: 5, win: 15, screen: [["cherry", "lemon"]]}} />,
        );

        expect(getByText(/You won 15\.00/)).toBeTruthy();
        // None of RoundArtifactInspector's own artifact-only markup (a wins table, a step navigator) is
        // reachable without an artifact -- confirms this genuinely took the flat fallback branch, not a
        // RoundArtifactInspector render of some default/empty artifact.
        expect(queryByText("Positions")).toBeNull();
    });

    // Even a non-artifact round (no wins/positions data at all) still has a screen -- it must render
    // through the same GameScreenView every artifact-backed round renders through, not a page-local
    // ScreenTable clone, so a screen orientation fix (or a highlighting change) only ever has to be made
    // in one place.
    it("RoundSummary's non-artifact fallback still renders the round's screen through the shared GameScreenView", () => {
        const {getByText} = renderWithMantine(
            <RoundSummary session={{sessionId: "sess-1", game: GAME, credits: 1005, bet: 5, win: 0, screen: [["cherry", "lemon"]]}} />,
        );
        expect(getByText("cherry")).toBeTruthy();
        expect(getByText("lemon")).toBeTruthy();
    });
});

// P5-POLISH-11: GameScreenView now mounts cli/client/player's own canonical DOM functions directly (see
// CanonicalPlayerView's own doc comment) -- the same renderReelsGrid/applyPersistentHighlights/
// renderWinHighlightsList every other consumer of that module (cli/client/main.ts, pokie-examples) mounts,
// not a separate ScreenTable/WinOverlay React re-presentation. A win's own actually-won cells get a
// persistent tint (applyPersistentHighlights); a line win's own full configured payline path is only ever
// traced on hover of its own hover-list entry (renderWinHighlightsList's "line" branch) -- these prove both
// behaviors trace the right (and only the right) cells straight off a line win's own runtime-provided
// data, and that PaytableView's own honest "unavailable" state (never a table re-derived from the round's
// own wins) shows up identically wherever RoundArtifactInspector is the underlying renderer --
// RoundArtifactInspector directly (Replay, Outcome Source) and RoundSummary (Session Spin) alike.
describe("PaylineOverlay / WinningPositionsOverlay / PaytableView (via RoundArtifactInspector)", () => {
    function grid(container: HTMLElement): HTMLElement {
        const found = container.querySelector(".player-grid");
        if (!found) {
            throw new Error("Expected the canonical player grid to render.");
        }
        return found as HTMLElement;
    }

    it("traces a line win's own full payline definition (every reel, straight from its metadata) distinctly from the narrower subset of cells that actually won, on hover of the win's own hover-list entry", () => {
        // A 3-reel line win whose configured payline runs [row 0, row 0, row 0] across all three reels,
        // but only the first two reels actually matched (winningPositions stops short) -- e.g. a
        // wild-assisted run broken by the third reel. Hovering the win's own hover-list entry must still
        // trace all three reels (this win's own full configured path, green for the cells that actually
        // won, grey for the rest of the path); the persistent tint (no hover needed) must only mark the
        // two that actually won.
        const artifact = describeRoundArtifact(
            artifactFor({
                stake: 1,
                totalWin: 5,
                screen: [
                    ["cherry", "R0P1", "R0P2"],
                    ["cherry", "R1P1", "R1P2"],
                    ["lemon", "R2P1", "R2P2"],
                ],
                steps: [
                    {
                        index: 0,
                        screen: [
                            ["cherry", "R0P1", "R0P2"],
                            ["cherry", "R1P1", "R1P2"],
                            ["lemon", "R2P1", "R2P2"],
                        ],
                        totalWin: 5,
                        wins: [
                            {
                                type: "line",
                                id: "w1",
                                symbolId: "cherry",
                                winAmount: 5,
                                winningPositions: [[0, 0], [1, 0]],
                                multiplierBreakdown: [],
                                metadata: {definition: [0, 0, 0]},
                            },
                        ],
                    },
                ],
                wins: [
                    {
                        type: "line",
                        id: "w1",
                        symbolId: "cherry",
                        winAmount: 5,
                        winningPositions: [[0, 0], [1, 0]],
                        multiplierBreakdown: [],
                        metadata: {definition: [0, 0, 0]},
                    },
                ],
            }),
        );
        const {container} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);
        const screenGrid = grid(container);

        // Both matched cells (reel 0 and reel 1, both "cherry") already carry a persistent tint before
        // any hover -- the actual winning subset, never the win's own full configured path.
        const cherryCells = within(screenGrid).getAllByText("cherry");
        expect(cherryCells).toHaveLength(2);
        for (const cherryCell of cherryCells) {
            expect((cherryCell as HTMLElement).style.backgroundColor).not.toBe("");
        }
        const lemonCell = within(screenGrid).getByText("lemon") as HTMLElement;
        expect(lemonCell.style.backgroundColor).toBe("");

        const winButton = within(container).getByRole("button", {name: "Line: w1, win: 5"});
        fireEvent.mouseEnter(winButton);

        // On hover, the win's own full configured path traces across all three reels: green for the
        // cells that actually won, grey for the rest of the path.
        for (const cherryCell of cherryCells) {
            expect((cherryCell as HTMLElement).style.backgroundColor).toBe("rgb(0, 255, 0)");
        }
        expect(lemonCell.style.backgroundColor).toBe("rgb(153, 153, 153)");
        // A cell that isn't on the payline's own row at all (reel 0's own row 1) is untouched.
        expect((within(screenGrid).getByText("R0P1") as HTMLElement).style.backgroundColor).toBe("");

        fireEvent.mouseLeave(winButton);
        // Restored to each cell's own persistent tint on mouseleave -- winning cells stay tinted, the
        // traced-but-not-won lemon cell goes back to untinted.
        for (const cherryCell of cherryCells) {
            expect((cherryCell as HTMLElement).style.backgroundColor).not.toBe("");
        }
        expect(lemonCell.style.backgroundColor).toBe("");
    });

    it("highlights only a ways/cluster/scatter win's own winning positions on hover, never fabricating a payline trace across the rest of the screen", () => {
        const artifact = describeRoundArtifact(stepWithWaysWin());
        const {container} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);
        const screenGrid = grid(container);

        const otherTexts = ["R0P1", "R0P2", "R1P0", "R1P1", "R1P2", "R2P0", "R2P1", "R2P2"];
        for (const text of otherTexts) {
            expect((within(screenGrid).getByText(text) as HTMLElement).style.backgroundColor).toBe("");
        }

        const winButton = within(container).getByRole("button", {name: "Way: cherry, win: 3"});
        fireEvent.mouseEnter(winButton);

        expect((within(screenGrid).getByText("R0P0") as HTMLElement).style.backgroundColor).not.toBe("");
        for (const text of otherTexts) {
            expect((within(screenGrid).getByText(text) as HTMLElement).style.backgroundColor).toBe("");
        }
    });

    function stepWithWaysWin() {
        return artifactFor({
            stake: 1,
            totalWin: 3,
            steps: [
                {
                    index: 0,
                    screen: [
                        ["R0P0", "R0P1", "R0P2"],
                        ["R1P0", "R1P1", "R1P2"],
                        ["R2P0", "R2P1", "R2P2"],
                    ],
                    totalWin: 3,
                    wins: [{type: "ways", id: "w1", symbolId: "cherry", winAmount: 3, winningPositions: [[0, 0]], multiplierBreakdown: [], metadata: {}}],
                },
            ],
            wins: [{type: "ways", id: "w1", symbolId: "cherry", winAmount: 3, winningPositions: [[0, 0]], multiplierBreakdown: [], metadata: {}}],
        });
    }

    it("PaytableView renders its own explicit 'unavailable' state by default -- no current caller has a blueprint's paytable to pass alongside a round artifact", () => {
        const artifact = describeRoundArtifact(artifactFor());
        const {getByText} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);

        expect(getByText(/Paytable unavailable/)).toBeTruthy();
    });

    it("PaytableView renders a real symbol/match-count/payout table when a caller actually supplies one, proving it's a genuine reusable contract and not permanently unavailable", () => {
        const artifact = describeRoundArtifact(artifactFor());
        const {getByText, queryByText} = renderWithMantine(
            <RoundArtifactInspector artifact={artifact} paytable={{cherry: {"3": 5, "4": 10}, lemon: {"3": 2}}} />,
        );

        expect(queryByText(/Paytable unavailable/)).toBeNull();
        const paytable = getByText("cherry").closest("table");
        if (!paytable) {
            throw new Error("Expected the Paytable section to render an ancestor <table>.");
        }
        expect(within(paytable).getByText("5")).toBeTruthy();
        expect(within(paytable).getByText("10")).toBeTruthy();
        expect(within(paytable).getByText("2")).toBeTruthy();
        // lemon has no "4" match count -- rendered as an explicit placeholder, not a blank cell.
        const lemonRow = within(paytable).getByText("lemon").closest("tr");
        if (!lemonRow) {
            throw new Error("Expected lemon's own row.");
        }
        expect(within(lemonRow).getByText("—")).toBeTruthy();
    });

    it("RoundSummary preserves the primary win-hover payline trace without mounting the secondary inspector", () => {
        const artifact = winningArtifactWithDefinition();

        const direct = renderWithMantine(<RoundArtifactInspector artifact={describeRoundArtifact(artifact)} />);
        const viaSummary = renderWithMantine(
            <RoundSummary
                session={{
                    sessionId: "sess-1",
                    game: GAME,
                    credits: 1005,
                    bet: 5,
                    win: 12.5,
                    debug: {artifact, stateBefore: {phase: "base"}, stateAfter: {phase: "base"}},
                }}
            />,
        );

        for (const {container} of [direct, viaSummary]) {
            const screenGrid = container.querySelector(".player-grid") as HTMLElement;
            const cherryCells = within(screenGrid).getAllByText("cherry");
            const winButton = within(container).getByRole("button", {name: "Line: w1, win: 12.5"});
            fireEvent.mouseEnter(winButton);
            // "cherry" wins at both reel 0 and reel 1 -- both on the payline's own traced path.
            for (const cherryCell of cherryCells) {
                expect((cherryCell as HTMLElement).style.backgroundColor).toBe("rgb(0, 255, 0)");
            }
        }
        expect(within(direct.container).getByText(/Paytable unavailable/)).toBeTruthy();
        expect(within(viaSummary.container).getByText("Inspect round artifact")).toBeTruthy();
    });

    function winningArtifactWithDefinition(): RoundArtifactJson {
        return artifactFor({
            stake: 5,
            totalWin: 12.5,
            payoutMultiplier: 2.5,
            screen: [
                ["cherry", "R0P1", "R0P2"],
                ["cherry", "R1P1", "R1P2"],
                ["lemon", "R2P1", "R2P2"],
            ],
            steps: [
                {
                    index: 0,
                    screen: [
                        ["cherry", "R0P1", "R0P2"],
                        ["cherry", "R1P1", "R1P2"],
                        ["lemon", "R2P1", "R2P2"],
                    ],
                    totalWin: 12.5,
                    wins: [
                        {
                            type: "line",
                            id: "w1",
                            symbolId: "cherry",
                            winAmount: 12.5,
                            winningPositions: [[0, 0], [1, 0]],
                            multiplierBreakdown: [],
                            metadata: {definition: [0, 0, 0]},
                        },
                    ],
                },
            ],
            wins: [
                {
                    type: "line",
                    id: "w1",
                    symbolId: "cherry",
                    winAmount: 12.5,
                    winningPositions: [[0, 0], [1, 0]],
                    multiplierBreakdown: [],
                    metadata: {definition: [0, 0, 0]},
                },
            ],
        });
    }
});

// P4-POLISH-12: GameScreenView is the shared "screen, with whatever won on it highlighted" contract
// RoundArtifactInspector renders both the round-level and (when there's more than one step) each step's
// own screen through -- resolved straight from that screen's own wins' winningPositions, covering every
// win shape the win-evaluation pipeline can attribute to specific cells (a single line win, several
// simultaneous wins of different types on the same screen -- e.g. a ways win alongside a scatter win --
// each contributing its own positions to the same overlay).
describe("GameScreenView win-position highlighting (via RoundArtifactInspector)", () => {
    function grid(container: HTMLElement): HTMLElement {
        const found = container.querySelector(".player-grid");
        if (!found) {
            throw new Error("Expected the canonical player grid to render.");
        }
        return found as HTMLElement;
    }

    it("highlights every position across multiple simultaneous wins of different types on the same screen, and leaves non-winning cells alone", () => {
        const artifact = describeRoundArtifact(
            artifactFor({
                stake: 1,
                totalWin: 8,
                payoutMultiplier: 8,
                screen: [
                    ["cherry", "wild", "R0P2"],
                    ["cherry", "scatter", "R1P2"],
                    ["lemon", "scatter", "R2P2"],
                ],
                steps: [
                    {
                        index: 0,
                        screen: [
                            ["cherry", "wild", "R0P2"],
                            ["cherry", "scatter", "R1P2"],
                            ["lemon", "scatter", "R2P2"],
                        ],
                        totalWin: 8,
                        wins: [
                            {type: "ways", id: "w1", symbolId: "cherry", winAmount: 3, winningPositions: [[0, 0], [1, 0]], multiplierBreakdown: [], metadata: {}},
                            {type: "scatter", id: "w2", symbolId: "scatter", winAmount: 5, winningPositions: [[1, 1], [2, 1]], multiplierBreakdown: [], metadata: {}},
                        ],
                    },
                ],
                wins: [
                    {type: "ways", id: "w1", symbolId: "cherry", winAmount: 3, winningPositions: [[0, 0], [1, 0]], multiplierBreakdown: [], metadata: {}},
                    {type: "scatter", id: "w2", symbolId: "scatter", winAmount: 5, winningPositions: [[1, 1], [2, 1]], multiplierBreakdown: [], metadata: {}},
                ],
            }),
        );
        const {container} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);

        // Scoped to the canonical player grid specifically -- "cherry"/"scatter" also appear in the wins
        // table's own Symbol column below, which must never be mistaken for a highlighted screen cell.
        const screenGrid = grid(container);

        // The round-level grid tints every winning cell across both wins (reel 0 row 0, reel 1 row 0
        // from the ways win; reel 1 row 1, reel 2 row 1 from the scatter win) with a persistent
        // highlight -- "cherry" appears at both [0,0] and [1,0] (both winning), so getAllByText covers
        // that ambiguity.
        const cherryCells = within(screenGrid).getAllByText("cherry");
        expect(cherryCells).toHaveLength(2);
        for (const cherryCell of cherryCells) {
            expect((cherryCell as HTMLElement).style.backgroundColor).not.toBe("");
        }
        const scatterCells = within(screenGrid).getAllByText("scatter");
        expect(scatterCells).toHaveLength(2);
        for (const scatterCell of scatterCells) {
            expect((scatterCell as HTMLElement).style.backgroundColor).not.toBe("");
        }
        // ...while a cell no win actually landed on (wild at [0,1], every R#P2 filler cell) stays plain.
        expect((within(screenGrid).getByText("wild") as HTMLElement).style.backgroundColor).toBe("");
        expect((within(screenGrid).getByText("R0P2") as HTMLElement).style.backgroundColor).toBe("");
        expect((within(screenGrid).getByText("R1P2") as HTMLElement).style.backgroundColor).toBe("");
        expect((within(screenGrid).getByText("R2P2") as HTMLElement).style.backgroundColor).toBe("");
    });

    it("highlights nothing on a screen with no wins, rather than marking every cell winning by default", () => {
        const artifact = describeRoundArtifact(artifactFor());
        const {container} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);
        const screenGrid = grid(container);
        for (const text of ["R0P0", "R0P1", "R0P2", "R1P0", "R1P1", "R1P2", "R2P0", "R2P1", "R2P2"]) {
            expect((within(screenGrid).getByText(text) as HTMLElement).style.backgroundColor).toBe("");
        }
    });
});

// FeatureStateView: a step's own featureEvents render as a plain list of event types (unchanged
// behavior), but any event that also carries its own free-form `data` payload (a multiplier/scatter/ways/
// cluster feature's own detail -- shape not standardized across games) surfaces that data too, collapsed
// behind Advanced details rather than silently dropped -- previously nothing on this client ever rendered
// a feature event's own data at all.
describe("FeatureStateView feature event data (via RoundArtifactInspector)", () => {
    it("shows a feature event's own data collapsed by default, and reveals it on toggle", () => {
        const artifact = describeRoundArtifact(
            artifactFor({
                steps: [
                    {
                        index: 0,
                        screen: [["R0P0", "R0P1", "R0P2"]],
                        totalWin: 0,
                        wins: [],
                        featureEvents: [{type: "free-spins-triggered", data: {count: 10, multiplier: 2}}],
                    },
                ],
            }),
        );
        const {getAllByText, getByText} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);

        // Appears twice: once in the plain "Feature events" list, once as the collapsed section's own
        // heading for this event's data.
        expect(getAllByText("free-spins-triggered")).toHaveLength(2);

        // Scoped to FeatureStateView's own section -- the round's "Full artifact" dump at the bottom of
        // Advanced details also happens to contain this same "count": 10 substring, and must not be
        // mistaken for this section's own (still-collapsed) copy.
        const featureSection = getByText("Feature events").closest("div");
        if (!featureSection) {
            throw new Error("Expected the Feature events section to render an ancestor <div>.");
        }
        expect(within(featureSection).queryByText(/"count": 10/)).not.toBeVisible();

        fireEvent.click(within(featureSection).getByText("Show advanced details (feature event data)"));
        expect(within(featureSection).getByText(/"count": 10/)).toBeVisible();
    });

    it("omits the feature event data disclosure entirely when no event in the step carries a data payload", () => {
        const artifact = describeRoundArtifact(
            artifactFor({
                steps: [{index: 0, screen: [["R0P0", "R0P1", "R0P2"]], totalWin: 0, wins: [], featureEvents: [{type: "free-spins-triggered"}]}],
            }),
        );
        const {getByText, queryByText} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);

        expect(getByText("free-spins-triggered")).toBeTruthy();
        expect(queryByText("Show advanced details (feature event data)")).toBeNull();
    });
});
