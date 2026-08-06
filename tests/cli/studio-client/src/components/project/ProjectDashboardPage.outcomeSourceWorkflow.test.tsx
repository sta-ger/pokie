import {screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};

const DRAWN_WIN = {
    type: "line",
    id: "w1",
    symbolId: "cherry",
    winAmount: 5,
    winningPositions: [[0, 0], [1, 0]],
    multiplierBreakdown: [],
    metadata: {},
};

// A full RoundArtifact -- no `hash` (a drawn outcome carries no content hash of its own, see
// RoundArtifactDisplayView's own doc comment) -- big enough to exercise RoundArtifactInspector's own
// screen/wins presentation, the same shared component Replay and Session Spin render an artifact through.
const DRAWN_ARTIFACT = {
    schemaVersion: 1,
    roundId: "base-lib:2",
    provenance: {game: GAME, pokieVersion: "1.0.0"},
    betMode: "base",
    stake: 1,
    totalWin: 5,
    payoutMultiplier: 5,
    screen: [["cherry", "lemon"], ["cherry", "bar"]],
    steps: [{index: 0, screen: [["cherry", "lemon"], ["cherry", "bar"]], totalWin: 5, wins: [DRAWN_WIN]}],
    wins: [DRAWN_WIN],
};

const NATIVE_LIBRARY_CONTEXT = {
    status: "outcome-source",
    projectRoot: "/libraries/base",
    project: {type: "outcomeLibrary", rootPath: "/libraries/base", capabilities: ["outcomeLibrary.read", "outcomeSource.read", "outcomeSource.sample"], provenance: "test fixture"},
    report: {
        rootPath: "/libraries/base",
        descriptor: {kind: "native", streaming: true, limitations: ["never re-derives the game model that produced these outcomes"]},
        issues: [],
        modes: [
            {
                modeName: "base",
                analysis: {totalWeight: 1000, rtp: 0.955, hitFrequency: 0.25, zeroWinFrequency: 0.75, variance: 0.1, standardDeviation: 0.3162, maxWin: 500, maxWinProbability: 0.001, payoutDistribution: []},
            },
        ],
    },
};

const STAKE_EXPORT_CONTEXT = {
    status: "outcome-source",
    projectRoot: "/stake/base",
    project: {type: "stakeAdapter", rootPath: "/stake/base", capabilities: ["stakeAdapter.exchange", "outcomeSource.read"], provenance: "test fixture"},
    report: {
        rootPath: "/stake/base",
        descriptor: {kind: "stakeEngine", streaming: false, limitations: ["reads its full outcome set up front rather than streaming it"]},
        issues: [],
        modes: [
            {
                modeName: "base",
                analysis: {totalWeight: 1000, rtp: 0.92, hitFrequency: 0.3, zeroWinFrequency: 0.7, variance: 0.2, standardDeviation: 0.4472, maxWin: 250, maxWinProbability: 0.002},
            },
        ],
    },
};

// Proves P3-POLISH-21's own Studio presentation: a resolved "outcomeLibrary"/"stakeAdapter" project (see
// loadProjectDashboardContext.ts's own "outcome-source" ProjectDashboardContext status) renders its
// canonical reader's descriptor/limitations/exact analysis directly on the Project Dashboard, and (native
// only) offers a real "Draw an outcome" action routed through POST /api/project/outcome-source/sample --
// the same selector/session/server-backed sampleOutcomeSourceProject() path PreGeneratedSpinCommandHandler
// already uses in production.
describe("ProjectDashboardPage - Outcome Source workflow", () => {
    it("renders a native outcome library's descriptor/limitations/exact analysis and draws an outcome", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: NATIVE_LIBRARY_CONTEXT}),
            "/api/project/outcome-source/sample": () => ({
                ok: true,
                status: 200,
                body: {
                    supported: true,
                    selection: {
                        libraryId: "base-lib",
                        libraryHash: "hash-1234",
                        totalWeight: 1000,
                        outcome: {id: "2", weight: 150, artifact: DRAWN_ARTIFACT},
                    },
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        expect(await screen.findByText("Native Outcome Library")).toBeInTheDocument();
        expect(screen.getByText("streaming reader")).toBeInTheDocument();
        expect(screen.getByText("never re-derives the game model that produced these outcomes")).toBeInTheDocument();
        expect(screen.getByText("95.50%")).toBeInTheDocument();
        expect(screen.getByText("25.00%")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", {name: "Draw an outcome"}));

        const drawn = (await screen.findByText('Drew outcome "2"')).closest(".mantine-Alert-root") as HTMLElement;
        expect(within(drawn).getByText(/weight 150 of 1000/)).toBeInTheDocument();

        // The drawn round itself renders through RoundArtifactInspector -- the same shared component
        // Replay and Session Spin render an artifact through -- not a page-local flat multiplier summary.
        const winsTable = within(drawn).getByText("Positions").closest("table") as HTMLElement;
        expect(within(winsTable).getByText("cherry")).toBeInTheDocument();
        expect(within(winsTable).getByText("5.00 (5.00x stake)")).toBeInTheDocument();
    });

    it("renders a Stake Engine export's own descriptor/limitations/exact analysis with no sample action offered", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: STAKE_EXPORT_CONTEXT}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});

        expect(await screen.findByText("Stake Engine Export")).toBeInTheDocument();
        expect(screen.getByText("reads source fully")).toBeInTheDocument();
        expect(screen.getByText("reads its full outcome set up front rather than streaming it")).toBeInTheDocument();
        expect(screen.getByText("92.00%")).toBeInTheDocument();

        expect(screen.queryByRole("button", {name: "Draw an outcome"})).not.toBeInTheDocument();
    });
});
