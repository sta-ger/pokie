import {MantineProvider} from "@mantine/core";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {GameModelView} from "../../../../../../cli/studio-client/src/components/project/GameModelView";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import type {GameModelProjection, GameModelReels, GamePackageInspectionReport} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";

function renderWithMantine(ui: React.ReactElement, fetchImpl?: FetchLike) {
    return render(
        <StudioApiProvider fetchImpl={fetchImpl}>
            <MantineProvider>{ui}</MantineProvider>
        </StudioApiProvider>,
    );
}

const BASE_SECTIONS: Omit<GameModelProjection, "reels"> = {
    basics: {status: "available", data: {id: "a", name: "A", version: "1.0.0"}},
    layout: {status: "available", data: {reels: 2, rows: 2, winModel: {type: "lines"}, paylineCount: 1}},
    symbols: {status: "available", data: [{id: "A", isWild: true, isScatter: false}]},
    paytable: {status: "available", data: []},
    betsAndModes: {status: "available", data: {availableBets: [], betModes: []}},
    mechanics: {status: "available", data: {}},
};

function projectionWithReels(reels: GameModelReels): GameModelProjection {
    return {...BASE_SECTIONS, reels: {status: "available", data: reels}};
}

const SHARED_WEIGHTS_REELS: GameModelReels = {
    generationMode: "symbolWeights",
    gameWindow: {reels: 1, rows: 2, wrapsAround: true, grid: [[{symbolId: "A", isWild: true, isScatter: false}, {symbolId: "B", isWild: false, isScatter: false}]]},
    reels: [
        {
            reelIndex: 0,
            source: "sample",
            positions: [
                {index: 0, symbolId: "A", isWild: true, isScatter: false, locked: false, stackSize: 1},
                {index: 1, symbolId: "B", isWild: false, isScatter: false, locked: false, stackSize: 1},
                {index: 2, symbolId: "B", isWild: false, isScatter: false, locked: false, stackSize: 1},
                {index: 3, symbolId: "B", isWild: false, isScatter: false, locked: false, stackSize: 1},
            ],
            analysis: {length: 4, symbolCounts: {A: 1, B: 3}, symbolFrequencies: {A: 0.25, B: 0.75}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {A: 1, B: 3}},
        },
    ],
    sharedWeightsSample: {
        weights: {A: 1, B: 3},
        seed: 1,
        sampleLength: 4,
        conversion: {weights: {A: 1, B: 3}, counts: {A: 1, B: 3}, targetProportions: {A: 0.25, B: 0.75}, actualProportions: {A: 0.25, B: 0.75}, deviations: {A: 0, B: 0}},
    },
};

describe("GameModelView -- Reels", () => {
    it("Game window renders reel columns × rows at stop 0 with wild/scatter cells highlighted, straight off the projection's own grid", () => {
        const reels: GameModelReels = {
            generationMode: "reelStrips",
            gameWindow: {
                reels: 2,
                rows: 2,
                wrapsAround: true,
                grid: [
                    [
                        {symbolId: "A", isWild: true, isScatter: false},
                        {symbolId: "B", isWild: false, isScatter: false},
                    ],
                    [
                        {symbolId: "S", isWild: false, isScatter: true},
                        {symbolId: "B", isWild: false, isScatter: false},
                    ],
                ],
            },
            reels: [
                {
                    reelIndex: 0,
                    source: "literal",
                    positions: [
                        {index: 0, symbolId: "A", isWild: true, isScatter: false, locked: false, stackSize: 1},
                        {index: 1, symbolId: "B", isWild: false, isScatter: false, locked: false, stackSize: 1},
                    ],
                    analysis: {length: 2, symbolCounts: {A: 1, B: 1}, symbolFrequencies: {A: 0.5, B: 0.5}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {A: 1, B: 1}},
                },
                {
                    reelIndex: 1,
                    source: "literal",
                    positions: [
                        {index: 0, symbolId: "S", isWild: false, isScatter: true, locked: false, stackSize: 1},
                        {index: 1, symbolId: "B", isWild: false, isScatter: false, locked: false, stackSize: 1},
                    ],
                    analysis: {length: 2, symbolCounts: {S: 1, B: 1}, symbolFrequencies: {S: 0.5, B: 0.5}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {S: 1, B: 1}},
                },
            ],
        };

        renderWithMantine(<GameModelView projection={projectionWithReels(reels)} canEdit={false} />);

        expect(screen.getByRole("tab", {name: "Game window"})).toHaveAttribute("aria-selected", "true");
        const panel = within(screen.getByRole("tabpanel"));
        expect(panel.getByText(/2 reel column\(s\) × 2 row\(s\)/)).toBeInTheDocument();
        // Every symbol on the window's own grid, including both wild ("A") and scatter ("S") cells.
        expect(panel.getByText("A")).toBeInTheDocument();
        expect(panel.getByText("S")).toBeInTheDocument();
        expect(panel.getAllByText("B")).toHaveLength(2);
    });

    it("Full strips exposes each reel's own index/circularity/stacks/specials/locks, and Analysis exposes counts/shares/distances/windows", async () => {
        const user = userEvent.setup();
        const reels: GameModelReels = {
            generationMode: "reelStripGeneration",
            gameWindow: {reels: 1, rows: 3, wrapsAround: true, grid: [[{symbolId: "B", isWild: false, isScatter: false}, {symbolId: "B", isWild: false, isScatter: false}, {symbolId: "A", isWild: true, isScatter: false}]]},
            reels: [
                {
                    reelIndex: 0,
                    source: "generated",
                    positions: [
                        {index: 0, symbolId: "B", isWild: false, isScatter: false, locked: false, stackSize: 2},
                        {index: 1, symbolId: "B", isWild: false, isScatter: false, locked: false, stackSize: 2},
                        {index: 2, symbolId: "A", isWild: true, isScatter: false, locked: true, stackSize: 1},
                    ],
                    analysis: {
                        length: 3,
                        symbolCounts: {B: 2, A: 1},
                        symbolFrequencies: {B: 0.667, A: 0.333},
                        minimumCircularDistances: {B: 2},
                        maximumCircularDistances: {B: 2},
                        maximumConsecutiveOccurrences: {B: 2, A: 1},
                    },
                    generationDiagnostics: [{attempt: 1, accepted: true, violations: []}],
                },
            ],
        };

        renderWithMantine(<GameModelView projection={projectionWithReels(reels)} canEdit={false} />);

        await user.click(screen.getByRole("tab", {name: "Full strips"}));
        const fullStripsPanel = within(screen.getByRole("tabpanel"));
        expect(fullStripsPanel.getByText("0")).toBeInTheDocument();
        expect(fullStripsPanel.getByText("2")).toBeInTheDocument();
        expect(fullStripsPanel.getByText("Wild")).toBeInTheDocument();
        expect(fullStripsPanel.getAllByText("2×")).toHaveLength(2);
        expect(fullStripsPanel.getAllByText("Locked")).toHaveLength(2);
        expect(fullStripsPanel.getByText(/circular \(wraps from the last position back to index 0\)/)).toBeInTheDocument();

        await user.click(screen.getByRole("tab", {name: "Analysis"}));
        const analysisPanel = within(screen.getByRole("tabpanel"));
        expect(analysisPanel.getByText("3 possible stop position(s) (this reel's own length).")).toBeInTheDocument();
        expect(analysisPanel.getByText("0.667")).toBeInTheDocument();
        expect(analysisPanel.getByText(/Attempt 1/)).toBeInTheDocument();
    });

    it("reports an unresolved generated reel's own failure reason on Full strips, instead of a fabricated strip", async () => {
        const user = userEvent.setup();
        const reels: GameModelReels = {
            generationMode: "reelStripGeneration",
            gameWindow: {reels: 1, rows: 3, wrapsAround: true, grid: [[]]},
            reels: [{reelIndex: 0, source: "generated", reason: "Could not satisfy every constraint after 200 attempt(s).", generationDiagnostics: [{attempt: 1, accepted: false, violations: [{constraintId: "x", message: "too many"}]}]}],
        };

        renderWithMantine(<GameModelView projection={projectionWithReels(reels)} canEdit={false} />);

        await user.click(screen.getByRole("tab", {name: "Full strips"}));
        expect(within(screen.getByRole("tabpanel")).getByText(/Unresolved — Could not satisfy every constraint/)).toBeInTheDocument();
    });

    it("never shows a fake fixed strip for symbolWeights/default -- labels every reel a sample, and Analysis shows the real weights-to-counts conversion", async () => {
        const user = userEvent.setup();

        renderWithMantine(<GameModelView projection={projectionWithReels(SHARED_WEIGHTS_REELS)} canEdit={false} />);

        expect(screen.getByText(/no single fixed strip/)).toBeInTheDocument();

        await user.click(screen.getByRole("tab", {name: "Full strips"}));
        expect(within(screen.getByRole("tabpanel")).getByText(/Sample only/)).toBeInTheDocument();

        await user.click(screen.getByRole("tab", {name: "Analysis"}));
        const analysisPanel = within(screen.getByRole("tabpanel"));
        expect(analysisPanel.getByText("Shared weights → counts conversion")).toBeInTheDocument();
        expect(analysisPanel.getByText(/Reproducible sample only \(seed 1, sample length 4\)/)).toBeInTheDocument();
    });

    it("shows an empty state instead of a broken table when no reels are configured", () => {
        const reels: GameModelReels = {
            generationMode: "default",
            gameWindow: {reels: 0, rows: 0, wrapsAround: true, grid: []},
            reels: [],
        };

        renderWithMantine(<GameModelView projection={projectionWithReels(reels)} canEdit={false} />);

        expect(within(screen.getByRole("tabpanel")).getByText("No reels configured yet.")).toBeInTheDocument();
    });
});

// P3-POLISH-18 (review fix): symbolWeights/default previously showed the shared-weights sample as a
// read-only diagnostic table with no way to actually act on it. This action freezes that same reproducible
// sample into the project's own literal, editable reelStrips, through the exact same canonical
// load -> apply-with-expectedHash path MechanicsEditorTab's own Save changes already uses -- never a
// frontend-synthesized strip (see StudioBlueprintService.convertSharedWeightsToReelStrips's own doc
// comment for where the actual conversion math runs).
describe("GameModelView -- shared-weights conversion action", () => {
    const SOURCE_PATH = "/games/a-source/blueprint.json";
    const BLUEPRINT = {manifest: {id: "a", name: "A", version: "1.0.0"}, reels: 1, rows: 2, symbols: ["A", "B"], wilds: ["A"], symbolWeights: {A: 1, B: 3}};
    const BLUEPRINT_HASH = "sha256:loaded-blueprint";
    const INSPECT_REPORT: GamePackageInspectionReport = {
        packageRoot: "/games/a",
        valid: true,
        generated: true,
        buildInfo: {
            schemaVersion: 1,
            generatedBy: "pokie build",
            pokieVersion: "1.3.0",
            generatedAt: "2026-01-01T00:00:00.000Z",
            blueprintHash: "sha256:blueprint",
            source: SOURCE_PATH,
            game: {id: "a", name: "A", version: "1.0.0"},
        },
    };
    const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
        "/api/project/inspect": () => ({ok: true, status: 200, body: INSPECT_REPORT}),
        "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: SOURCE_PATH, blueprint: BLUEPRINT, blueprintHash: BLUEPRINT_HASH}}),
    };

    it("only offers the action for symbolWeights/default Reels, and only when this project can be edited", () => {
        const {fetchImpl} = createRoutedFakeFetch({...BASE_ROUTES});
        const {rerender} = renderWithMantine(<GameModelView projection={projectionWithReels(SHARED_WEIGHTS_REELS)} canEdit={false} />, fetchImpl);
        expect(screen.queryByRole("button", {name: "Convert to editable per-reel strips"})).not.toBeInTheDocument();

        rerender(
            <StudioApiProvider fetchImpl={fetchImpl}>
                <MantineProvider>
                    <GameModelView projection={projectionWithReels({...SHARED_WEIGHTS_REELS, generationMode: "reelStrips"})} canEdit={true} />
                </MantineProvider>
            </StudioApiProvider>,
        );
        expect(screen.queryByRole("button", {name: "Convert to editable per-reel strips"})).not.toBeInTheDocument();

        rerender(
            <StudioApiProvider fetchImpl={fetchImpl}>
                <MantineProvider>
                    <GameModelView projection={projectionWithReels(SHARED_WEIGHTS_REELS)} canEdit={true} />
                </MantineProvider>
            </StudioApiProvider>,
        );
        expect(screen.getByRole("button", {name: "Convert to editable per-reel strips"})).toBeInTheDocument();
    });

    it("converts via the canonical load -> apply-with-expectedHash path -- reelStrips from the core conversion, symbolWeights removed, hash forwarded, and the caller's projection reloaded", async () => {
        const user = userEvent.setup();
        const onConverted = jest.fn();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/shared-weights-conversion": () => ({ok: true, status: 200, body: {status: "ok", reelStrips: [["A", "B", "B", "B"]]}}),
            "/api/project/blueprint/apply": () => ({ok: true, status: 200, body: {status: "ok", blueprintHash: "sha256:applied", warnings: []}}),
        });

        renderWithMantine(<GameModelView projection={projectionWithReels(SHARED_WEIGHTS_REELS)} canEdit={true} onConverted={onConverted} />, fetchImpl);

        await user.click(screen.getByRole("button", {name: "Convert to editable per-reel strips"}));

        expect(await screen.findByText(/Converted — this project's reels are now literal, editable strips/)).toBeInTheDocument();
        expect(onConverted).toHaveBeenCalledTimes(1);

        const applyCalls = calls.filter((call) => call.url === "/api/project/blueprint/apply");
        expect(applyCalls).toHaveLength(1);
        const appliedBody = JSON.parse(applyCalls[0].init?.body ?? "{}");
        expect(appliedBody.expectedHash).toBe(BLUEPRINT_HASH);
        expect(appliedBody.blueprint.reelStrips).toEqual([["A", "B", "B", "B"]]);
        expect(appliedBody.blueprint.symbolWeights).toBeUndefined();
    });

    it("reports a failed conversion diagnostically and never applies a partial mutation", async () => {
        const user = userEvent.setup();
        const onConverted = jest.fn();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/shared-weights-conversion": () => ({
                ok: true,
                status: 200,
                body: {status: "unsupported", error: 'This blueprint already configures "reelStrips" or "reelStripGeneration" -- there is no shared-weights sample to convert.'},
            }),
        });

        renderWithMantine(<GameModelView projection={projectionWithReels(SHARED_WEIGHTS_REELS)} canEdit={true} onConverted={onConverted} />, fetchImpl);

        await user.click(screen.getByRole("button", {name: "Convert to editable per-reel strips"}));

        expect(await screen.findByText(/there is no shared-weights sample to convert/)).toBeInTheDocument();
        expect(onConverted).not.toHaveBeenCalled();
        // The conversion itself failed diagnostically before ever reaching the project mutation path --
        // apply is never even attempted, so there is no risk of a partial write.
        expect(calls.filter((call) => call.url === "/api/project/blueprint/apply")).toHaveLength(0);
    });

    it("reports a since-changed source conflict from the apply step diagnostically, without applying anything", async () => {
        const user = userEvent.setup();
        const onConverted = jest.fn();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/home/blueprints/shared-weights-conversion": () => ({ok: true, status: 200, body: {status: "ok", reelStrips: [["A", "B", "B", "B"]]}}),
            "/api/project/blueprint/apply": () => ({ok: true, status: 409, body: {status: "conflict", currentHash: "sha256:changed-on-disk"}}),
        });

        renderWithMantine(<GameModelView projection={projectionWithReels(SHARED_WEIGHTS_REELS)} canEdit={true} onConverted={onConverted} />, fetchImpl);

        await user.click(screen.getByRole("button", {name: "Convert to editable per-reel strips"}));

        expect(await screen.findByText(/changed on disk since it was loaded here/)).toBeInTheDocument();
        expect(onConverted).not.toHaveBeenCalled();
    });
});
