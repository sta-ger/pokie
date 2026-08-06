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
    it("renders the round-level ScreenTable so reels are columns and visible rows read across all reels, using the same describeRoundArtifact view-model the Inspect step actually consumes", () => {
        const artifact = describeRoundArtifact(artifactFor());
        const {getByText} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);

        // RoundArtifactInspector also renders its own provenance table, so scope the row/cell query to
        // the specific <table> that owns a screen cell rather than the whole document.
        const screenTable = getByText("R0P0").closest("table");
        if (!screenTable) {
            throw new Error("Expected the round-level ScreenTable to render an ancestor <table>.");
        }
        const rows = within(screenTable).getAllByRole("row");
        expect(rows).toHaveLength(3);
        expect(within(rows[0]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["R0P0", "R1P0", "R2P0"]);
        expect(within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["R0P1", "R1P1", "R2P1"]);
        expect(within(rows[2]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["R0P2", "R1P2", "R2P2"]);
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

    it("RoundSummary (Session Spin) renders a captured round through RoundArtifactInspector, showing the same screen/win/position detail a direct RoundArtifactInspector render of the identical artifact shows", () => {
        const artifact = winningArtifact();

        const direct = renderWithMantine(<RoundArtifactInspector artifact={describeRoundArtifact(artifact)} credits={1005} />);
        const viaSummary = renderWithMantine(<RoundSummary session={sessionWithArtifact(artifact)} />);

        // Each render mounts into the shared document.body, so scope every query to its own container --
        // otherwise a text query bound to either render's own result would ambiguously match both trees
        // at once instead of proving each renders it independently.
        for (const container of [direct.container, viaSummary.container]) {
            expect(within(container).getByText("R0P0")).toBeTruthy();
            expect(within(container).getByText("cherry")).toBeTruthy();
            expect(within(container).getByText("12.50 (2.50x stake)")).toBeTruthy();
            expect(within(container).getByText("2")).toBeTruthy();
        }
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

// P4-POLISH-12: WinOverlay (composing WinningPositionsOverlay and PaylineOverlay onto GameScreenView's own
// shared grid) and PaytableView are the shared common presentation contracts every round-inspection
// surface renders a step's payline path and payout table through -- these prove both overlays trace the
// right (and only the right) cells straight off a line win's own runtime-provided data, and that
// PaytableView's own honest "unavailable" state (never a table re-derived from the round's own wins) shows
// up identically wherever RoundArtifactInspector is the underlying renderer -- RoundArtifactInspector
// directly (Replay, Outcome Source) and RoundSummary (Session Spin) alike.
describe("PaylineOverlay / WinningPositionsOverlay / PaytableView (via RoundArtifactInspector)", () => {
    function cell(container: HTMLElement, text: string): HTMLElement {
        const found = within(container).getByText(text);
        const td = found.closest("td");
        if (!td) {
            throw new Error(`Expected "${text}" to render inside a <td>.`);
        }
        return td;
    }

    it("traces a line win's own full payline definition (every reel, straight from its metadata) distinctly from the narrower subset of cells that actually won", () => {
        // A 3-reel line win whose configured payline runs [row 0, row 0, row 0] across all three reels,
        // but only the first two reels actually matched (winningPositions stops short) -- e.g. a
        // wild-assisted run broken by the third reel. The payline overlay must still trace all three
        // reels (this win's own full configured path); the winning-position overlay must only mark the
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
        const screenTable = within(container).getByText("R0P2").closest("table");
        if (!screenTable) {
            throw new Error("Expected the round-level screen table to render an ancestor <table>.");
        }

        // Both matched cells (reel 0 and reel 1, both "cherry") are on the payline's own path too --
        // winning implies on-payline here.
        const cherryCells = within(screenTable).getAllByText("cherry").map((textNode) => textNode.closest("td"));
        expect(cherryCells).toHaveLength(2);
        for (const cherryCell of cherryCells) {
            expect(cherryCell).toHaveAttribute("data-winning", "true");
            expect(cherryCell).toHaveAttribute("data-payline", "true");
        }
        // The third reel's own row-0 cell is part of the full definition but never won -- traced, not
        // highlighted.
        expect(cell(screenTable, "lemon")).toHaveAttribute("data-payline", "true");
        expect(cell(screenTable, "lemon")).not.toHaveAttribute("data-winning");
        // A cell that isn't on the payline's own row at all (reel 0's own row 1) is neither.
        expect(cell(screenTable, "R0P1")).not.toHaveAttribute("data-payline");
        expect(cell(screenTable, "R0P1")).not.toHaveAttribute("data-winning");
    });

    it("traces no payline path for a win type that never carries a line definition (ways/cluster/scatter), rather than fabricating one", () => {
        const artifact = describeRoundArtifact(
            stepWithWaysWin(),
        );
        const {container} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);
        const screenTable = within(container).getByText("R0P2").closest("table");
        if (!screenTable) {
            throw new Error("Expected the round-level screen table to render an ancestor <table>.");
        }
        for (const text of ["R0P0", "R0P1", "R0P2", "R1P0", "R1P1", "R1P2", "R2P0", "R2P1", "R2P2"]) {
            expect(cell(screenTable, text)).not.toHaveAttribute("data-payline");
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

    it("RoundSummary (Session Spin) shows the same payline overlay and paytable-unavailable state a direct RoundArtifactInspector render of the identical artifact shows", () => {
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

        for (const container of [direct.container, viaSummary.container]) {
            const screenTable = within(container).getByText("R0P2").closest("table") as HTMLElement;
            // "cherry" wins at both reel 0 and reel 1 -- both on the payline's own traced path.
            for (const cherryCell of within(screenTable).getAllByText("cherry")) {
                expect(cherryCell.closest("td")).toHaveAttribute("data-payline", "true");
            }
            expect(within(container).getByText(/Paytable unavailable/)).toBeTruthy();
        }
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
    function cell(container: HTMLElement, text: string): HTMLElement {
        const found = within(container).getByText(text);
        const td = found.closest("td");
        if (!td) {
            throw new Error(`Expected "${text}" to render inside a <td>.`);
        }
        return td;
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

        // Scoped to the screen table specifically -- "cherry"/"scatter" also appear in the wins table's
        // own Symbol column below, which must never be mistaken for a highlighted screen cell.
        const screenTable = within(container).getByText("R0P2").closest("table");
        if (!screenTable) {
            throw new Error("Expected the round-level screen table to render an ancestor <table>.");
        }

        // The round-level screen table renders every winning cell across both wins (reel 0 row 0, reel 1
        // row 0 from the ways win; reel 1 row 1, reel 2 row 1 from the scatter win) as highlighted --
        // "cherry" appears at both [0,0] and [1,0] (both winning), so getAllByText covers that ambiguity.
        const cherryCells = within(screenTable).getAllByText("cherry");
        expect(cherryCells).toHaveLength(2);
        for (const cherryCell of cherryCells) {
            expect(cherryCell.closest("td")).toHaveAttribute("data-winning", "true");
        }
        const scatterCells = within(screenTable).getAllByText("scatter");
        expect(scatterCells).toHaveLength(2);
        for (const scatterCell of scatterCells) {
            expect(scatterCell.closest("td")).toHaveAttribute("data-winning", "true");
        }
        // ...while a cell no win actually landed on (wild at [0,1], every R#P2 filler cell) stays plain.
        expect(cell(screenTable, "wild")).not.toHaveAttribute("data-winning");
        expect(cell(screenTable, "R0P2")).not.toHaveAttribute("data-winning");
        expect(cell(screenTable, "R1P2")).not.toHaveAttribute("data-winning");
        expect(cell(screenTable, "R2P2")).not.toHaveAttribute("data-winning");
    });

    it("highlights nothing on a screen with no wins, rather than marking every cell winning by default", () => {
        const artifact = describeRoundArtifact(artifactFor());
        const {container} = renderWithMantine(<RoundArtifactInspector artifact={artifact} />);
        for (const text of ["R0P0", "R0P1", "R0P2", "R1P0", "R1P1", "R1P2", "R2P0", "R2P1", "R2P2"]) {
            expect(cell(container, text)).not.toHaveAttribute("data-winning");
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
