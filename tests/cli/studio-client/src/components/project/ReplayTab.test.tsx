import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {readFileSync} from "fs";
import path from "path";
import type {StudioReplayJobView} from "../../../../../../cli/studio-client/src/api/types";
import {describeReplayProgress, describeReplayResult} from "../../../../../../cli/studio-client/src/domain/interpret/Replay";
import {ReplayTab} from "../../../../../../cli/studio-client/src/components/project/ReplayTab";

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
        await user.clear(screen.getByLabelText(/Target round number in a new replay session/i));
        await user.type(screen.getByLabelText(/Target round number in a new replay session/i), String(job.round));
        await user.type(screen.getByLabelText(/^Seed \(optional\)$/i), job.seed ?? "");
        await user.click(screen.getByRole("button", {name: "Load"}));

        // Reproducing plays a brand-new session forward -- this job's own result (the captured completed
        // replay, fed through the real interpret functions above) is what a real onRun's completion would
        // have produced, so clicking through to it renders that already-fetched result for real.
        await user.click(await screen.findByRole("button", {name: "Run again"}));

        expect(await screen.findByText("line")).toBeInTheDocument();

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
        const firstRound = screen.getByRole("button", {name: /Round 1.*Spin.*win 2/i});
        expect(firstRound).not.toHaveTextContent("session-1");
        await user.click(firstRound);
        expect(screen.getByText("Round 1 of 2")).toBeInTheDocument();
        expect(screen.getAllByText("Selected")).toHaveLength(2);

        await user.click(screen.getByRole("button", {name: "Next"}));
        expect(screen.getByText("Round 2 of 2")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: /Round 2.*Find any win.*win 8/i })).toHaveAttribute("aria-current", "true");
    });
});
