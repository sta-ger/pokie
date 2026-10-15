import {generatedMechanicsGame, replayModesBlueprint} from "../../../../../v2/fixtures/ExistingMechanicsGame";
import {useState} from "react";
import {ReplayRecorder} from "../../../../../../src/replay/ReplayRecorder";
import {transactionalRoundGame} from "../../../../../v2/fixtures/TransactionalRoundGame";
import {MantineProvider} from "@mantine/core";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {readFileSync} from "fs";
import path from "path";
import type {StudioReplayJobView, StudioRuntimeSessionView, StudioSimulationReportListEntry} from "../../../../../../cli/studio-client/src/api/types";
import {describeReplayProgress, describeReplayResult} from "../../../../../../cli/studio-client/src/domain/interpret/Replay";
import {ReplayTab, type ExpectedReplayState} from "../../../../../../cli/studio-client/src/components/project/ReplayTab";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import {useReplayPoll} from "../../../../../../cli/studio-client/src/hooks/useReplayPoll";
import {StudioPlayService} from "../../../../../../cli/studio/runtime/StudioPlayService";

// P5-POLISH-19: proves the real Studio Replay presentation entry point (ReplayTab -> RoundArtifactInspector
// -> GameScreenView -> CanonicalPlayerView -> cli/client/player's own DOM functions) actually renders the
// exact fixture round captured live from a real Studio Replay job -- not the shared player module mounted
// in isolation (see docs/phase5-evidence/p5-polish-19/README.md's own "Rendered, not just JSON" section for
// the prior round review correctly rejected). The fixture file loaded below is the unmodified capture from
// that same round's own evidence table (Studio Replay row): `POST /api/project/replays {round: 1, seed:
// "fixture-round"}`, polled to completion, against the after-fix `fixture-slot` package.
//
// The job is fed through the real `describeReplayProgress`/`describeReplayResult` view-model transforms
// (domain/interpret/Replay.ts) -- the same pure functions ReplayTab's own owning hook uses on a real API
// response -- rather than hand-typed literals standing in for them, and driven through the real
// "Recreate from seed" -> Load -> Run again user flow the Replay tab actually exposes, not a prop
// injected directly into a "loaded" state.
describe("ReplayTab renders a real captured Studio Replay round through the actual presentation chain", () => {
    function loadFixtureJob(): StudioReplayJobView {
        const fixturePath = path.resolve(
            __dirname,
            "../../../../../../docs/phase5-evidence/p5-polish-19/parity/after-fix-studio-replay-job.json",
        );
        return JSON.parse(readFileSync(fixturePath, "utf-8")) as StudioReplayJobView;
    }

    it("shows the 3x3 grid, the top-row line-1 win highlighted at [[0,0],[1,0],[2,0]], and the A/5 win detail", async () => {
        const user = userEvent.setup();
        const job = loadFixtureJob();
        expect(job.status).toBe("completed");
        // This historical browser capture predates ReplayDescriptor.credits.  A completed replay now
        // publishes the same post-round player balance StudioPlayService observed for this fixture;
        // keep the literal captured artifact/state while exercising that additive current DTO field.
        if (!job.descriptor) {
            throw new Error("Expected the fixture replay to include its completed descriptor.");
        }
        job.descriptor = {...job.descriptor, credits: 1004};
        const progress = describeReplayProgress(job);
        const result = describeReplayResult(job);
        expect(result).toBeDefined();

        const {container} = render(
            <MantineProvider>
                <ReplayTab
                    progress={progress}
                    result={result}
                    error={undefined}
                    onRun={() => undefined}
                    onCancel={() => undefined}
                    onRetry={() => undefined}
                    listView={{status: "empty"}}
                    listError={undefined}
                    onRefreshList={() => undefined}
                    onInspectStored={() => Promise.resolve()}
                    onCompareStored={() => undefined}
                    expected={{status: "empty"}}
                    onLoadExpectedFromPaste={() => undefined}
                    onClearExpected={() => undefined}
                    comparison={undefined}
                    recentSpins={{status: "empty"}}
                    recentSpinsError={undefined}
                    onRefreshRecentSpins={() => undefined}
                    recentRuns={{status: "empty"}}
                    recentRunsError={undefined}
                    onRefreshRecentRuns={() => undefined}
                    currentGame={job.descriptor?.game}
                />
            </MantineProvider>,
        );

        // "Recreate from seed" is the default source -- load the round/seed this job actually reproduced.
        expect(screen.getByText(/To inspect a round you just played, choose Session Spin/)).toBeInTheDocument();
        await user.clear(screen.getByLabelText(/Target round number in a new replay session/i));
        await user.type(screen.getByLabelText(/Target round number in a new replay session/i), String(job.round));
        await user.type(screen.getByLabelText(/^Seed \(optional\)$/i), job.seed ?? "");
        const load = screen.getByRole("button", {name: "Load"});
        expect(load).toHaveAttribute("type", "button");
        expect(load).toHaveAttribute("data-pokie-lifecycle", "precondition");
        expect(load).toHaveAttribute("data-pokie-lifecycle-operation", "replay-target");
        await user.click(load);

        // Reproducing plays a brand-new session forward -- this job's own result (the captured completed
        // replay, fed through the real interpret functions above) is what a real onRun's completion would
        // have produced, so clicking through to it renders that already-fetched result for real.
        const run = await screen.findByRole("button", {name: "Run again"});
        expect(run).toHaveAttribute("id", "replay-run");
        expect(run).toHaveAttribute("data-pokie-lifecycle", "operation");
        expect(run).toHaveAttribute("data-pokie-lifecycle-operation", "replay");
        await user.click(run);

        expect(await screen.findByText("line")).toBeInTheDocument();
        const lifecycleResult = container.querySelector('[data-pokie-lifecycle-result="replay"]');
        expect(lifecycleResult).toHaveAttribute("data-pokie-lifecycle-terminal", "completed");
        expect(lifecycleResult).toHaveAttribute("data-pokie-lifecycle-result-control", "replay-run");
        const replayArtifact = lifecycleResult?.querySelector('[data-pokie-lifecycle-artifact="replay-descriptor"]');
        expect(replayArtifact).toHaveAccessibleName("Download replay JSON");
        expect(replayArtifact).toHaveAttribute("href", expect.stringContaining(`/api/project/replays/${job.id}/download`));

        // Orientation: the real 3x3 grid (3 reels x 3 rows), symbols exactly as captured live.
        const cells = Array.from(container.querySelectorAll<HTMLElement>("[data-cell]"));
        expect(cells).toHaveLength(9);
        expect(job.descriptor?.screen).toEqual([
            ["A", "C", "A"],
            ["A", "A", "C"],
            ["A", "A", "A"],
        ]);

        // Top-row line 1 win highlighted at [[0,0],[1,0],[2,0]] (reelIndex, rowIndex) -- rendered with a
        // real, non-empty persistent highlight color -- while an unrelated cell stays unhighlighted.
        for (const [reelIndex, rowIndex] of [
            [0, 0],
            [1, 0],
            [2, 0],
        ]) {
            const cell = container.querySelector<HTMLElement>(`[data-cell="${rowIndex}:${reelIndex}"]`);
            expect(cell?.style.backgroundColor).not.toBe("");
        }
        const unwonCell = container.querySelector<HTMLElement>('[data-cell="1:0"]');
        expect(unwonCell?.style.backgroundColor).toBe("");

        // Replay reaches the same canonical player data through the descriptor's captured session
        // state: static A/B/C paytable, actual bet/mode, and not a win-derived partial table.
        expect(screen.getAllByText("A").length).toBeGreaterThan(0);
        expect(screen.getByText(/5\.00.*5\.00x stake/)).toBeInTheDocument();
        expect(screen.getAllByText("Symbol").length).toBeGreaterThan(1);
        expect(screen.getAllByText("B").length).toBeGreaterThan(0);
        expect(screen.getByText("Credits")).toBeInTheDocument();
        expect(screen.getByText("1004")).toBeInTheDocument();
        expect(screen.queryByText(/Paytable unavailable/i)).toBeNull();
    });

    it("keeps one selected session's round inspector navigable without repeating its session id in every row", async () => {
        const user = userEvent.setup();
        const spins = [
            {
                sessionId: "session-1",
                game: {id: "slot", name: "Slot", version: "1.0.0"},
                win: 2,
                studioRound: 1,
                studioRecordedAt: "2026-08-17T10:00:00.000Z",
                studioSource: "play" as const,
                studioOperation: "spin" as const,
            },
            {
                sessionId: "session-1",
                game: {id: "slot", name: "Slot", version: "1.0.0"},
                win: 8,
                studioRound: 2,
                studioRecordedAt: "2026-08-17T10:01:00.000Z",
                studioSource: "play" as const,
                studioOperation: "find-any-win" as const,
            },
        ];

        render(
            <MantineProvider>
                <ReplayTab
                    progress={undefined}
                    result={undefined}
                    error={undefined}
                    onRun={() => undefined}
                    onCancel={() => undefined}
                    onRetry={() => undefined}
                    listView={{status: "empty"}}
                    listError={undefined}
                    onRefreshList={() => undefined}
                    onInspectStored={() => Promise.resolve()}
                    onCompareStored={() => undefined}
                    expected={{status: "empty"}}
                    onLoadExpectedFromPaste={() => undefined}
                    onClearExpected={() => undefined}
                    comparison={undefined}
                    recentSpins={{status: "loaded", entries: spins}}
                    recentSpinsError={undefined}
                    onRefreshRecentSpins={() => undefined}
                    recentRuns={{status: "empty"}}
                    recentRunsError={undefined}
                    onRefreshRecentRuns={() => undefined}
                    currentGame={{id: "slot", version: "1.0.0"}}
                />
            </MantineProvider>,
        );

        await user.click(screen.getByRole("radio", {name: "Session Spin"}));
        const firstRound = screen.getByRole("button", {name: /Session 1.*Round 1.*Spin.*win 2.*2026/i});
        expect(firstRound).not.toHaveTextContent("session-1");
        await user.click(firstRound);
        expect(screen.getByText("Round 1 of 2")).toBeInTheDocument();
        expect(screen.getAllByText("Selected")).toHaveLength(2);

        await user.click(screen.getByRole("button", {name: "Next"}));
        expect(screen.getByText("Round 2 of 2")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: /Session 1.*Round 2.*Find any win.*win 8.*2026/i})).toHaveAttribute("aria-current", "true");
    });
});


describe("ReplayTab audit wiring", () => {
    function captureRecording() {
        const game = {...transactionalRoundGame(), getConfigHash: () => "component-model"};
        const recorder = new ReplayRecorder(),
            session = game.createSession({seed: "component"});
        const recording = recorder.recordAudit(game, session, [{kind: "spin", delivery: "stepwise", roundId: "component-round"}], {status: "calculated", sessionId: "component-session", durability: "detached"}, {seed: "component"});
        recorder.releaseAuditSession(session);
        return recording;
    }

    function AuditSurface({onRun = jest.fn(), onLoad = jest.fn(), failed = false, recovered = false}: {onRun?: jest.Mock; onLoad?: jest.Mock; failed?: boolean; recovered?: boolean}) {
        const [recording] = useState(captureRecording);
        const [recoveryRequest] = useState(() => recovered ? {round: recording.round, recording} : undefined);
        const [expected, setExpected] = useState<ExpectedReplayState>({status: "empty"});
        const job: StudioReplayJobView = {id: "failed-audit", status: "failed", round: 3, completedRounds: 1, durationMs: 1,
            startedAt: "2026-10-13T00:00:00Z", error: "audit-execution-mismatch at deliveries[1]", auditPrefix: recording.audit,
            nextCommand: {kind: "spin", delivery: "stepwise", continuation: {roundId: "component-round", cursor: 1}}};
        return <MantineProvider><ReplayTab progress={failed ? describeReplayProgress(job) : undefined} result={undefined} error={undefined}
            onRun={onRun} onCancel={() => undefined} onRetry={() => undefined} listView={{status: "empty"}} listError={undefined}
            onRefreshList={() => undefined} onInspectStored={() => Promise.resolve()} onCompareStored={() => undefined}
            expected={expected} onLoadExpectedFromPaste={raw => {
                onLoad(JSON.parse(raw));
                setExpected({status: "loaded", round: recording.round, seed: String(recording.seed), recording, artifactWarnings: []});
            }} onClearExpected={() => setExpected({status: "empty"})} comparison={undefined}
            recentSpins={{status: "loaded", entries: [{sessionId: "component-session", game: recording.game, win: recording.totalWin,
                studioRound: 1, studioRecordedAt: "2026-10-13T00:00:00Z", studioSource: "play", studioOperation: "spin", debug: {recording}}]}}
            recentSpinsError={undefined} onRefreshRecentSpins={() => undefined} recentRuns={{status: "empty"}} recentRunsError={undefined}
            onRefreshRecentRuns={() => undefined} currentGame={recording.game} recoveryRequest={recoveryRequest} /></MantineProvider>;
    }

    it("loads the full Recent Rounds recording and passes it unchanged into the reproduce action", async () => {
        const user = userEvent.setup(),
            onRun = jest.fn(),
            onLoad = jest.fn();
        render(<AuditSurface onRun={onRun} onLoad={onLoad} />);
        await user.click(screen.getByRole("radio", {name: "Session Spin"}));
        await user.click(screen.getByRole("button", {name: /Session 1.*Round 1.*Spin/}));
        await user.click(screen.getByRole("button", {name: "Load for audit replay"}));
        const loaded = onLoad.mock.calls[0][0];
        expect(loaded.audit.deliveries[0].command.roundId).toBe("component-round");
        await user.click(screen.getByRole("button", {name: "Reproduce"}));
        expect(onRun.mock.calls[0][6]).toEqual(loaded);
    });

    it("restores the original durable audit request for reproduction", async () => {
        const user = userEvent.setup(),
            onRun = jest.fn(),
            onLoad = jest.fn();
        render(<AuditSurface recovered onRun={onRun} onLoad={onLoad} />);
        await user.click(screen.getByRole("button", {name: "Reproduce"}));
        expect(onRun.mock.calls[0][6]).toEqual(onLoad.mock.calls[0][0]);
        expect(onRun.mock.calls[0][6].audit.deliveries[0].command.roundId).toBe("component-round");
    });

    it("presents a failed verified prefix and exact next continuation without offering a completed download", async () => {
        const user = userEvent.setup();
        render(<AuditSurface failed />);
        await user.click(screen.getByRole("radio", {name: "Recreate from seed"}));
        // Load enables the run/status surface; the retained failed status comes from the real transform.
        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(screen.getByRole("button", {name: "Run again"}));
        expect(screen.getByText(/Verified prefix: 1 deliveries.*Replay remains incomplete/)).toBeInTheDocument();
        expect(screen.getByText(/Next continuation: component-round, cursor 1/)).toBeInTheDocument();
        expect(screen.queryByRole("link", {name: "Download replay JSON"})).not.toBeInTheDocument();
    });
});

describe("F12 seeded package replay presentation", () => {
    it.each([false, true].flatMap(weighted => [
        {mode: "ante", round: 1, stake: 0.05 * 1.5},
        {mode: "buy", round: 1, stake: 0.5},
        {mode: "buy", round: 2, stake: 0},
        {mode: "buy", round: 3, stake: 0.5},
        {mode: "buy-more", round: 3, stake: 0},
        {mode: "buy-more", round: 4, stake: 0},
        {mode: "buy-more", round: 5, stake: 1.25},
    ].flatMap(input => [false, true].map(audit => ({...input, weighted, audit})))))("renders $mode step $round from the real producer (weighted=$weighted, audit=$audit)", async ({mode, round, stake, weighted, audit}) => {
        const user = userEvent.setup();
        const game = generatedMechanicsGame(replayModesBlueprint(weighted));
        let descriptor = new ReplayRecorder().record({game, seed: "review-fixed", round, betModeId: mode});
        let recordedSpin: StudioRuntimeSessionView | undefined;
        if (audit) {
            const service = new StudioPlayService(() => Promise.resolve(game));
            try {
                const created = await service.newSession("/audited-package");
                if (created.status !== "ok") throw new Error("No public Play session");
                let continuation: {roundId: string; cursor: number} | undefined;
                for (let index = 0; index < round; index++) {
                    const intent = continuation ? {requestId: `step-${index}`, delivery: "stepwise" as const, continuation}
                        : {requestId: `step-${index}`, roundId: `step-${index}`, delivery: "stepwise" as const};
                    const played = await service.spin(created.session.sessionId, "spin", undefined, continuation ? undefined : mode, intent);
                    if (played.status !== "ok") throw new Error(JSON.stringify(played));
                    recordedSpin = played.session;
                    const logical = played.session.logicalRound!;
                    continuation = logical.status === "pending" ? {roundId: logical.roundId, cursor: logical.cursor} : undefined;
                }
                descriptor = recordedSpin!.debug!.recording!;
            } finally {
                await service.reset();
            }
        }
        const job: StudioReplayJobView = {id: "f12-replay", status: "completed", round, seed: "review-fixed", modeName: mode,
            completedRounds: round, startedAt: "2026-10-14T00:00:00Z", durationMs: 0, descriptor};
        const result = describeReplayResult(job);
        expect(result?.artifact).toMatchObject({stake, betMode: mode});
        expect(result?.artifact?.canonicalArtifact).toEqual(descriptor.artifact);
        const downloaded = JSON.parse(JSON.stringify(descriptor)) as NonNullable<StudioReplayJobView["descriptor"]>;
        const spin: StudioRuntimeSessionView = recordedSpin ?? {
            sessionId: descriptor.sessionId, game: descriptor.game, credits: descriptor.credits, bet: 0.05,
            win: descriptor.artifact?.totalWin, studioRound: round, studioSource: "play", studioOperation: "spin",
            debug: {artifact: downloaded.artifact, recording: downloaded, stateBefore: descriptor.stateBefore, stateAfter: descriptor.stateAfter},
        };
        render(<MantineProvider><ReplayTab progress={describeReplayProgress(job)} result={result} error={undefined}
            onRun={() => undefined} onCancel={() => undefined} onRetry={() => undefined}
            listView={{status: "empty"}} listError={undefined} onRefreshList={() => undefined}
            onInspectStored={() => Promise.resolve()} onCompareStored={() => undefined}
            expected={{status: "empty"}} onLoadExpectedFromPaste={() => undefined} onClearExpected={() => undefined} comparison={undefined}
            recentSpins={{status: "loaded", entries: [spin]}} recentSpinsError={undefined} onRefreshRecentSpins={() => undefined}
            recentRuns={{status: "empty"}} recentRunsError={undefined} onRefreshRecentRuns={() => undefined} currentGame={descriptor.game} /></MantineProvider>);
        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(screen.getByRole("button", {name: "Run again"}));
        expect(screen.queryByText("Outcome library mode")).not.toBeInTheDocument();
        expect(screen.getByRole("row", {name: `Package bet mode ${mode}`})).toBeInTheDocument();
        if (audit) expect(screen.getByRole("row", {name: /Mode policy recorded-commands/})).toBeInTheDocument();
        expect(screen.getByRole("row", {name: `Bet mode ${mode}`})).toBeInTheDocument();
        const stakeRow = screen.getByRole("row", {name: `Stake ${String(stake)}`});
        expect(Number(within(stakeRow).getByRole("cell").textContent)).toBe(downloaded.artifact?.stake);
        const charged = screen.getByText("Charged mode").parentElement!;
        expect(within(charged).getByText(mode)).toBeInTheDocument();
        expect(screen.getByRole("link", {name: "Download replay JSON"})).toHaveAttribute("href", "/api/project/replays/f12-replay/download");
        expect(downloaded.artifact?.featureEvents).toContainEqual({type: "chargedBetMode", data: {id: mode}});

        await user.click(screen.getByRole("radio", {name: "Session Spin"}));
        await user.click(screen.getByRole("button", {name: new RegExp(`Session 1.*Round ${spin.studioRound}.*Spin`)}));
        if (audit) {
            expect(screen.getByText(/Full audit export/)).toBeInTheDocument();
            expect(screen.getByRole("button", {name: "Load for audit replay"})).toBeEnabled();
            expect(screen.queryByText(/Audit unavailable --/)).not.toBeInTheDocument();
        }
        expect(screen.getByRole("row", {name: `Stake ${String(stake)}`})).toBeInTheDocument();
        expect(screen.getByRole("row", {name: `Bet mode ${mode}`})).toBeInTheDocument();
        expect(within(screen.getByText("Charged mode").parentElement!).getByText(mode)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Download JSON"})).toBeEnabled();
        expect(Number(within(screen.getByRole("row", {name: `Stake ${String(stake)}`})).getByRole("cell").textContent)).toBe(downloaded.artifact?.stake);
    });
});

it("V2C-13 seeded replay shows the transformed outcome, multiplied amount and ordered-rule observations", async () => {
    const user = userEvent.setup();
    const blueprint = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../../../examples/blueprints/wild-transform.blueprint.json"), "utf8"));
    const game = generatedMechanicsGame(blueprint);
    const descriptor = new ReplayRecorder().record({game, seed: "31", round: 2});
    const job: StudioReplayJobView = {id: "modifier-replay", status: "completed", round: 2, seed: "31", completedRounds: 2, startedAt: "2026-10-15T00:00:00Z", durationMs: 0, descriptor};
    const {container} = render(<MantineProvider><ReplayTab progress={describeReplayProgress(job)} result={describeReplayResult(job)} error={undefined} onRun={() => undefined} onCancel={() => undefined} onRetry={() => undefined} listView={{status: "empty"}} listError={undefined} onRefreshList={() => undefined} onInspectStored={() => Promise.resolve()} onCompareStored={() => undefined} expected={{status: "empty"}} onLoadExpectedFromPaste={() => undefined} onClearExpected={() => undefined} comparison={undefined} recentSpins={{status: "empty"}} recentSpinsError={undefined} onRefreshRecentSpins={() => undefined} recentRuns={{status: "empty"}} recentRunsError={undefined} onRefreshRecentRuns={() => undefined} currentGame={descriptor.game} /></MantineProvider>);
    await user.click(screen.getByRole("button", {name: "Load"}));
    await user.click(screen.getByRole("button", {name: "Run again"}));
    expect(descriptor.totalWin).toBe(6); // cumulative across two steps
    expect(descriptor.artifact!.totalWin).toBe(3);
    expect(screen.getAllByText(/authored-wild-product ×6/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("screenModifiers").length).toBeGreaterThan(0);
    for (let reel = 0; reel < 3; reel++) expect(container.querySelector<HTMLElement>(`[data-cell="0:${reel}"]`)?.style.backgroundColor).not.toBe("");
    expect(screen.getByRole("link", {name: "Download replay JSON"})).toBeEnabled();
});


describe("Recent Simulation replay eligibility and rejected-start recovery", () => {
    function entry(id: string, seed?: string, workers = 1): StudioSimulationReportListEntry {
        return {id, seed, workers, status: "completed", game: {id, version: "1"}, requestedRounds: 12, actualRounds: 2,
            sampling: {unit: "completed-logical-round", acceptedSubrounds: 12, carriedSubrounds: 0, excludedSubrounds: 0, trajectories: "independent-session-per-worker"},
            startedAt: "2026-10-15T13:00:00Z", completedAt: "2026-10-15T13:00:01Z", durationMs: 1, hasWarnings: false};
    }

    it("blocks seedless and multi-worker reports, runs subround 3, and recovers from a rejected start without a phantom job", async () => {
        const user = userEvent.setup();
        const requests: Record<string, unknown>[] = [];
        const fetchImpl: FetchLike = (_url, init) => {
            if (init?.method === "POST") {
                requests.push(JSON.parse(String(init.body)));
                if (requests.length === 1) return Promise.resolve({ok: false, status: 400, json: () => Promise.resolve({error: "Unknown or incomplete simulation."})});
            }
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({id: "reused", status: "completed", round: 3, completedRounds: 3, durationMs: 1, startedAt: "2026-10-15T13:00:00Z"})});
        };
        function Harness() {
            const replay = useReplayPoll();
            return <ReplayTab progress={replay.progress} result={undefined} error={replay.error} onRun={(round, seed, simulationId, _keep, mode) => replay.run(round, seed, simulationId, mode)}
                onCancel={replay.cancel} onRetry={() => undefined} listView={{status: "empty"}} listError={undefined} onRefreshList={() => undefined}
                onInspectStored={() => Promise.resolve()} onCompareStored={() => undefined} expected={{status: "empty"}} onLoadExpectedFromPaste={() => undefined}
                onClearExpected={() => undefined} comparison={undefined} recentSpins={{status: "empty"}} recentSpinsError={undefined} onRefreshRecentSpins={() => undefined}
                recentRuns={{status: "loaded", entries: [entry("seedless"), entry("seeded", "retained"), entry("parallel", "retained", 2)]}} recentRunsError={undefined}
                onRefreshRecentRuns={() => undefined} currentGame={{id: "bounded-respins", version: "1"}} />;
        }
        render(<MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><Harness /></StudioApiProvider></MantineProvider>);
        await user.click(screen.getByRole("radio", {name: "Recent Simulation"}));
        await user.click(screen.getByRole("button", {name: /seedless v1/}));
        expect(screen.getByText(/This simulation has no recorded seed/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Load"})).toBeDisabled();
        expect(screen.queryByText("(freshly generated)")).not.toBeInTheDocument();
        expect(requests).toEqual([]);
        await user.click(screen.getByRole("button", {name: /parallel v1/}));
        expect(screen.getByText(/This simulation used multiple workers/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Load"})).toBeDisabled();
        await user.click(screen.getByRole("button", {name: /seeded v1/}));
        await user.clear(screen.getByRole("textbox", {name: "Subround"}));
        await user.type(screen.getByRole("textbox", {name: "Subround"}), "3");
        await user.click(screen.getByRole("button", {name: "Load"}));
        await user.click(screen.getByRole("button", {name: "Run again"}));
        await waitFor(() => expect(screen.getByText(/This replay request couldn't be completed/)).toBeInTheDocument());
        expect(screen.queryByText(/queued —/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Cancel"})).not.toBeInTheDocument();
        expect(requests[0]).toMatchObject({round: 3, seed: "retained", simulationId: "seeded"});
        await user.click(screen.getByRole("button", {name: "Run again"}));
        await screen.findByText(/completed — 3\/3 rounds/);
        expect(requests).toHaveLength(2);
        expect(requests[1]).toEqual(requests[0]);
        // Selecting another report must retire the loaded target and its completed result.
        await user.click(screen.getByRole("button", {name: /seedless v1/}));
        expect(screen.queryByText(/completed —/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Run again with the same parameters"})).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Load"})).toBeDisabled();
    });
});
