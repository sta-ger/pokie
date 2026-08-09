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

        // A pays 5 for this round -- RoundArtifactInspector's own win row, the actual payout evidence
        // Replay renders (RoundArtifact never carries the game's static paytable itself -- PaytableView
        // honestly reports "unavailable" here rather than fabricating a payout table, see
        // PaytableView.tsx's own doc comment -- so this line-1/A/5 win row is the real rendered proof
        // that this round's own A-symbol payout is 5, the same fact the CLI/package/examples captures
        // record).
        expect(screen.getAllByText("A").length).toBeGreaterThan(0);
        expect(screen.getByText(/5\.00.*5\.00x stake/)).toBeInTheDocument();
        expect(screen.getByText(/Paytable unavailable/i)).toBeInTheDocument();
    });
});
