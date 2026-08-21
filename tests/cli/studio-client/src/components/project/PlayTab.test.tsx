import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {readFileSync} from "fs";
import path from "path";
import type {StudioRuntimeSessionView} from "../../../../../../cli/studio-client/src/api/types";
import type {PlaySessionView} from "../../../../../../cli/studio-client/src/hooks/usePlaySession";
import {PlayTab} from "../../../../../../cli/studio-client/src/components/project/PlayTab";

// P5-POLISH-19: proves the real Studio Play presentation entry point (PlayTab -> RoundSummary ->
// RoundArtifactInspector -> GameScreenView -> CanonicalPlayerView -> cli/client/player's own DOM
// functions) actually renders the exact fixture round captured live from a real Studio Play session --
// not the shared player module mounted in isolation (see docs/phase5-evidence/p5-polish-19/README.md's
// own "Rendered, not just JSON" section for the prior round review correctly rejected). The fixture file
// loaded below is the unmodified capture from that same round's own evidence table (Studio Play row):
// `pokie studio --no-open`, a real `POST /api/project/play/session {seed: "fixture-round"}` then a real
// `POST /api/project/play/sessions/:id/spin` against the after-fix `fixture-slot` package.
//
// This test also caught a real bug while being written: PlayTab's own "has a round been played" gate
// used to read `session.session.screen`, a field no current GameSessionSerializer (video-slot or
// otherwise) ever actually publishes -- see PlayTab.tsx's own doc comment on `playedRound` for the fix
// (keys off `debug.artifact`/`debug.artifactUnavailableReason` instead, the one pair Studio's own
// "full" capture always attaches to a genuinely spun round). Every existing Play workflow test predates
// this file and never caught it because each one hand-injects a `screen` field into its fake fetch
// response instead of using a real, unmodified server capture (see e.g.
// ProjectDashboardPage.playWorkflow.test.tsx's own `sessionFor()` helper) -- this test uses the literal
// captured JSON instead, so it fails on the pre-fix gate and passes only once the fix is in place.
describe("PlayTab renders a real captured Studio Play round through the actual presentation chain", () => {
    function loadFixtureSession(): StudioRuntimeSessionView {
        const fixturePath = path.resolve(
            __dirname,
            "../../../../../../docs/phase5-evidence/p5-polish-19/parity/after-fix-studio-play-spin.json",
        );
        const captured = JSON.parse(readFileSync(fixturePath, "utf-8")) as {status: "ok"; session: StudioRuntimeSessionView};
        return captured.session;
    }

    it("shows the 3x3 grid, the top-row line-1 win highlighted at [[0,0],[1,0],[2,0]], and the A/5 win detail", () => {
        const fixtureSession = loadFixtureSession();
        const session: PlaySessionView = {status: "ok", session: fixtureSession};

        const {container} = render(
            <MantineProvider>
                <PlayTab
                    session={session}
                    sessionId={fixtureSession.sessionId}
                    onNewSession={() => undefined}
                    onSpin={() => undefined}
                    onFindAnyWin={() => undefined}
                    onFindSymbolWin={() => undefined}
                    onFindFreeGames={() => undefined}
                />
            </MantineProvider>,
        );

        // The round actually renders -- not the "No round played yet" empty state a broken
        // has-a-round-been-played gate would otherwise show for this exact, real, unmodified capture.
        expect(screen.queryByText(/No round played yet/i)).toBeNull();

        // Orientation: the real 3x3 grid (3 reels x 3 rows), symbols exactly as captured live.
        const cells = Array.from(container.querySelectorAll<HTMLElement>("[data-cell]"));
        expect(cells).toHaveLength(9);
        expect(fixtureSession.reelsSymbols).toEqual([
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

        // Static player data comes from the captured session's initial payload -- the same serializer
        // payload the generated client uses -- not from the round's winning lines.  The fixture's full
        // A/B/C table and its actual post-spin balance must therefore render beside the canonical grid.
        expect(screen.getByText("line")).toBeInTheDocument();
        expect(screen.getAllByText("A").length).toBeGreaterThan(0);
        expect(screen.getByText(/5\.00.*5\.00x stake/)).toBeInTheDocument();
        expect(screen.getAllByText("Symbol").length).toBeGreaterThan(1);
        expect(screen.getAllByText("B").length).toBeGreaterThan(0);
        expect(screen.getByText("Credits")).toBeInTheDocument();
        expect(screen.getByText("1004")).toBeInTheDocument();
        expect(screen.queryByText(/Paytable unavailable/i)).toBeNull();
    });

    it("renders the Bet control when a session payload repeats an available bet", () => {
        const session: PlaySessionView = {
            status: "ok",
            session: {
                sessionId: "duplicate-bet-session",
                game: {id: "duplicate-bet", name: "Duplicate Bet", version: "1.0.0"},
                credits: 1000,
                bet: 2,
                availableBets: [2, 2],
            },
        };

        render(
            <MantineProvider>
                <PlayTab
                    session={session}
                    sessionId={session.session.sessionId}
                    onNewSession={() => undefined}
                    onSpin={() => undefined}
                    onFindAnyWin={() => undefined}
                    onFindSymbolWin={() => undefined}
                    onFindFreeGames={() => undefined}
                />
            </MantineProvider>,
        );

        expect(screen.getByRole("combobox", {name: "Bet"})).toHaveValue("2.00");
    });
});
