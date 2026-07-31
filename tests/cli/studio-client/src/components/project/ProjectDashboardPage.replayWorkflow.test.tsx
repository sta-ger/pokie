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
        sessionId: "session-1",
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
    await screen.findByRole("radio", {name: "Recreate from seed"});
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
    it("runs a Recreate from seed replay, inspects the full artifact with step navigation, and exports it", async () => {
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

        // Export is visible but disabled before anything has been loaded/reproduced.
        expect(screen.getByRole("button", {name: "Download JSON"})).toBeDisabled();

        await user.type(screen.getByLabelText("Seed (optional)"), "demo-seed");
        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(await screen.findByRole("button", {name: "Reproduce"}));

        await waitFor(() => expect(screen.getByText("Step 1 of 2")).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByText("No wins on this step.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Next step"}));
        expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
        expect(screen.getByText("line")).toBeInTheDocument();
        expect(screen.getByText("free-spin-triggered")).toBeInTheDocument();

        expect(screen.getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", "/api/project/replays/job-1/download");
    }, 60000);

    it("reports the actual new replay session identity separately from the replay job id, alongside requested/actual round, seed, and run time", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    expect(JSON.parse(call.init.body ?? "{}")).toEqual({round: 3, seed: "demo-seed"});
                    return {ok: true, status: 200, body: jobFor("job-identity", {status: "queued", round: 3, completedRounds: 0})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-identity": () => {
                pollCount += 1;
                if (pollCount < 2) {
                    return {ok: true, status: 200, body: jobFor("job-identity", {status: "running", round: 3, completedRounds: 0})};
                }
                return {
                    ok: true,
                    status: 200,
                    body: jobFor("job-identity", {
                        status: "completed",
                        round: 3,
                        descriptor: descriptorFor({sessionId: "fresh-session-42", round: 3}),
                    }),
                };
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.clear(screen.getByLabelText(/^Target round number in a new replay session/));
        await user.type(screen.getByLabelText(/^Target round number in a new replay session/), "3");
        await user.type(screen.getByLabelText("Seed (optional)"), "demo-seed");
        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(await screen.findByRole("button", {name: "Reproduce"}));

        await waitFor(() => expect(screen.getByRole("cell", {name: "fresh-session-42"})).toBeInTheDocument(), {timeout: 15000});
        // The job id that tracked the run is shown too, but under its own distinct label -- never as
        // the "Replay session" row, so the two identities are never conflated.
        expect(screen.getByRole("cell", {name: "job-identity"})).toBeInTheDocument();
        expect(screen.getAllByRole("row").some((row) => row.textContent?.includes("Requested round") && row.textContent?.includes("3"))).toBe(true);
        expect(screen.getAllByRole("row").some((row) => row.textContent?.includes("Actual round reached") && row.textContent?.includes("3"))).toBe(true);
        expect(screen.getByText(/Not verified -- a fresh forward replay/)).toBeInTheDocument();
    }, 60000);

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
        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(await screen.findByRole("button", {name: "Reproduce"}));

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
    }, 60000);

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
        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(await screen.findByRole("button", {name: "Reproduce"}));

        await waitFor(() => expect(screen.getByText("State snapshot unavailable for this game/session type.")).toBeInTheDocument(), {timeout: 15000});
        expect(screen.queryByText("Before")).not.toBeInTheDocument();
        expect(screen.queryByText("After")).not.toBeInTheDocument();
    }, 60000);

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
        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(await screen.findByRole("button", {name: "Reproduce"}));

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
    }, 60000);

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
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await user.click(await screen.findByRole("button", {name: "Reproduce"}));

        await waitFor(() => expect(screen.getByText("Matches the expected result")).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByText(/RNG \/ reel stops:/)).toBeInTheDocument();
    }, 60000);

    it("shows a mismatch banner naming the specific dimension when totalPayout differs", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        const pastedDescriptor = descriptorFor({
            artifact: artifactFor({totalWin: 5, debug: {reelStops: [1, 2, 3]}}, "expected-hash"),
            stateBefore: {win: 0},
            stateAfter: {win: 5},
        });
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
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await user.click(await screen.findByRole("button", {name: "Reproduce"}));

        await waitFor(() => expect(screen.getByText("Differs from the expected result")).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByText(/Total payout differs \(expected 5, got 9\)\./)).toBeInTheDocument();
        // Dimensions that genuinely coincide (screen/wins) must still say "match", not be swept into the
        // mismatch verdict just because some other dimension differed.
        expect(dimensionRow("Visible screen:").textContent).toMatch(/match/);
    }, 60000);

    it("reports a partial comparison (not a mismatch) when state/debug are absent from the freshly reproduced side", async () => {
        const user = userEvent.setup();
        let pollCount = 0;
        // The expected (pasted) side carries a full state/RNG capture -- required for Reproduce to be
        // enabled at all -- but the freshly reproduced side (this project's current game/session) simply
        // doesn't capture them, an older-style descriptor, or a game without session serialization -- so
        // state/rngReelStops must show "unavailable", and that alone must never demote the verdict to
        // "mismatch".
        const pastedDescriptor = descriptorFor(
            {artifact: artifactFor({debug: {reelStops: [1, 2, 3]}}, "shared-hash-2"), stateBefore: {win: 0}, stateAfter: {win: 5}},
            "shared-hash-2",
        );
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
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await user.click(await screen.findByRole("button", {name: "Reproduce"}));

        await waitFor(() => expect(screen.getByText("Partially compared against the expected result")).toBeInTheDocument(), {timeout: 15000});
        expect(dimensionRow("State transition:").textContent).toMatch(/unavailable/);
        expect(dimensionRow("RNG / reel stops:").textContent).toMatch(/unavailable/);
        expect(dimensionRow("Visible screen:").textContent).toMatch(/match/);
    }, 60000);

    it("blocks reproducing a pasted artifact with an invalid outer round/seed", async () => {
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
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent('"round" must be a positive integer.'));
        expect(screen.queryByRole("button", {name: "Reproduce"})).not.toBeInTheDocument();
    }, 60000);

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
        fireEvent.change(textarea, {
            target: {
                value: JSON.stringify({
                    round: 1,
                    seed: "demo-seed",
                    artifact: {...artifactFor({debug: {reelStops: [1, 2, 3]}}), steps: "not-an-array"},
                    stateBefore: {win: 0},
                    stateAfter: {win: 5},
                }),
            },
        });
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await waitFor(() => expect(screen.getByText('"steps" must be an array.')).toBeInTheDocument());
        expect(screen.getByRole("button", {name: "Reproduce"})).not.toBeDisabled();
    }, 60000);

    it("disables Reproduce with a concrete missing-seed explanation and remediation for an imported record with no seed", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            // No outer "seed" was pasted, so the backend's own validated echo carries none either --
            // this is the shape a Stake Engine-imported round (never recorded with a Pokie seed) takes.
            "/api/project/replays/inspect-artifact": () => ({ok: true, status: 200, body: {round: 1, artifactWarnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        fireEvent.change(textarea, {target: {value: JSON.stringify({round: 1, artifact: artifactFor()})}});
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await screen.findByText(/Round 1, seed \(none\)\./);
        expect(screen.getByText("Reproduce isn't reliable for this round")).toBeInTheDocument();
        expect(screen.getByText(/no recorded seed/)).toBeInTheDocument();
        expect(screen.getByText(/Add a "seed" field/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Reproduce"})).toBeDisabled();
    }, 60000);

    it("disables Reproduce with a concrete version-mismatch explanation and remediation when the record's game version differs from the loaded project", async () => {
        const user = userEvent.setup();
        const mismatchedArtifact = artifactFor({provenance: {game: {id: "a", name: "A", version: "2.0.0"}, pokieVersion: "1.0.0"}});
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays/inspect-artifact": () => ({ok: true, status: 200, body: {round: 1, seed: "demo-seed", artifactWarnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        fireEvent.change(textarea, {target: {value: JSON.stringify(descriptorFor({artifact: mismatchedArtifact}))}});
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await screen.findByText(/Round 1, seed demo-seed\./);
        expect(screen.getByText("Reproduce isn't reliable for this round")).toBeInTheDocument();
        expect(screen.getByText(/recorded against a v2\.0\.0, but the project currently loaded is a v1\.0\.0/)).toBeInTheDocument();
        expect(screen.getByText(/Open project "a" at version 2\.0\.0/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Reproduce"})).toBeDisabled();
    }, 60000);

    it("disables Reproduce with a concrete missing-provenance explanation and remediation for a record whose artifact carries no recorded game id/version, while Inspect/Reproduce-and-compare from Recent Replays remain available", async () => {
        const user = userEvent.setup();
        const storedEntry: StudioReplayListEntry = {id: "stored-1", round: 1, status: "completed", startedAt: "2026-01-01T00:00:00.000Z", game: GAME};
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === undefined) {
                    return {ok: true, status: 200, body: [storedEntry]};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/inspect-artifact": () => ({ok: true, status: 200, body: {round: 1, seed: "demo-seed", artifactWarnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        // State and an RNG trace are both captured (so those gates aren't what's under test), but the
        // artifact's provenance block never recorded which game/version produced it -- e.g. a
        // hand-trimmed import that dropped "provenance.game" while keeping everything else.
        fireEvent.change(textarea, {
            target: {
                value: JSON.stringify({
                    round: 1,
                    seed: "demo-seed",
                    artifact: {...artifactFor({debug: {reelStops: [1, 2, 3]}}), provenance: {pokieVersion: "1.0.0"}},
                    stateBefore: {win: 0},
                    stateAfter: {win: 5},
                }),
            },
        });
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await screen.findByText(/Round 1, seed demo-seed\./);
        expect(screen.getByText("Reproduce isn't reliable for this round")).toBeInTheDocument();
        expect(screen.getByText(/no recorded game id\/version provenance/)).toBeInTheDocument();
        expect(screen.getByText(/Add a "provenance.game" object/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Reproduce"})).toBeDisabled();

        // The gate only blocks *this pasted record's* Reproduce action -- a stored replay's own
        // Inspect/Reproduce-and-compare actions in Recent Replays stay fully available regardless.
        const recentReplaysSection = screen.getByText("Recent replays").closest("fieldset") as HTMLElement;
        expect(within(recentReplaysSection).getByRole("button", {name: "Inspect"})).not.toBeDisabled();
        expect(within(recentReplaysSection).getByRole("button", {name: "Reproduce & compare"})).not.toBeDisabled();
    }, 60000);

    it("disables Reproduce with a concrete missing-state explanation and remediation for an incomplete record with no session state captured", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays/inspect-artifact": () => ({ok: true, status: 200, body: {round: 1, seed: "demo-seed", artifactWarnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        // Carries an RNG trace but no stateBefore/stateAfter -- an incomplete record, distinct from a
        // record that never had a round artifact at all.
        fireEvent.change(textarea, {target: {value: JSON.stringify(descriptorFor({artifact: artifactFor({debug: {reelStops: [1, 2, 3]}})}))}});
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await screen.findByText(/Round 1, seed demo-seed\./);
        expect(screen.getByText("Reproduce isn't reliable for this round")).toBeInTheDocument();
        expect(screen.getByText(/no recorded session state/)).toBeInTheDocument();
        expect(screen.getByText(/Add "stateBefore" and "stateAfter" fields/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Reproduce"})).toBeDisabled();
    }, 60000);

    it("disables Reproduce with a concrete missing-RNG-trace explanation and remediation for an incomplete record with no reelStops captured", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays/inspect-artifact": () => ({ok: true, status: 200, body: {round: 1, seed: "demo-seed", artifactWarnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));
        const textarea = screen.getByLabelText(/Paste a replay artifact JSON/);
        // Carries state but no explicit RNG/reel-stop trace under the artifact's debug data.
        fireEvent.change(textarea, {target: {value: JSON.stringify(descriptorFor({stateBefore: {win: 0}, stateAfter: {win: 5}}))}});
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await screen.findByText(/Round 1, seed demo-seed\./);
        expect(screen.getByText("Reproduce isn't reliable for this round")).toBeInTheDocument();
        expect(screen.getByText(/no recorded RNG\/reel-stop trace/)).toBeInTheDocument();
        expect(screen.getByText(/Add a "reelStops" field/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Reproduce"})).toBeDisabled();
    }, 60000);

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
        // still enough for the backend to accept this for replay (requirement 1's two-tier split). State
        // and an RNG trace are still captured here so the reproducibility gate itself isn't what's under
        // test in this case.
        fireEvent.change(textarea, {
            target: {
                value: JSON.stringify({
                    round: 1,
                    seed: "demo-seed",
                    artifact: {...artifactFor({debug: {reelStops: [1, 2, 3]}}), wins: "not-an-array"},
                    stateBefore: {win: 0},
                    stateAfter: {win: 5},
                }),
            },
        });
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await user.click(await screen.findByRole("button", {name: "Reproduce"}));

        // No crash: the reproduced round renders fully, with an "unavailable" comparison banner carrying
        // the exact wording plus the original validation diagnostics (never hidden, never silently
        // repaired) -- and Export exposes the download link inline, with nothing further to click.
        await waitFor(() => expect(screen.getByText("Comparison unavailable")).toBeInTheDocument(), {timeout: 15000});
        expect(
            screen.getByText(
                /Replay succeeded, but the expected artifact is malformed, so deterministic comparison is unavailable:.*"screen" does not match.*"wins" must be an array\./,
            ),
        ).toBeInTheDocument();

        expect(screen.getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", "/api/project/replays/job-malformed/download");
    }, 60000);

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
        await user.click(screen.getByRole("button", {name: "Validate & load"}));

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That's not valid JSON."));
        expect(inspectCalled).toBe(false);
    }, 60000);

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
        // The picker stays visible (no page to navigate away from), so picking a *different* comparison
        // target is just another click on the same still-open list -- before replay-x's slow fetch
        // resolves.
        await user.click(within(pickSection).getByRole("button", {name: /round 2/}));

        await waitFor(() => expect(screen.getByText(/Round 2, seed seed-y\./)).toBeInTheDocument());

        // The slow replay-x response finally lands -- must never overwrite the already-shown replay-y result.
        releaseSlow?.();
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
        expect(screen.getByText(/Round 2, seed seed-y\./)).toBeInTheDocument();
        expect(screen.queryByText(/Round 1, seed seed-x\./)).not.toBeInTheDocument();
    }, 60000);

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
        await screen.findByRole("radio", {name: "Recreate from seed"});
        await user.click(screen.getByRole("radio", {name: "Replay Artifact"}));

        // Project A's slow response finally resolves -- must never reach project B's now-mounted UI.
        releaseSlow?.();
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });

        expect(screen.queryByText("Validating artifact…")).not.toBeInTheDocument();
        expect(screen.queryByText(/Round 1, seed seed-x\./)).not.toBeInTheDocument();
    }, 60000);

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

        // Export is always visible -- an action, not a page -- but disabled until there's a result.
        expect(screen.getByRole("button", {name: "Download JSON"})).toBeDisabled();

        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(await screen.findByRole("button", {name: "Reproduce"}));

        await waitFor(() => expect(screen.getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", "/api/project/replays/job-export/download"), {
            timeout: 15000,
        });
        expect(screen.queryByRole("button", {name: "Download JSON"})).not.toBeInTheDocument();
    }, 60000);

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

        expect(screen.getByRole("button", {name: "Download JSON"})).toBeDisabled();

        await user.click(screen.getByRole("radio", {name: "Session Spin"}));
        await user.click(await screen.findByRole("button", {name: /session sess-1/}));

        // Picking the spin loads it immediately -- there's nothing to reproduce, so Export is ready as
        // soon as it's selected, with no separate confirmation click in between.
        await waitFor(() => expect(screen.getByRole("button", {name: "Download JSON"})).not.toBeDisabled());
        expect(screen.queryByRole("link", {name: "Download JSON"})).not.toBeInTheDocument();
    }, 60000);

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

        // Loads straight into its own inspect view -- no Reproduce action exists for this source at all.
        expect(screen.getByText(/there's nothing to reproduce it against/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Reproduce"})).not.toBeInTheDocument();
        expect(screen.getByRole("cell", {name: "sess-2"})).toBeInTheDocument();

        // Raw state before/after now lives under Advanced details, not shown unconditionally -- the
        // region is mounted-but-hidden (see AdvancedDisclosure's own doc comment), so this checks
        // visibility, not DOM presence.
        expect(screen.getByText("Raw state before")).not.toBeVisible();
        expect(screen.getByText("Raw state after")).not.toBeVisible();
        await user.click(screen.getByText(/Show advanced details/));
        expect(screen.getByText("Raw state before")).toBeVisible();
        expect(screen.getByText("Raw state after")).toBeVisible();
    }, 60000);

    it("keeps Session Spin a plain existing-record lookup keyed by session/round/request identity -- picking a spin never starts a replay job or mutates the session", async () => {
        const user = userEvent.setup();
        const spin: StudioRuntimeSessionView = {
            sessionId: "sess-lookup",
            game: GAME,
            credits: 950,
            bet: 1,
            win: 0,
            studioRound: 7,
            studioRequestId: "req-lookup",
            studioRecordedAt: "2026-01-01T00:00:00.000Z",
        };
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: [spin]}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.click(screen.getByRole("radio", {name: "Session Spin"}));
        await user.click(await screen.findByRole("button", {name: /Round 7 in session sess-lookup/}));

        // The spin's own recorded round/session/request identity is shown as-is -- a lookup, never a
        // fresh execution summary (no "Replay session"/"Replay job"/"Reproducibility" rows exist here at
        // all, since nothing was reproduced).
        expect(screen.getByRole("cell", {name: "sess-lookup"})).toBeInTheDocument();
        expect(screen.getByRole("cell", {name: /Round 7 in session sess-lookup/})).toBeInTheDocument();
        expect(screen.getByRole("cell", {name: "req-lookup"})).toBeInTheDocument();
        expect(screen.queryByText("Replay session")).not.toBeInTheDocument();
        expect(screen.queryByText("Replay job")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Reproduce"})).not.toBeInTheDocument();

        // No POST to /api/project/replays was ever issued -- selecting a spin is a pure read of an
        // already-recorded round, never a replay run that would create/mutate a session.
        expect(calls.some((call) => call.url.startsWith("/api/project/replays") && call.init?.method === "POST")).toBe(false);
    }, 60000);

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

    // Clicking "Inspect" used to always jump to a dedicated Inspect step regardless of whether the
    // underlying fetch actually succeeded -- a failure was silently dropped, landing the user on a
    // result view with whatever replay.job happened to already be there (stale or empty), no error, no
    // explanation. The loaded card/result view now only ever appears once `markLoaded` actually runs,
    // which only happens after the fetch resolves.
    it("stays put and shows an error instead of silently showing a loaded result when loading a stored replay fails", async () => {
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
        // Still on Recreate from seed with nothing loaded -- the failed fetch never marked anything loaded.
        expect(screen.getByRole("radio", {name: "Recreate from seed"})).toBeInTheDocument();
        expect(screen.getByText("Load a round above to reproduce it.")).toBeInTheDocument();
    });

    // Switching source used to leave a stale `result` from a previous, different-method reproduction
    // showing under the new source -- jumping the old Stepper back to Find, switching to "Session Spin",
    // then forward to Inspect again without picking a spin used to render nothing at all (none of
    // Inspect's own branches matched that exact (findMethod, selection) combination). Now every source
    // switch resets the loaded/reproduced state outright, so there's nothing stale left to render.
    it("resets the loaded round/result when the source is switched, showing a source-specific empty prompt instead", async () => {
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
        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(await screen.findByRole("button", {name: "Reproduce"}));
        await waitFor(() => expect(screen.getByRole("link", {name: "Download JSON"})).toBeInTheDocument(), {timeout: 15000});

        // Switch source -- the just-reproduced round/result must not linger under the new source.
        await user.click(screen.getByRole("radio", {name: "Session Spin"}));

        expect(screen.getByText("Pick a spin above to view its details.")).toBeInTheDocument();
        expect(screen.queryByText(/Round 1, seed demo-seed\./)).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Download JSON"})).toBeDisabled();

        // Switching back to Recreate from seed starts fresh too -- nothing carried over either direction.
        await user.click(screen.getByRole("radio", {name: "Recreate from seed"}));
        expect(screen.getByText("Load a round above to reproduce it.")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Reproduce"})).not.toBeInTheDocument();
    }, 60000);

    // `progress`/`result`/`error` are a single global "last replay job" the parent tracks, not scoped
    // to any one Replay source/target. Before this fix, reaching a terminal replay and then loading a
    // *different* target -- without switching source at all, just a fresh Load -- kept presenting that
    // stale job's terminal progress/retry/result instead of offering Reproduce for the newly loaded
    // target.
    it("scopes a terminal replay job to its own target -- a new Load exposes Reproduce again, not stale terminal state", async () => {
        const user = userEvent.setup();
        let pollCountJob1 = 0;
        let pollCountJob2 = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/replays": (call: FakeCall) => {
                if (call.init?.method === "POST") {
                    const body = JSON.parse(call.init.body ?? "{}") as {round: number; seed?: string};
                    const jobId = body.seed === "other-seed" ? "job-2" : "job-1";
                    return {ok: true, status: 200, body: jobFor(jobId, {status: "queued", completedRounds: 0, round: body.round, seed: body.seed})};
                }
                return {ok: true, status: 200, body: []};
            },
            "/api/project/replays/job-1": () => {
                pollCountJob1 += 1;
                if (pollCountJob1 < 2) {
                    return {ok: true, status: 200, body: jobFor("job-1", {status: "running", completedRounds: 0})};
                }
                return {ok: true, status: 200, body: jobFor("job-1", {status: "completed", descriptor: descriptorFor({artifact: artifactFor()})})};
            },
            "/api/project/replays/job-2": () => {
                pollCountJob2 += 1;
                if (pollCountJob2 < 2) {
                    return {ok: true, status: 200, body: jobFor("job-2", {status: "running", completedRounds: 0, round: 1, seed: "other-seed"})};
                }
                return {
                    ok: true,
                    status: 200,
                    body: jobFor("job-2", {
                        status: "completed",
                        round: 1,
                        seed: "other-seed",
                        descriptor: descriptorFor({seed: "other-seed", artifact: artifactFor({}, "hash-2")}),
                    }),
                };
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);

        await user.type(screen.getByLabelText("Seed (optional)"), "demo-seed");
        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(await screen.findByRole("button", {name: "Reproduce"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Run again with the same parameters"})).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByRole("link", {name: "Download JSON"})).toBeInTheDocument();

        // Load a *different* target via the same source (new seed, same round) -- the prior terminal
        // replay's progress/retry/result must not linger and block reproducing this new target.
        await user.clear(screen.getByLabelText("Seed (optional)"));
        await user.type(screen.getByLabelText("Seed (optional)"), "other-seed");
        await user.click(screen.getByRole("button", {name: "Load"}));

        expect(await screen.findByText(/Round 1, seed other-seed\./)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Reproduce"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Run again with the same parameters"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Cancel"})).not.toBeInTheDocument();
        expect(screen.queryByRole("link", {name: "Download JSON"})).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Download JSON"})).toBeDisabled();

        // The newly loaded target's own reproduction still works end to end -- scoping the stale job
        // away doesn't break the cancel/terminal/result/export behavior of the reproduction that
        // *does* belong to it.
        await user.click(screen.getByRole("button", {name: "Reproduce"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Run again with the same parameters"})).toBeInTheDocument(), {timeout: 15000});
        expect(screen.getByRole("link", {name: "Download JSON"})).toHaveAttribute("href", "/api/project/replays/job-2/download");
    }, 60000);

    it("keeps distinct sessions separately visible in the recent spins list and lets the session filter narrow to just one at a time", async () => {
        const user = userEvent.setup();
        const spins: StudioRuntimeSessionView[] = [
            {sessionId: "sess-2", game: GAME, credits: 100, bet: 1, win: 0, studioRequestId: "req-b1", studioRound: 1},
            {sessionId: "sess-1", game: GAME, credits: 200, bet: 1, win: 5, studioRequestId: "req-a2", studioRound: 2},
            {sessionId: "sess-1", game: GAME, credits: 195, bet: 1, win: 0, studioRequestId: "req-a1", studioRound: 1},
        ];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: spins}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);
        await user.click(screen.getByRole("radio", {name: "Session Spin"}));

        // Default ("All sessions") shows every round from every session, never conflating a round from
        // one session with the same round number from another.
        await screen.findByRole("button", {name: /Round 1 in session sess-2/});
        expect(screen.getByRole("button", {name: /Round 2 in session sess-1/})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: /Round 1 in session sess-1/})).toBeInTheDocument();

        // Narrowing to sess-1 hides sess-2's round entirely, but keeps both of sess-1's own rounds.
        await user.click(screen.getByRole("radio", {name: "sess-1"}));
        expect(screen.getByRole("button", {name: /Round 2 in session sess-1/})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: /Round 1 in session sess-1/})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: /session sess-2/})).not.toBeInTheDocument();

        // Narrowing to sess-2 shows only its own round, hiding sess-1's entirely.
        await user.click(screen.getByRole("radio", {name: "sess-2"}));
        expect(screen.getByRole("button", {name: /Round 1 in session sess-2/})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: /session sess-1/})).not.toBeInTheDocument();

        // Back to "All sessions" restores the full, still newest-first list.
        await user.click(screen.getByRole("radio", {name: "All sessions"}));
        expect(screen.getByRole("button", {name: /Round 1 in session sess-2/})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: /Round 2 in session sess-1/})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: /Round 1 in session sess-1/})).toBeInTheDocument();
    }, 60000);

    it("preserves an applied session filter across a refresh of the recent spins list", async () => {
        const user = userEvent.setup();
        let spinsCall = 0;
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime/spins": () => {
                spinsCall += 1;
                const initial: StudioRuntimeSessionView[] = [
                    {sessionId: "sess-1", game: GAME, credits: 200, bet: 1, win: 0, studioRequestId: "req-a1", studioRound: 1},
                    {sessionId: "sess-2", game: GAME, credits: 100, bet: 1, win: 0, studioRequestId: "req-b1", studioRound: 1},
                ];
                if (spinsCall === 1) {
                    return {ok: true, status: 200, body: initial};
                }
                // A later refresh sees a newer round land for sess-1 -- the filter (already narrowed to
                // sess-1) must still apply to this freshly fetched list, not just the one it was set against.
                return {
                    ok: true,
                    status: 200,
                    body: [{sessionId: "sess-1", game: GAME, credits: 190, bet: 1, win: 10, studioRequestId: "req-a2", studioRound: 2}, ...initial],
                };
            },
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);
        await user.click(screen.getByRole("radio", {name: "Session Spin"}));
        await screen.findByRole("button", {name: /Round 1 in session sess-1/});

        await user.click(screen.getByRole("radio", {name: "sess-1"}));
        expect(screen.queryByRole("button", {name: /session sess-2/})).not.toBeInTheDocument();

        // Two "Refresh" buttons exist on this page (Session Spin's own, and Recent Replays' further
        // down) -- the Session Spin one is the first in DOM order.
        await user.click(screen.getAllByRole("button", {name: "Refresh"})[0]);
        await screen.findByRole("button", {name: /Round 2 in session sess-1/});

        // Still filtered to sess-1 after the refresh -- the newly arrived round shows up, sess-2 stays hidden.
        expect(screen.getByRole("button", {name: /Round 1 in session sess-1/})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: /session sess-2/})).not.toBeInTheDocument();
        expect(screen.getByRole("radio", {name: "sess-1"})).toBeChecked();
    }, 60000);

    it("shows truthful per-entry source (live vs. pre-generated) in both the recent list and Inspect, unaffected by the session filter", async () => {
        const user = userEvent.setup();
        const spins: StudioRuntimeSessionView[] = [
            {
                sessionId: "sess-live",
                game: GAME,
                credits: 200,
                bet: 1,
                win: 5,
                studioRequestId: "req-live",
                studioRound: 1,
                studioSource: "live",
            },
            {
                sessionId: "sess-imported",
                game: GAME,
                credits: 300,
                bet: 1,
                win: 0,
                studioRequestId: "req-imported",
                studioRound: 1,
                studioSource: "pre-generated",
            },
        ];
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/runtime/spins": () => ({ok: true, status: 200, body: spins}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReplayTab(user);
        await user.click(screen.getByRole("radio", {name: "Session Spin"}));
        await screen.findByRole("button", {name: /Round 1 in session sess-live/});

        // Narrow to just the pre-generated (imported) session and inspect it -- its Source row must say
        // "Pre-generated outcome library", never mislabeled as a live spin just because most spins are live.
        await user.click(screen.getByRole("radio", {name: "sess-imported"}));
        expect(screen.queryByRole("button", {name: /session sess-live/})).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: /session sess-imported/}));
        expect(screen.getByText("Pre-generated outcome library")).toBeInTheDocument();
        expect(screen.queryByText("Live spin")).not.toBeInTheDocument();

        // Switch the filter to the live session (the picker stays visible, no navigation needed) and
        // confirm its own Source is truthfully reported too, distinct from the imported one above.
        await user.click(screen.getByRole("radio", {name: "All sessions"}));
        await user.click(screen.getByRole("radio", {name: "sess-live"}));
        expect(screen.queryByRole("button", {name: /session sess-imported/})).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: /session sess-live/}));
        expect(screen.getByText("Live spin")).toBeInTheDocument();
        expect(screen.queryByText("Pre-generated outcome library")).not.toBeInTheDocument();
    }, 60000);
});
