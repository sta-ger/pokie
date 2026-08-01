import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {
    StudioOutcomeLibraryCompareView,
    StudioOutcomeLibraryGenerateEstimateView,
    StudioOutcomeLibraryGenerateResultView,
    StudioOutcomeLibrarySelectView,
    WeightedOutcomeLibraryAnalysis,
} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    // Fetched once on mount by the Registry panel (see OutcomeLibrariesTab's own fetchRegistry) --
    // registered here so every test in this file gets a deterministic "missing" answer instead of a
    // fake-route error, unless a test overrides it.
    "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}}),
};

// Mantine's Stepper.Step packs the step icon + label + description into one <button> -- same convention
// every other Stepper-driving workflow test in this suite uses (see e.g.
// ProjectDashboardPage.deploymentWorkflow.test.tsx's own stepperStep()).
function stepperStep(label: string, description: string): RegExp {
    return new RegExp(`${label}.*${description}`);
}

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve({ok: status < 400, status, json: () => Promise.resolve(body)});
}

const ANALYSIS_A: WeightedOutcomeLibraryAnalysis = {
    totalWeight: 100,
    rtp: 0.95,
    hitFrequency: 0.24,
    zeroWinFrequency: 0.76,
    variance: 12,
    standardDeviation: Math.sqrt(12),
    maxWin: 500,
    maxWinProbability: 0.001,
    payoutDistribution: [
        {payoutMultiplier: 0, probability: 0.76},
        {payoutMultiplier: 2, probability: 0.2},
        {payoutMultiplier: 500, probability: 0.04},
    ],
};

const ANALYSIS_B: WeightedOutcomeLibraryAnalysis = {...ANALYSIS_A, rtp: 0.97, hitFrequency: 0.26};

function okSelectView(libraryId: string, analysis: WeightedOutcomeLibraryAnalysis = ANALYSIS_A): StudioOutcomeLibrarySelectView {
    return {
        status: "ok",
        provenance: {source: "json", libraryId, outcomeCount: 3, hash: `sha256:${libraryId}`},
        errors: [],
        warnings: [],
        analysis,
        featureBreakdown: {betModes: [{key: "base", weightedFrequency: 1, outcomeCount: 3}], featureEvents: []},
        sampleOutcomes: [{id: "0000", weight: 76, totalWin: 0, payoutMultiplier: 0}],
        sampleTruncated: false,
    };
}

// The tab now opens on its new primary Generate step (see OutcomeLibrariesTab's own Stepper) -- every
// test in this file exercises the pre-existing Select/import -> ... flow, so this jumps straight past
// Generate the same way a user clicking the Stepper's own "Select/import" step would.
async function goToOutcomeLibrariesTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Outcome Libraries"}));
    await user.click(await screen.findByRole("button", {name: stepperStep("Select/import", "Choose a library")}));
    await screen.findByLabelText("Library JSON path");
}

describe("ProjectDashboardPage - Outcome Libraries workflow", () => {
    it("loads a JSON library and shows RTP/hit rate/payout distribution after Continue to Inspect", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/select": () => ({ok: true, status: 200, body: okSelectView("lib-a")}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);

        await user.type(screen.getByLabelText("Library JSON path"), "./libs/base.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));

        expect(await screen.findByText("Loaded successfully")).toBeInTheDocument();
        expect(screen.getByText(/library "lib-a"/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to Inspect"}));

        expect(await screen.findByText("95.00%")).toBeInTheDocument();
        expect(screen.getByText("24.00%")).toBeInTheDocument();
    });

    it("shows a clear invalid-library state and never offers Continue to Inspect", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/select": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "invalid",
                    errors: [{code: "weighted-outcome-library-empty", severity: "error", message: "The library has no outcomes."}],
                    warnings: [],
                } as StudioOutcomeLibrarySelectView,
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);

        await user.type(screen.getByLabelText("Library JSON path"), "./libs/bad.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));

        expect(await screen.findByText("This library is invalid")).toBeInTheDocument();
        expect(screen.getByText(/The library has no outcomes\./)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Inspect"})).not.toBeInTheDocument();
    });

    it("wraps a long, unbroken feature/bet-mode key instead of letting it force horizontal page scroll", async () => {
        const user = userEvent.setup();
        const longKey = "extremely-long-bet-mode-identifier-with-no-natural-break-points-anywhere-in-it";
        const view = okSelectView("lib-a");
        view.featureBreakdown = {betModes: [{key: longKey, weightedFrequency: 1, outcomeCount: 3}], featureEvents: []};
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/select": () => ({ok: true, status: 200, body: view}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);

        await user.type(screen.getByLabelText("Library JSON path"), "./libs/base.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Inspect"}));

        const keyCell = await screen.findByText(longKey);
        expect(keyCell.style.overflowWrap).toBe("anywhere");
    });

    it("compares two libraries and shows the RTP/hit-rate diff", async () => {
        const user = userEvent.setup();
        const compareView: StudioOutcomeLibraryCompareView = {
            left: okSelectView("lib-a"),
            right: okSelectView("lib-b", ANALYSIS_B),
            leftSnapshotStale: false,
            diff: {
                rtp: {left: 0.95, right: 0.97, delta: 0.02, percentDelta: (0.02 / 0.95) * 100},
                hitFrequency: {left: 0.24, right: 0.26, delta: 0.02, percentDelta: (0.02 / 0.24) * 100},
                variance: {left: 12, right: 12, delta: 0, percentDelta: 0},
                standardDeviation: {left: Math.sqrt(12), right: Math.sqrt(12), delta: 0, percentDelta: 0},
                maxWin: {left: 500, right: 500, delta: 0, percentDelta: 0},
                payoutDistribution: [],
                warnings: ["RTP changed by +2.00 percentage points (95.00% -> 97.00%)"],
            },
        };
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/select": () => ({ok: true, status: 200, body: okSelectView("lib-a")}),
            "/api/project/outcome-libraries/compare": () => ({ok: true, status: 200, body: compareView}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);
        await user.type(screen.getByLabelText("Library JSON path"), "./libs/base.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));
        await screen.findByText("Loaded successfully");
        await user.click(screen.getByRole("button", {name: "Continue to Inspect"}));
        await user.click(screen.getByRole("button", {name: "Continue to Compare or use"}));

        await user.type(screen.getByLabelText("Library JSON path"), "./libs/other.json");
        await user.click(screen.getByRole("button", {name: "Compare"}));

        expect(await screen.findByText("95.00%")).toBeInTheDocument();
        expect(screen.getByText("97.00%")).toBeInTheDocument();
        expect(screen.getByText(/RTP changed by \+2\.00 percentage points/)).toBeInTheDocument();
    });

    it("marks a completed Compare as Outdated once the comparison selector changes, and clears it on a fresh Compare run", async () => {
        const user = userEvent.setup();
        const compareView: StudioOutcomeLibraryCompareView = {
            left: okSelectView("lib-a"),
            right: okSelectView("lib-b", ANALYSIS_B),
            leftSnapshotStale: false,
            diff: {
                rtp: {left: 0.95, right: 0.97, delta: 0.02, percentDelta: (0.02 / 0.95) * 100},
                hitFrequency: {left: 0.24, right: 0.26, delta: 0.02, percentDelta: (0.02 / 0.24) * 100},
                variance: {left: 12, right: 12, delta: 0, percentDelta: 0},
                standardDeviation: {left: Math.sqrt(12), right: Math.sqrt(12), delta: 0, percentDelta: 0},
                maxWin: {left: 500, right: 500, delta: 0, percentDelta: 0},
                payoutDistribution: [],
                warnings: [],
            },
        };
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/select": () => ({ok: true, status: 200, body: okSelectView("lib-a")}),
            "/api/project/outcome-libraries/compare": () => ({ok: true, status: 200, body: compareView}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);
        await user.type(screen.getByLabelText("Library JSON path"), "./libs/base.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));
        await screen.findByText("Loaded successfully");
        await user.click(screen.getByRole("button", {name: "Continue to Inspect"}));
        await user.click(screen.getByRole("button", {name: "Continue to Compare or use"}));
        await user.type(screen.getByLabelText("Library JSON path"), "./libs/other.json");
        await user.click(screen.getByRole("button", {name: "Compare"}));
        await screen.findByText("95.00%");

        // Editing the comparison (right-side) selector after a completed compare must invalidate that
        // result and explain why, the same way Select/import's own outdated banner already does.
        await user.type(screen.getByLabelText("Library JSON path"), "-changed");

        expect(
            await screen.findByText(
                /Outdated -- the comparison selector changed since the last Compare run\. Its result no longer reflects what's configured here; rerun Compare to see an up-to-date comparison\./,
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText("95.00%")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Compare"}));
        await screen.findByText("95.00%");
        expect(screen.queryByText(/Outdated -- the comparison selector changed/)).not.toBeInTheDocument();
    });

    it("ignores a late select response for library A once library B has been loaded", async () => {
        const user = userEvent.setup();
        let resolveA: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        let selectCallCount = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url in BASE_ROUTES) {
                const routed = BASE_ROUTES[url]({url, init});
                return jsonResponse(routed.body, routed.status);
            }
            if (url === "/api/project/outcome-libraries/select") {
                selectCallCount += 1;
                if (selectCallCount === 1) {
                    return new Promise((res) => {
                        resolveA = res;
                    });
                }
                return jsonResponse(okSelectView("lib-b"));
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);

        await user.type(screen.getByLabelText("Library JSON path"), "./libs/a.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));

        // Change the path while A's request is still pending -- this invalidates it and frees the guard
        // right away, so a new Load click doesn't have to wait for A's stale request to settle.
        await user.type(screen.getByLabelText("Library JSON path"), "-changed-to-b");
        await user.click(screen.getByRole("button", {name: "Load library"}));

        expect(await screen.findByText(/library "lib-b"/)).toBeInTheDocument();

        resolveA?.(await jsonResponse(okSelectView("lib-a")));
        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 50);
        });

        expect(screen.queryByText(/library "lib-a"/)).not.toBeInTheDocument();
    });

    it("clears all outcome-library state when the project switches", async () => {
        const user = userEvent.setup();
        const {fetchImpl: fetchImplA} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/select": () => ({ok: true, status: 200, body: okSelectView("lib-a")}),
        });

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);
        await user.type(screen.getByLabelText("Library JSON path"), "./libs/base.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));
        expect(await screen.findByText("Loaded successfully")).toBeInTheDocument();

        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/outcome-libraries/registry": () => ({ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Outcome Libraries"}));
        await user.click(await screen.findByRole("button", {name: stepperStep("Select/import", "Choose a library")}));

        // A brand new project's Outcome Libraries tab must show no trace of the previous project's
        // loaded library -- back to a clean Select/import step, path field empty.
        expect(await screen.findByLabelText("Library JSON path")).toHaveValue("");
        expect(screen.queryByText("Loaded successfully")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Inspect"})).not.toBeInTheDocument();
    });

    it("'Use in runtime' actually starts the runtime against the selected library and navigates to the Runtime tab", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/outcome-libraries/select": () => ({ok: true, status: 200, body: okSelectView("lib-a")}),
            "/api/project/runtime/restart": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "running",
                    host: "127.0.0.1",
                    port: 4321,
                    baseUrl: "http://127.0.0.1:4321",
                    debug: false,
                    repositoryMode: "memory",
                    startedAt: "2026-01-01T00:00:00.000Z",
                    preGenerated: {libraryId: "lib-a", hash: "sha256:lib-a"},
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);
        await user.type(screen.getByLabelText("Library JSON path"), "./libs/base.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));
        await screen.findByText("Loaded successfully");
        await user.click(screen.getByRole("button", {name: "Continue to Inspect"}));
        await user.click(screen.getByRole("button", {name: "Continue to Compare or use"}));

        await user.click(screen.getByRole("button", {name: "Use in runtime"}));

        // Navigated to the Runtime tab automatically -- no manual "go configure this yourself" step --
        // and it shows the real running confirmation, not a static instruction.
        expect(await screen.findByText("Running against a pre-generated outcome library")).toBeInTheDocument();
        expect(screen.getByText(/library "lib-a"/)).toBeInTheDocument();

        const restartCall = calls.find((call) => call.url === "/api/project/runtime/restart");
        expect(restartCall).toBeDefined();
        expect(JSON.parse(restartCall?.init?.body ?? "{}")).toEqual({
            preGeneratedLibrarySelector: {kind: "json", path: "./libs/base.json"},
            preGeneratedLibraryExpectedHash: "sha256:lib-a",
        });
    });

    it("shows a clear 'library changed' message instead of a diff when the left library changed on disk between Select and Compare", async () => {
        const user = userEvent.setup();
        // The left file's own path never changes in the UI at all -- the library it points to simply
        // changed on disk (externally) between Select/Inspect and Compare, so /select and /compare
        // report different content (and hashes) for the exact same selector without any client-side
        // signal that anything happened.
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/select": () => ({ok: true, status: 200, body: okSelectView("lib-a")}),
            "/api/project/outcome-libraries/compare": () => ({
                ok: true,
                status: 200,
                body: {left: okSelectView("lib-a-changed"), right: okSelectView("lib-b", ANALYSIS_B), leftSnapshotStale: true},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);
        await user.type(screen.getByLabelText("Library JSON path"), "./libs/base.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));
        await screen.findByText("Loaded successfully");
        await user.click(screen.getByRole("button", {name: "Continue to Inspect"}));
        await user.click(screen.getByRole("button", {name: "Continue to Compare or use"}));
        await user.type(screen.getByLabelText("Library JSON path"), "./libs/other.json");
        await user.click(screen.getByRole("button", {name: "Compare"}));

        expect(await screen.findByText("The left library changed since you selected it")).toBeInTheDocument();
        expect(screen.getByText(/wasn't compared against the right library/)).toBeInTheDocument();
        // The diff table must never be shown alongside a stale-snapshot warning.
        expect(screen.queryByText("Metric")).not.toBeInTheDocument();
    });

    it("'Use in runtime' does not start a changed library -- the runtime start fails cleanly instead of silently running the new content", async () => {
        const user = userEvent.setup();
        // Select library A (hash "sha256:lib-a"), then the file on disk changes before the handoff --
        // the backend re-resolves the same selector fresh at start time, finds a different hash, and
        // must refuse the start rather than silently launching a runtime against the new content. The
        // fake backend here plays the part of that real check by returning a "failed" start result with
        // the same clear message StudioRuntimeManager.startInternal() produces.
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/outcome-libraries/select": () => ({ok: true, status: 200, body: okSelectView("lib-a")}),
            "/api/project/runtime/restart": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "failed",
                    error:
                        "The selected pre-generated outcome library changed since you selected it in Outcome Libraries " +
                        "(expected hash sha256:lib-a, found sha256:lib-a-changed). Re-select it in Outcome Libraries and try again.",
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);
        await user.type(screen.getByLabelText("Library JSON path"), "./libs/base.json");
        await user.click(screen.getByRole("button", {name: "Load library"}));
        await screen.findByText("Loaded successfully");
        await user.click(screen.getByRole("button", {name: "Continue to Inspect"}));
        await user.click(screen.getByRole("button", {name: "Continue to Compare or use"}));

        await user.click(screen.getByRole("button", {name: "Use in runtime"}));

        // Navigated to the Runtime tab, and shown a clear stale-library error with a re-select
        // suggestion -- never the "running against a pre-generated outcome library" confirmation.
        expect(await screen.findByText(/changed since you selected it in Outcome Libraries/)).toBeInTheDocument();
        expect(screen.getByText(/Re-select it in Outcome Libraries and try again/)).toBeInTheDocument();
        expect(screen.queryByText("Running against a pre-generated outcome library")).not.toBeInTheDocument();

        const restartCall = calls.find((call) => call.url === "/api/project/runtime/restart");
        expect(JSON.parse(restartCall?.init?.body ?? "{}")).toEqual({
            preGeneratedLibrarySelector: {kind: "json", path: "./libs/base.json"},
            preGeneratedLibraryExpectedHash: "sha256:lib-a",
        });
    });
});

const ESTIMATE_RESULT: StudioOutcomeLibraryGenerateEstimateView = {
    status: "ok",
    game: GAME,
    reelsNumber: 2,
    reelsSymbolsNumber: 1,
    reelSizes: [3, 2],
    totalOutcomeSpaceSize: 6,
    maxOutcomeSpaceSize: 20_000_000,
    strategy: "exact",
    requiresBounded: false,
};

const GENERATE_RESULT: StudioOutcomeLibraryGenerateResultView = {
    status: "ok",
    bundleDir: "outcomelibrary",
    files: ["manifest.json", "index_base.json", "outcomes_base.jsonl"],
    warnings: [],
    mode: {modeName: "base", libraryId: "a-base", hash: "sha256:generated", outcomeCount: 4, totalWeight: 6, rtp: 0.8333},
    generator: {
        algorithm: "pokie-exact-reel-enumeration-v1",
        strategy: "exact",
        totalOutcomeSpaceSize: 6,
        sampledRawCount: 6,
        pokieVersion: "9.9.9",
        game: GAME,
        generatedAt: "2026-01-01T00:00:00.000Z",
    },
    coverage: 1,
    selector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"},
};

async function generateFromCurrentBuild(user: ReturnType<typeof userEvent.setup>, fetchImpl: FetchLike): Promise<void> {
    renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Outcome Libraries"}));

    // Opens directly on the new primary Generate step -- no navigation needed to reach it.
    await user.type(screen.getByLabelText("Mode"), "base");
    await user.click(screen.getByRole("button", {name: "Generate"}));
    await screen.findByText(/Generated "a-base"/);
}

describe("ProjectDashboardPage - Outcome Libraries Generate step / Registry panel", () => {
    it("generates a library from the current build, showing path/files/hash/generator/count/weight/RTP/coverage, and Inspect chains into the existing select() pipeline", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/generate/estimate": () => ({ok: true, status: 200, body: ESTIMATE_RESULT}),
            "/api/project/outcome-libraries/generate": () => ({ok: true, status: 200, body: GENERATE_RESULT}),
            "/api/project/outcome-libraries/select": () => ({ok: true, status: 200, body: okSelectView("a-base")}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});
        await user.click(screen.getByRole("button", {name: "Outcome Libraries"}));

        // Opens directly on the new primary Generate step -- no navigation needed to reach it.
        await user.type(screen.getByLabelText("Mode"), "base");

        await user.click(screen.getByRole("button", {name: "Estimate"}));
        expect(await screen.findByText(/Exact: every one of the 6 raw reel-stop combinations/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Generate"}));

        expect(await screen.findByText(/Generated "a-base"/)).toBeInTheDocument();
        expect(screen.getByText(/This is computed by actually running the project's own built package/)).toBeInTheDocument();
        // "outcomelibrary" also appears in the Registry panel's own descriptive text above the Stepper --
        // this only asserts the Result section's own path/files table rendered at all.
        expect(screen.getAllByText("outcomelibrary").length).toBeGreaterThan(1);
        expect(screen.getByText("sha256:generated")).toBeInTheDocument();
        expect(screen.getByText(/pokie-exact-reel-enumeration-v1/)).toBeInTheDocument();

        const generateCall = calls.find((call) => call.url === "/api/project/outcome-libraries/generate");
        expect(JSON.parse(generateCall?.init?.body ?? "{}")).toMatchObject({mode: "base"});

        // Inspect chains straight into the existing select() pipeline against the just-generated bundle,
        // landing directly on the Inspect step (distribution/features), not Validate & analyze.
        await user.click(screen.getByRole("button", {name: "Inspect"}));
        expect(await screen.findByText("95.00%")).toBeInTheDocument();
        const selectCall = calls.find((call) => call.url === "/api/project/outcome-libraries/select");
        expect(JSON.parse(selectCall?.init?.body ?? "{}")).toEqual({selector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}});
    });

    it("hands off Deploy to the Deployment tab's own workflow instead of duplicating it", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/generate": () => ({ok: true, status: 200, body: GENERATE_RESULT}),
        });

        await generateFromCurrentBuild(user, fetchImpl);
        await user.click(screen.getByRole("button", {name: "Deploy"}));

        expect(await screen.findByRole("button", {name: stepperStep("Select target", "Where to publish")})).toBeInTheDocument();
    });

    it("hands off Stake export to the Stake Engine Export tab's own workflow instead of duplicating it", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/generate": () => ({ok: true, status: 200, body: GENERATE_RESULT}),
        });

        await generateFromCurrentBuild(user, fetchImpl);
        await user.click(screen.getByRole("button", {name: "Stake export"}));

        expect(await screen.findByRole("button", {name: stepperStep("Configure", "Source, modes & output")})).toBeInTheDocument();
    });

    it("serves the freshly generated library in the Runtime tab via 'Serve pre-generated outcomes'", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/generate": () => ({ok: true, status: 200, body: GENERATE_RESULT}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime/restart": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "running",
                    host: "127.0.0.1",
                    port: 4321,
                    baseUrl: "http://127.0.0.1:4321",
                    debug: false,
                    repositoryMode: "memory",
                    startedAt: "2026-01-01T00:00:00.000Z",
                    preGenerated: {libraryId: "a-base", hash: "sha256:generated"},
                },
            }),
        });

        await generateFromCurrentBuild(user, fetchImpl);
        await user.click(screen.getByRole("button", {name: "Serve pre-generated outcomes"}));

        expect(await screen.findByText("Running against a pre-generated outcome library")).toBeInTheDocument();
        const restartCall = calls.find((call) => call.url === "/api/project/runtime/restart");
        expect(JSON.parse(restartCall?.init?.body ?? "{}")).toEqual({
            preGeneratedLibrarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"},
            preGeneratedLibraryExpectedHash: "sha256:generated",
        });
    });

    it("Registry reports a missing build and its Build action jumps back to the Generate step", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(BASE_ROUTES);

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToOutcomeLibrariesTab(user);

        expect(await screen.findByText("No library built yet")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Build"}));

        // Back on the Generate step -- its own Mode field is now visible again.
        expect(await screen.findByLabelText("Mode")).toBeInTheDocument();
    });

    // Reproduces the discoverability gap this step closes: the server-side registry used to only ever
    // look at the conventional "outcomelibrary" directory, so a generate() run pointed at a caller-chosen
    // output directory was invisible to it -- the Registry panel kept showing "No library built yet" even
    // though a perfectly good, compatible library had just been generated. Both fake responses below are
    // exactly what StudioOutcomeLibraryGenerateService.registry() now actually returns once it discovers a
    // custom outDir (see its own test coverage) -- this only asserts the client renders that faithfully.
    it("shows the discovered library in the Registry panel after generating to a custom, non-default output directory", async () => {
        const user = userEvent.setup();
        // Keyed on whether Generate has actually run yet -- not a raw call count. The Deployment tab's
        // own useDeploymentManager hook (see ProjectDashboardPage's projectKey effect) fetches this same
        // registry endpoint once on mount regardless of which tab is active, so the ordinal position of
        // "the first registry call this test's assertions care about" is no longer fixed at 1.
        let generated = false;
        const customGenerateResult: StudioOutcomeLibraryGenerateResultView = {
            ...GENERATE_RESULT,
            bundleDir: "custom-outcomes",
            selector: {kind: "bundle", bundleDir: "custom-outcomes", modeName: "base"},
        };
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/outcome-libraries/generate": () => {
                generated = true;
                return {ok: true, status: 200, body: customGenerateResult};
            },
            "/api/project/outcome-libraries/registry": () => {
                if (!generated) {
                    return {ok: true, status: 200, body: {status: "ok", bundleDir: "outcomelibrary", buildStatus: "missing"}};
                }
                return {
                    ok: true,
                    status: 200,
                    body: {
                        status: "ok",
                        bundleDir: "custom-outcomes",
                        buildStatus: "compatible",
                        game: GAME,
                        currentGame: GAME,
                        artifactPokieVersion: "9.9.9",
                        currentPokieVersion: "9.9.9",
                        generatedAt: "2026-01-01T00:00:00.000Z",
                        modes: [
                            {
                                modeName: "base",
                                libraryId: "a-base",
                                bundleDir: "custom-outcomes",
                                buildStatus: "compatible",
                                outcomeCount: 4,
                                totalWeight: 6,
                                rtp: 0.8333,
                                hash: "sha256:generated",
                            },
                        ],
                    },
                };
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "A"});
        await user.click(screen.getByRole("button", {name: "Outcome Libraries"}));

        expect(await screen.findByText("No library built yet")).toBeInTheDocument();

        await user.type(screen.getByLabelText("Mode"), "base");
        await user.type(screen.getByLabelText("Output bundle directory"), "custom-outcomes");
        await user.click(screen.getByRole("button", {name: "Generate"}));
        await screen.findByText(/Generated "a-base"/);

        // The custom-output generation is now discoverable -- never mistaken for "nothing built".
        expect(await screen.findByText("Compatible with the current build")).toBeInTheDocument();
        expect(screen.queryByText("No library built yet")).not.toBeInTheDocument();
        // "custom-outcomes" appears both in the Result section's own path/files table and in the Registry
        // panel's Location column -- same double-rendering the conventional "outcomelibrary" bundleDir
        // already gets above (see the "outcomelibrary" assertion earlier in this file).
        expect(screen.getAllByText("custom-outcomes").length).toBeGreaterThan(1);
    });
});
