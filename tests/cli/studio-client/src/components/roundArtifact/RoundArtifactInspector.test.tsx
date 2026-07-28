import {MantineProvider} from "@mantine/core";
import {render, within} from "@testing-library/react";
import type {RoundArtifact, RoundArtifactJson} from "../../../../../../cli/studio-client/src/api/types";
import {RoundArtifactInspector} from "../../../../../../cli/studio-client/src/components/common/RoundArtifactInspector";
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
});
