import {fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {
    ReplayDescriptor,
    RoundArtifact,
    RoundArtifactJson,
    StudioReplayJobView,
    StudioReplayListEntry,
    StudioRuntimeSessionView,
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
    "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

function artifactFor(overrides: Partial<RoundArtifact> = {}, hash = "hash-1"): RoundArtifactJson {
    const base: RoundArtifact = {
        schemaVersion: 1,
        roundId: "replay:demo-seed:1",
        provenance: {game: GAME, pokieVersion: "1.0.0"},
        betMode: "base",
        stake: 1,
        totalWin: 5,
        payoutMultiplier: 5,
        screen: [["cherry", "lemon"]],
        steps: [
            {
                index: 0,
                screen: [["cherry", "lemon"]],
                totalWin: 5,
                wins: [{type: "line", id: "w1", symbolId: "cherry", winAmount: 5, winningPositions: [[0, 0]], multiplierBreakdown: [], metadata: {}}],
            },
        ],
        wins: [{type: "line", id: "w1", symbolId: "cherry", winAmount: 5, winningPositions: [[0, 0]], multiplierBreakdown: [], metadata: {}}],
        ...overrides,
    };
    return {...base, hash};
}

function descriptorFor(overrides: Partial<ReplayDescriptor> = {}, artifactHash = "hash-1"): ReplayDescriptor {
    return {
        game: GAME,
        seed: "demo-seed",
        round: 1,
        totalBet: 1,
        totalWin: 5,
        screen: [["cherry", "lemon"]],
        timestamp: Date.now(),
        durationMs: 10,
        artifact: artifactFor({}, artifactHash),
        ...overrides,
    };
}

function jobFor(id: string, overrides: Partial<StudioReplayJobView> = {}): StudioReplayJobView {
    return {
        id,
        status: "completed",
        round: 1,
        seed: "demo-seed",
        startedAt: new Date().toISOString(),
        completedRounds: 1,
        durationMs: 10,
        game: GAME,
        descriptor: descriptorFor(),
        ...overrides,
    };
}

function listEntryFor(id: string, overrides: Partial<StudioReplayListEntry> = {}): StudioReplayListEntry {
    return {
        id,
        status: "completed",
        game: GAME,
        round: 1,
        seed: "demo-seed",
        completedRounds: 1,
        totalBet: 1,
        totalWin: 5,
        startedAt: "2026-01-01T00:00:00.000Z",
        durationMs: 10,
        ...overrides,
    };
}

async function goToReplayTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Replay"}));
    await screen.findByRole("radio", {name: "Seed & Round"});
}

// Mantine's Stepper.Step packs the step icon + label + description into one <button> -- same
// convention SimulationTab's own tests already established.
function stepperStep(label: string, description: string): RegExp {
    return new RegExp(`${label}.*${description}`);
}

// Each comparison-dimension row (RoundArtifactInspector's own <List.Item>) renders its label and its
// match/mismatch/unavailable status as *separate* text nodes (a <Text span> plus a trailing string) --
// getByText's node-matching heuristic won't span both, so this reads the <li>'s own full textContent
// instead of trying to match it with a single getByText query.
function dimensionRow(label: string): HTMLElement {
    const item = screen.getAllByRole("listitem").find((element) => element.textContent?.startsWith(label));
    if (!item) {
        throw new Error(`No comparison dimension row found for label "${label}".`);
    }
    return item;
}

describe("ProjectDashboardPage - Replay & Debug workflow", () => {
    it("runs a Seed & Round replay, inspects the full artifact with step navigation, and exports it", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const twoStepArtifact = artifactFor({
            steps: [
                {index: 0, screen: [["cherry", "lemon"]], totalWin: 0, wins: []},
                {
                    index: 1,
                    screen: [["cherry", "cherry"]],
                    totalWin: 5,
                    wins: [{type: "line", id: "w1", symbolId: "cherry", winAmount: 5, winningPositions: [[0, 0]], multiplierBreakdown: [], metadata: {}}],
                    featureEvents: [{type: "free-spin-triggered"}],
                },
            ],
        });
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    expect(JSON.parse(call.init.body ?? "{}")).toEqual({round: 1, seed: "demo-seed"});
                    return {ok: true, status: 200, body: jobFor("job-1", {status: "queued", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-1": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-1", {status: "running", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: jobFor("job-1", {status: "completed", descriptor: descriptorFor({artifact: twoStepArtifact})})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.type(screen.getByLabelText("Seed (optional)"), "demo-seed");
        await user.click(screen.getByRole("button", {name: "Find"}));

        await user.click(await screen.findByRole("button", {name: "Continue to Reproduce"}));

        await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByText("No wins on this step.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Next step"}));
        expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
        expect(screen.getByText("line")).toBeInTheDocument();
        expect(screen.getByText("free-spin-triggered")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: stepperStep("Export", "Download")}));
        expect(screen.getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", "/api/project/replays/job-1/download");
    }, 45000);

    it("shows state before/after in the Inspector when the backend captured them", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    return {ok: true, status: 200, body: jobFor("job-state", {status: "queued", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-state": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-state", {status: "running", completedRounds: 0})};
                }
                return {
                    ok: true,
                    status: 200,
                    body: jobFor("job-state", {
                        status: "completed",
                        descriptor: descriptorFor({stateBefore: {bet: 1, win: 0}, stateAfter: {bet: 1, win: 5}}),
                    }),
                };
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.type(screen.getByLabelText("Seed (optional)"), "demo-seed");
        await user.click(screen.getByRole("button", {name: "Find"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Reproduce"}));

        await waitFor(() => expect(screen.getByText(/Snapshot captured for this round/)).toBeInTheDocument(), {timeout: 15000});
        expect(screen.queryByText("State snapshot unavailable for this game/session type.")).not.toBeInTheDocument();
        // The raw JSON stays hidden until Advanced details is opened -- only the plain-language status
        // is visible in the main Inspector view. AdvancedDisclosure keeps its controlled region mounted
        // (never a dangling aria-controls IDREF), just hidden, so toBeVisible() is what actually
        // exercises that, not toBeInTheDocument().
        expect(screen.getByText(/"win": 0/)).not.toBeVisible();
        expect(screen.getByText(/"win": 5/)).not.toBeVisible();
        expect(screen.getByText("State before")).not.toBeVisible();
        expect(screen.getByText("State after")).not.toBeVisible();

        await user.click(screen.getByText(/Show advanced details/));
        expect(screen.getByText("State before")).toBeVisible();
        expect(screen.getByText("State after")).toBeVisible();
        expect(screen.getByText(/"win": 0/)).toBeInTheDocument();
        expect(screen.getByText(/"win": 5/)).toBeInTheDocument();
    }, 45000);

    it("shows an explicit 'state snapshot unavailable' message (not a silently missing section) when the backend never captured state", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    return {ok: true, status: 200, body: jobFor("job-no-state", {status: "queued", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-no-state": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-no-state", {status: "running", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: jobFor("job-no-state", {status: "completed", descriptor: descriptorFor()})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.type(screen.getByLabelText("Seed (optional)"), "demo-seed");
        await user.click(screen.getByRole("button", {name: "Find"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Reproduce"}));

        await waitFor(() => expect(screen.getByText("State snapshot unavailable for this game/session type.")).toBeInTheDocument(), {timeout: 15000});
        expect(screen.queryByText("Before")).not.toBeInTheDocument();
        expect(screen.queryByText("After")).not.toBeInTheDocument();
    }, 45000);

    it("shows RNG/reel-stop debug data only after opening Advanced details, and renders cleanly when it's absent", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const debugArtifact = artifactFor({debug: {reelStops: [3, 7, 12], rngEngine: "fake"}});
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    return {ok: true, status: 200, body: jobFor("job-debug", {status: "queued", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-debug": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-debug", {status: "running", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: jobFor("job-debug", {status: "completed", descriptor: descriptorFor({artifact: debugArtifact})})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.type(screen.getByLabelText("Seed (optional)"), "demo-seed");
        await user.click(screen.getByRole("button", {name: "Find"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Reproduce"}));

        const advancedToggle = await screen.findByRole("button", {name: /Show advanced details/}, {timeout: 15000});
        // Not visible before opening Advanced details -- it's technical/internal, same treatment as the
        // rest of the raw JSON. The controlled region is mounted-but-hidden (see AdvancedDisclosure's
        // own doc comment on why), so this checks the region's own visibility via the toggle's
        // aria-controls, not a per-text-match query -- "reelStops" would already match twice even while
        // hidden (see below).
        const advancedRegionId = advancedToggle.getAttribute("aria-controls");
        expect(advancedRegionId).toBeTruthy();
        expect(document.getElementById(advancedRegionId as string)).not.toBeVisible();

        await user.click(advancedToggle);
        expect(screen.getByText(/may include RNG\/reel-stop data/)).toBeInTheDocument();
        // Appears twice: once in its own "Debug data" block, once more inside the full artifact JSON dump
        // right below it -- both under Advanced details, never in the main round view.
        expect(screen.getAllByText(/"reelStops"/).length).toBeGreaterThan(0);
    }, 45000);

    it("shows a full match banner when every comparable dimension (including state/debug) is identical", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const matchingArtifact = artifactFor({debug: {reelStops: [1, 2, 3]}}, "shared-hash");
        const matchingDescriptor = () =>
            descriptorFor({artifact: matchingArtifact, stateBefore: {win: 0}, stateAfter: {win: 5}}, "shared-hash");
        const pastedDescriptor = matchingDescriptor();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays/inspect-artifact": () => ({ok: true, status: 200, body: {round: 1, seed: "demo-seed", artifactWarnings: []}}),
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    return {ok: true, status: 200, body: jobFor("job-match", {status: "queued", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-match": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-match", {status: "running", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: jobFor("job-match", {status: "completed", descriptor: matchingDescriptor()})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        fireEvent.change(textarea, {target: {value: JSON.stringify(pastedDescriptor)}});
        await user.click(screen.getByRole("button", {name: "Validate & continue"}));

        await user.click(await screen.findByRole("button", {name: "Continue to Reproduce"}));

        await waitFor(() => expect(screen.getByText("Matches the expected result")).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByText(/RNG \/ reel stops:/)).toBeInTheDocument();
    }, 45000);

    it("shows a mismatch banner naming the specific dimension when totalPayout differs", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const pastedDescriptor = descriptorFor({artifact: artifactFor({totalWin: 5}, "expected-hash")});
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays/inspect-artifact": () => ({ok: true, status: 200, body: {round: 1, seed: "demo-seed", artifactWarnings: []}}),
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    return {ok: true, status: 200, body: jobFor("job-mismatch", {status: "queued", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-mismatch": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-mismatch", {status: "running", completedRounds: 0})};
                }
                return {
                    ok: true,
                    status: 200,
                    body: jobFor("job-mismatch", {status: "completed", descriptor: descriptorFor({artifact: artifactFor({totalWin: 9}, "reproduced-hash")})}),
                };
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        fireEvent.change(textarea, {target: {value: JSON.stringify(pastedDescriptor)}});
        await user.click(screen.getByRole("button", {name: "Validate & continue"}));

        await user.click(await screen.findByRole("button", {name: "Continue to Reproduce"}));

        await waitFor(() => expect(screen.getByText("Differs from the expected result")).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByText(/Total payout differs \(expected 5, got 9\)\./)).toBeInTheDocument();
        // Dimensions that genuinely coincide (screen/wins) must still say "match", not be swept into the
        // mismatch verdict just because some other dimension differed.
        expect(dimensionRow("Visible screen:").textContent).toMatch(/match/);
    }, 45000);

    it("reports a partial comparison (not a mismatch) when state/debug are simply absent from both sides", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        // Neither side carries stateBefore/stateAfter/debug -- an older-style descriptor, or a game
        // without session serialization -- so state/rngReelStops must show "unavailable", and that alone
        // must never demote the verdict to "mismatch".
        const pastedDescriptor = descriptorFor({}, "shared-hash-2");
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays/inspect-artifact": () => ({ok: true, status: 200, body: {round: 1, seed: "demo-seed", artifactWarnings: []}}),
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    return {ok: true, status: 200, body: jobFor("job-partial", {status: "queued", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-partial": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-partial", {status: "running", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: jobFor("job-partial", {status: "completed", descriptor: descriptorFor({}, "shared-hash-2")})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        fireEvent.change(textarea, {target: {value: JSON.stringify(pastedDescriptor)}});
        await user.click(screen.getByRole("button", {name: "Validate & continue"}));

        await user.click(await screen.findByRole("button", {name: "Continue to Reproduce"}));

        await waitFor(() => expect(screen.getByText("Partially compared against the expected result")).toBeInTheDocument(), {timeout: 15000});
        expect(dimensionRow("State transition:").textContent).toMatch(/unavailable/);
        expect(dimensionRow("RNG / reel stops:").textContent).toMatch(/unavailable/);
        expect(dimensionRow("Visible screen:").textContent).toMatch(/match/);
    }, 45000);

    it("blocks continuing past Load for a pasted artifact with an invalid outer round/seed", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays/inspect-artifact": () => ({ok: false, status: 400, body: {error: '"round" must be a positive integer.'}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        fireEvent.change(textarea, {target: {value: JSON.stringify(descriptorFor({round: 0}))}});
        await user.click(screen.getByRole("button", {name: "Validate & continue"}));

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent('"round" must be a positive integer.'));
        expect(screen.queryByRole("button", {name: "Continue to Reproduce"})).not.toBeInTheDocument();
    }, 45000);

    it("surfaces non-fatal warnings for a structurally invalid nested artifact but still allows reproducing", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays/inspect-artifact": () => ({
                ok: true,
                status: 200,
                body: {round: 1, seed: "demo-seed", artifactWarnings: ['"steps" must be an array.']},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        fireEvent.change(textarea, {target: {value: JSON.stringify({round: 1, seed: "demo-seed", artifact: {...artifactFor(), steps: "not-an-array"}})}});
        await user.click(screen.getByRole("button", {name: "Validate & continue"}));

        await waitFor(() => expect(screen.getByText('"steps" must be an array.')).toBeInTheDocument());
        expect(screen.getByRole("button", {name: "Continue to Reproduce"})).toBeInTheDocument();
    }, 45000);

    it("completes a malformed-expected-artifact replay with no crash: comparison is unavailable with diagnostics, Inspect/Export still work", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays/inspect-artifact": () => ({
                ok: true,
                status: 200,
                body: {round: 1, seed: "demo-seed", artifactWarnings: ['"screen" does not match the last step\'s screen.', '"wins" must be an array.']},
            }),
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    return {ok: true, status: 200, body: jobFor("job-malformed", {status: "queued", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-malformed": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-malformed", {status: "running", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: jobFor("job-malformed", {status: "completed", descriptor: descriptorFor()})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        // wins is not an array (missing/malformed comparison-relevant field) -- but round/seed alone are
        // still enough for the backend to accept this for replay (requirement 1's two-tier split).
        fireEvent.change(textarea, {target: {value: JSON.stringify({round: 1, seed: "demo-seed", artifact: {...artifactFor(), wins: "not-an-array"}})}});
        await user.click(screen.getByRole("button", {name: "Validate & continue"}));

        await user.click(await screen.findByRole("button", {name: "Continue to Reproduce"}));

        // No crash: the Inspect step renders fully, with an "unavailable" comparison banner carrying the
        // exact wording plus the original validation diagnostics (never hidden, never silently repaired).
        await waitFor(() => expect(screen.getByText("Comparison unavailable")).toBeInTheDocument(), {timeout: 15000});
        expect(
            screen.getByText(
                /Replay succeeded, but the expected artifact is malformed, so deterministic comparison is unavailable:.*"screen" does not match.*"wins" must be an array\./,
            ),
        ).toBeInTheDocument();

        // Inspect still shows the reproduced round's own content (screen table etc.) and Export still works.
        await user.click(screen.getByRole("button", {name: /Export.*Download/}));
        expect(screen.getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", "/api/project/replays/job-malformed/download");
    }, 45000);

    it("rejects text that isn't valid JSON without ever calling the server", async () => {
        const user = userEvent.setup();
        let inspectCalled = false;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays/inspect-artifact": () => {
                inspectCalled = true;
                return {ok: true, status: 200, body: {round: 1, artifactWarnings: []}};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        fireEvent.change(textarea, {target: {value: "{not valid json"}});
        await user.click(screen.getByRole("button", {name: "Validate & continue"}));

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That's not valid JSON."));
        expect(inspectCalled).toBe(false);
    }, 45000);

    it("discards a stale 'expected artifact' response once a different comparison target is picked", async () => {
        const user = userEvent.setup();
        let releaseSlow: (() => void) | undefined;
        const entries = [listEntryFor("replay-x", {round: 1, seed: "seed-x"}), listEntryFor("replay-y", {round: 2, seed: "seed-y"})];
        const fetchImpl: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/replays/replay-x") {
                return new Promise((resolve) => {
                    releaseSlow = () =>
                        resolve({
                            ok: true,
                            status: 200,
                            json: () =>
                                Promise.resolve(jobFor("replay-x", {round: 1, seed: "seed-x", descriptor: descriptorFor({round: 1, seed: "seed-x"}, "hash-x")})),
                        });
                });
            }
            if (path === "/api/project/replays/replay-y") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve(jobFor("replay-y", {round: 2, seed: "seed-y", descriptor: descriptorFor({round: 2, seed: "seed-y"}, "hash-y")})),
                });
            }
            if (path === "/api/project/replays") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(entries)});
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route({url, init: undefined});
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const pickSection = (await screen.findByText("Or pick from recent replays to reproduce & compare")).closest("fieldset") as HTMLElement;

        await user.click(within(pickSection).getByRole("button", {name: /round 1/}));
        // Back to Find to pick a *different* comparison target before replay-x's slow fetch resolves.
        await user.click(screen.getByRole("button", {name: stepperStep("Find", "Locate a round")}));
        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const pickSectionAgain = screen.getByText("Or pick from recent replays to reproduce & compare").closest("fieldset") as HTMLElement;
        await user.click(within(pickSectionAgain).getByRole("button", {name: /round 2/}));

        await waitFor(() => expect(screen.getByText(/Round 2, seed seed-y\./)).toBeInTheDocument());

        // The slow replay-x response finally lands -- must never overwrite the already-shown replay-y result.
        releaseSlow?.();
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
        expect(screen.getByText(/Round 2, seed seed-y\./)).toBeInTheDocument();
        expect(screen.queryByText(/Round 1, seed seed-x\./)).not.toBeInTheDocument();
    }, 45000);

    it("clears the 'expected artifact' state when the project changes mid-load", async () => {
        const user = userEvent.setup();
        let releaseSlow: (() => void) | undefined;
        const entries = [listEntryFor("replay-x", {round: 1, seed: "seed-x"})];
        const fetchImplA: FetchLike = (url) => {
            const [path] = url.split("?");
            if (path === "/api/project/context") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "loaded", projectRoot: "/games/a", game: GAME})});
            }
            if (path === "/api/project/replays/replay-x") {
                return new Promise((resolve) => {
                    releaseSlow = () =>
                        resolve({
                            ok: true,
                            status: 200,
                            json: () => Promise.resolve(jobFor("replay-x", {round: 1, seed: "seed-x", descriptor: descriptorFor({round: 1, seed: "seed-x"})})),
                        });
                });
            }
            if (path === "/api/project/replays") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(entries)});
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route({url, init: undefined});
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);
        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const pickSection = (await screen.findByText("Or pick from recent replays to reproduce & compare")).closest("fieldset") as HTMLElement;
        await user.click(within(pickSection).getByRole("button", {name: /round 1/}));
        await waitFor(() => expect(screen.getByText("Validating artifact…")).toBeInTheDocument());

        // Simulate navigating away (the real mechanism a project switch happens through).
        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}},
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true, generated: false}}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Replay"}));
        await screen.findByRole("radio", {name: "Seed & Round"});
        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));

        // Project A's slow response finally resolves -- must never reach project B's now-mounted UI.
        releaseSlow?.();
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });

        expect(screen.queryByText("Validating artifact…")).not.toBeInTheDocument();
        expect(screen.queryByText(/Round 1, seed seed-x\./)).not.toBeInTheDocument();
    }, 45000);

    it("gates Export behind a completed result for a stored replay reproduction, then exposes the download link", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    return {ok: true, status: 200, body: jobFor("job-export", {status: "completed"})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-export": () => ({ok: true, status: 200, body: jobFor("job-export", {status: "completed"})}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        const exportStep = stepperStep("Export", "Download");
        expect(screen.getByRole("button", {name: exportStep})).toBeDisabled();

        await user.click(screen.getByRole("button", {name: "Find"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Reproduce"}));

        await waitFor(() => expect(screen.getByRole("button", {name: exportStep})).not.toBeDisabled(), {timeout: 15000});
        await user.click(screen.getByRole("button", {name: exportStep}));
        expect(screen.getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", "/api/project/replays/job-export/download");
    }, 45000);

    it("gates Export behind picking a live spin, then offers a client-side JSON download for it", async () => {
        const user = userEvent.setup();
        const spin: StudioRuntimeSessionView = {
            sessionId: "sess-1",
            game: GAME,
            credits: 995,
            bet: 1,
            win: 5,
            studioRequestId: "req-1",
            debug: {stateAfter: {x: 1}, requestId: "req-1"},
        };
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: [spin]}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        const exportStep = stepperStep("Export", "Download");
        expect(screen.getByRole("button", {name: exportStep})).toBeDisabled();

        await user.click(screen.getByRole("radio", {name: "Session Spin"}));
        await user.click(await screen.findByRole("button", {name: /session sess-1/}));
        await user.click(screen.getByRole("button", {name: "Continue to Inspect"}));

        await waitFor(() => expect(screen.getByRole("button", {name: exportStep})).not.toBeDisabled());
        await user.click(screen.getByRole("button", {name: exportStep}));
        expect(screen.getByRole("button", {name: "Download JSON"})).toBeInTheDocument();
        expect(screen.queryByRole("link", {name: "Download JSON"})).not.toBeInTheDocument();
    }, 45000);

    it("shows the Session Spin's own inspect view (screen, credits/bet/win, state before/after) with nothing to reproduce", async () => {
        const user = userEvent.setup();
        const spin: StudioRuntimeSessionView = {
            sessionId: "sess-2",
            game: GAME,
            credits: 990,
            bet: 1,
            win: 0,
            screen: [["cherry"]],
            studioRequestId: "req-2",
            debug: {stateAfter: {credits: 990}, stateBefore: {credits: 991}, requestId: "req-2"},
        };
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: [spin]}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Session Spin"}));
        await user.click(await screen.findByRole("button", {name: /session sess-2/}));

        expect(screen.getByText(/there's nothing to reproduce it against/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: stepperStep("Reproduce", "Run the replay")})).toBeDisabled();

        await user.click(screen.getByRole("button", {name: "Continue to Inspect"}));
        expect(screen.getByText("sess-2")).toBeInTheDocument();

        // Raw state before/after now lives under Advanced details, not shown unconditionally -- the
        // region is mounted-but-hidden (see AdvancedDisclosure's own doc comment), so this checks
        // visibility, not DOM presence.
        expect(screen.getByText("Raw state before")).not.toBeVisible();
        expect(screen.getByText("Raw state after")).not.toBeVisible();
        await user.click(screen.getByText(/Show advanced details/));
        expect(screen.getByText("Raw state before")).toBeVisible();
        expect(screen.getByText("Raw state after")).toBeVisible();
    }, 45000);

    it("discards an out-of-order Recent Replays list response, keeping only the latest refresh's result", async () => {
        const user = userEvent.setup();
        const entryOld: StudioReplayListEntry = {id: "old", round: 1, status: "completed", startedAt: "2026-01-01T00:00:00.000Z", game: GAME};
        const entryNew: StudioReplayListEntry = {id: "new", round: 2, status: "completed", startedAt: "2026-01-02T00:00:00.000Z", game: GAME};
        let releaseFirstList: (() => void) | undefined;
        let listCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/replays" && init?.method === undefined) {
                listCalls += 1;
                if (listCalls === 1) {
                    return new Promise((resolve) => {
                        releaseFirstList = () => resolve({ok: true, status: 200, json: () => Promise.resolve([entryOld])});
                    });
                }
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([entryNew])});
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route();
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);
        await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(1));

        const recentReplaysSection = screen.getByText("Recent replays").closest("fieldset") as HTMLElement;
        // A second refresh (the initial project-load fetch is still in flight) must win -- its response
        // lands first and is the one actually current.
        await user.click(within(recentReplaysSection).getByRole("button", {name: "Refresh"}));
        await waitFor(() => expect(within(recentReplaysSection).getByText(/round 2 —/)).toBeInTheDocument());

        // Now let the first, slower request resolve -- it must not overwrite the newer result.
        releaseFirstList?.();
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(within(recentReplaysSection).getByText(/round 2 —/)).toBeInTheDocument();
        expect(within(recentReplaysSection).queryByText(/round 1 —/)).not.toBeInTheDocument();
    });

    // Clicking "Inspect" used to always jump to the Inspect step regardless of whether the underlying
    // fetch actually succeeded -- a failure was silently dropped, landing the user on step 3 with
    // whatever replay.job happened to already be there (stale or empty), no error, no explanation.
    it("stays put and shows an error instead of silently jumping to Inspect when loading a stored replay fails", async () => {
        const user = userEvent.setup();
        const entry: StudioReplayListEntry = {id: "bad", round: 1, status: "completed", startedAt: "2026-01-01T00:00:00.000Z", game: GAME};
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/project/replays" && init?.method === undefined) {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([entry])});
            }
            if (path === "/api/project/replays/bad") {
                return Promise.resolve({ok: false, status: 404, json: () => Promise.resolve({error: "That replay no longer exists."})});
            }
            const route = BASE_ROUTES[path];
            if (route) {
                const {ok, status, body} = route();
                return Promise.resolve({ok, status, json: () => Promise.resolve(body)});
            }
            return Promise.reject(new Error(`no fake route for ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);
        const recentReplaysSection = await screen.findByText("round 1 —", {exact: false}).then((el) => el.closest("fieldset") as HTMLElement);

        await user.click(within(recentReplaysSection).getByRole("button", {name: "Inspect"}));

        expect(await within(recentReplaysSection).findByText("That replay no longer exists.")).toBeInTheDocument();
        // Still on Find -- the Inspect step's own Stepper button was never reached/advanced to.
        expect(screen.getByRole("radio", {name: "Seed & Round"})).toBeInTheDocument();
    });

    // inspectReachable stays true off a *stale* `result` from an earlier, different-method
    // reproduction, so jumping the Stepper back to Find, switching to "Session Spin", then forward to
    // Inspect again without picking a spin used to render nothing at all -- none of Inspect's own
    // branches matched that exact (findMethod, selection) combination.
    it("shows an explanatory EmptyState, not a blank screen, when Inspect is reached via Session Spin with nothing selected", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    return {ok: true, status: 200, body: jobFor("job-1", {status: "queued", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-1": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-1", {status: "running", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: jobFor("job-1", {status: "completed", descriptor: descriptorFor({artifact: artifactFor()})})};
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.type(screen.getByLabelText("Seed (optional)"), "demo-seed");
        await user.click(screen.getByRole("button", {name: "Find"}));
        await user.click(await screen.findByRole("button", {name: "Continue to Reproduce"}));
        await waitFor(() => expect(screen.getByRole("button", {name: stepperStep("Inspect", "See results")})).not.toBeDisabled(), {timeout: 15000});

        // Back to Find, switch method, then straight to Inspect (still enabled off the stale `result`)
        // without ever picking a spin.
        await user.click(screen.getByRole("button", {name: stepperStep("Find", "Locate a round")}));
        await user.click(screen.getByRole("radio", {name: "Session Spin"}));
        await user.click(screen.getByRole("button", {name: stepperStep("Inspect", "See results")}));

        expect(screen.getByText("Pick a spin in the Find step first.")).toBeInTheDocument();
    }, 45000);
});
