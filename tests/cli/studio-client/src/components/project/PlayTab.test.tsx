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
        // The player owns the readable win/payline affordances.  The structured artifact win table
        // stays behind "Inspect round artifact" instead of being a second, always-visible player view.
        expect(screen.getByRole("button", {name: "Line: 1, win: 5"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Line: 1"})).toBeInTheDocument();
        expect(screen.getAllByText("A").length).toBeGreaterThan(0);
        const totals = container.querySelector(".player-round-totals") as HTMLElement;
        expect(totals).not.toBeNull();
        expect(totals.textContent).toContain("Total win5.00");
        expect(totals.textContent).toContain("Payout multiplier5.00");
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

        expect(screen.getByText("Bet: 2")).toBeInTheDocument();
    });

    it("keeps a completed round and Play controls visible after a failed reset", () => {
        const previousSession: StudioRuntimeSessionView = {
            sessionId: "settled-session",
            game: {id: "reset-recovery", name: "Reset Recovery", version: "1.0.0"},
            credits: 1015,
            bet: 5,
            win: 15,
            availableBets: [1, 5],
            screen: [["cherry"]],
            debug: {artifactUnavailableReason: "Round details were not captured in this fixture."},
        };

        render(
            <MantineProvider>
                <PlayTab
                    session={{status: "error", message: "materialization failed", subject: "This session", previousSession}}
                    sessionId={previousSession.sessionId}
                    onNewSession={() => undefined}
                    onSpin={() => undefined}
                    onFindAnyWin={() => undefined}
                    onFindSymbolWin={() => undefined}
                    onFindFreeGames={() => undefined}
                />
            </MantineProvider>,
        );

        expect(screen.getByText("This session couldn't be completed. Try again. If it continues, start a new session and retry.")).toBeInTheDocument();
        expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Spin"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Find any win"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Reset Play session"})).toBeEnabled();
    });

    it("keeps a completed round visible beside progress while a reset or spin is loading", () => {
        const previousSession: StudioRuntimeSessionView = {
            sessionId: "settled-session",
            game: {id: "loading-recovery", name: "Loading Recovery", version: "1.0.0"},
            credits: 1015,
            bet: 5,
            win: 15,
            availableBets: [1, 5],
            screen: [["cherry"]],
            debug: {artifactUnavailableReason: "Round details were not captured in this fixture."},
        };

        render(
            <MantineProvider>
                <PlayTab
                    session={{status: "loading", previousSession}}
                    sessionId={previousSession.sessionId}
                    onNewSession={() => undefined}
                    onSpin={() => undefined}
                    onFindAnyWin={() => undefined}
                    onFindSymbolWin={() => undefined}
                    onFindFreeGames={() => undefined}
                />
            </MantineProvider>,
        );

        expect(screen.getByRole("status")).toHaveTextContent("Spinning…");
        expect(screen.getByText(/You won 15\.00/)).toBeInTheDocument();
    });

    it("keeps initial session creation in its loading state without a prior round", () => {
        render(
            <MantineProvider>
                <PlayTab
                    session={{status: "loading"}}
                    sessionId={undefined}
                    onNewSession={() => undefined}
                    onSpin={() => undefined}
                    onFindAnyWin={() => undefined}
                    onFindSymbolWin={() => undefined}
                    onFindFreeGames={() => undefined}
                />
            </MantineProvider>,
        );

        expect(screen.getByRole("status")).toHaveTextContent("Starting…");
        expect(screen.queryByText(/No round played yet/i)).toBeNull();
        expect(screen.queryByText(/You won/i)).toBeNull();
    });

    it("explains that starting Play needs no separate server setup", () => {
        render(
            <MantineProvider>
                <PlayTab
                    session={{status: "idle"}}
                    sessionId={undefined}
                    onNewSession={() => undefined}
                    onSpin={() => undefined}
                    onFindAnyWin={() => undefined}
                    onFindSymbolWin={() => undefined}
                    onFindFreeGames={() => undefined}
                />
            </MantineProvider>,
        );

        expect(screen.getByText("Play prepares this game for a real round and creates a session in Studio. Nothing else needs to be set up.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "New Play session"})).toBeInTheDocument();
    });
});
