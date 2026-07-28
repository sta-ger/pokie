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
