import {Button, Text} from "@mantine/core";
import {useClipboard} from "@mantine/hooks";
import {useEffect, useRef} from "react";
import type {StartRuntimeOptions} from "../../api/apiClient";
import {describeRuntimeActionError} from "../../domain/runtimeActionError";
import type {RuntimeSessionResultView, RuntimeSpinResultView, RuntimeStateView} from "../../domain/interpret/Runtime";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RoundSummary} from "../common/RoundSummary";

type Session = RuntimeSessionResultView | RuntimeSpinResultView;

// Play's own defaults when it has to start the runtime itself -- the same "debug on, in-memory
// sessions" defaults RuntimeTab's own Start form ships with (see that form's own doc comment). A user
// who wants a fixed port, file-backed sessions, or a pinned seed still configures and starts the
// runtime from Runtime -- Play always attaches to whatever is already running instead of starting a
// second, conflicting instance (see the effect below, gated on `running`, never on "did Play itself
// start this").
const DEFAULT_PLAY_START_OPTIONS: StartRuntimeOptions = {debug: true, repositoryMode: "memory"};

// How often Play silently re-GETs the session while the embedded player is up -- see
// onRefreshSession's own doc comment on why a GET is what picks up a round played through the
// iframe at all. Short enough that "Last round" catches up soon after an actual spin without feeling
// stale, long enough not to spam the runtime with a request every render.
const SESSION_POLL_INTERVAL_MS = 2000;

// Studio's own "normal game mode" -- unlike Runtime (an HTTP API testing/diagnostics harness: raw
// session JSON, manual spin requestId/version overrides, retry/debug), Play never talks to the runtime
// API itself. It materializes/starts (or attaches to an already-running) runtime, creates or restores
// exactly one session through Studio's own API (so Runtime's "Current session"/round history keep
// showing the same session Play is using -- see the effect below), and then hands off entirely to the
// canonical player -- the same `pokie dev`/`pokie client`/Runtime's own "Open Player" surface -- embedded
// right here instead of opened in a separate tab. The player is given that exact session id via a
// `?session=` query param (see cli/client/sessionFlow.ts's own `ensureSession`), so it restores it
// instead of quietly creating a second, unrelated one of its own. Every actual round played from here on
// goes straight from the embedded player to the runtime's real HTTP API, same as "Open Player" always
// has -- Studio itself is never in that request path, so this never reimplements the player's own
// gameplay UI (reels, paytable, bet selection, win highlights) as a Play-local clone. Studio does still
// find out about that round, though: the runtime persists every round's screen/win/bet as part of the
// session's own state (see PokieDevServer's own mergeSerializedPayloads() doc comment), so a plain GET
// of the same session id -- which onRefreshSession issues on a short timer below, same as a round played
// from Runtime's own Spin (Play and Runtime read the same session state) -- picks it up too. Either way,
// "Last round" renders whatever `session` ends up holding through the exact
// RoundSummary/RoundArtifactInspector/GameScreenView chain Runtime's own "Inspect round" and Replay
// already use, so Play never grows its own bespoke screen/win/payline/paytable/feature presentation, and
// never recomputes what the runtime itself already produced.
export function PlayTab({
    state,
    running,
    session,
    sessionId,
    onStart,
    onCreateSession,
    onRefreshSession,
}: {
    state: RuntimeStateView;
    running: boolean;
    session: Session;
    sessionId: string | undefined;
    onStart: (options: StartRuntimeOptions) => void;
    onCreateSession: (seed?: string, initialBalance?: number) => void;
    onRefreshSession: () => void;
}) {
    const clipboard = useClipboard();

    // Fires exactly once per "no session yet" spell: `session.status` only ever returns to "idle" via
    // useRuntimeManager's own resetSession()/resetForProjectSwitch() (Stop, Restart, or a project
    // switch), so this never loops against a session create that already failed (status settles to
    // "error", not back to "idle") -- "Try again" below re-requests it explicitly instead.
    useEffect(() => {
        if (running && sessionId === undefined && session.status === "idle") {
            onCreateSession();
        }
    }, [running, sessionId, session.status, onCreateSession]);

    // Keeps `session` -- and so "Last round" below -- caught up with a round played straight through the
    // embedded canonical player: that player talks directly to the runtime's own HTTP API (see this
    // component's own doc comment), never through Studio, so nothing here is ever told about it the way
    // Runtime's own Spin tells this same shared session state. Polling the exact same GET
    // useRuntimeManager's own loadSession() issues is what closes that gap instead -- see
    // onRefreshSession's own doc comment for why a plain GET is enough. Scoped to exactly the span this
    // iframe is up (`running && sessionId !== undefined`, the same condition that renders it below), via
    // `onRefreshSession` itself (a ref so this effect's own cleanup/re-run never depends on that
    // callback's identity) rather than `setInterval`'s own callback capturing a stale one.
    const onRefreshSessionRef = useRef(onRefreshSession);
    useEffect(() => {
        onRefreshSessionRef.current = onRefreshSession;
    });
    useEffect(() => {
        if (!running || sessionId === undefined) {
            return undefined;
        }
        const timer = setInterval(() => onRefreshSessionRef.current(), SESSION_POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [running, sessionId]);

    if (!running) {
        return (
            <div>
                <Text size="sm" c="dimmed" mb="sm">
                    Play prepares this project (materializing a Blueprint into a runnable package first if needed), starts its runtime -- or
                    attaches to one already running from Runtime -- creates a session, and renders the exact same canonical player{" "}
                    <code>pokie dev</code>/<code>pokie client</code>/Runtime&apos;s own &quot;Open Player&quot; serve, right here.
                </Text>
                {state.status === "loading" && <LoadingState label="Starting…" />}
                {state.status === "error" && <ErrorState message={describeRuntimeActionError("The runtime server", state.message)} />}
                {state.status === "failed" && <ErrorState message={describeRuntimeActionError("The runtime server", state.error)} />}
                <QuickActions>
                    <Button loading={state.status === "loading"} onClick={() => onStart(DEFAULT_PLAY_START_OPTIONS)}>
                        Start playing
                    </Button>
                </QuickActions>
            </div>
        );
    }

    if (sessionId === undefined) {
        return (
            <div>
                {(session.status === "loading" || session.status === "idle") && <LoadingState label="Preparing your session…" />}
                {session.status === "error" && <ErrorState message={describeRuntimeActionError("This session", session.message)} />}
                {(session.status === "not-found" || session.status === "not-running") && <ErrorState message={session.message} />}
                {session.status !== "loading" && session.status !== "idle" && (
                    <QuickActions>
                        <Button onClick={() => onCreateSession()}>Try again</Button>
                    </QuickActions>
                )}
            </div>
        );
    }

    if (state.status !== "running") {
        // Unreachable in practice (sessionId only exists once a session was created against a running
        // runtime), but keeps this component honestly exhaustive against RuntimeStateView's own union
        // rather than asserting past it.
        return <EmptyState message="Waiting for the runtime to finish starting…" />;
    }

    const playerUrl = `${state.playerUrl}?session=${encodeURIComponent(sessionId)}`;

    // Whether `session` actually reflects a played round -- as opposed to the just-created session it
    // starts out as -- the same distinction Runtime's own "Inspect round" draws (there, via a never-
    // auto-selected `selectedRound`; here, via the one session slot Play, Runtime, and now a poll of the
    // embedded player's own session already share, see this component's own doc comment). `screen` is
    // never present on a fresh POST /sessions response, but is present on both a spin's own response and
    // a plain GET /sessions/:id once at least one round has been played (the runtime persists it as part
    // of the session's own state -- see PokieDevServer's own mergeSerializedPayloads() doc comment) --
    // checking it is what keeps this from showing a stale/misleading "Round complete" before any round
    // has actually been played this session.
    const playedRound = session.status === "ok" && session.session.screen !== undefined ? session.session : undefined;

    return (
        <div>
            <QuickActions>
                <Button variant="default" onClick={() => onCreateSession()}>
                    New game
                </Button>
                <Button component="a" variant="default" href={playerUrl} target="_blank" rel="noreferrer">
                    Open in a new tab
                </Button>
                <Button variant="default" onClick={() => clipboard.copy(state.baseUrl)}>
                    {clipboard.copied ? "Copied!" : "Copy server URL"}
                </Button>
            </QuickActions>
            <iframe
                key={sessionId}
                src={playerUrl}
                title="POKIE player"
                style={{width: "100%", height: "80vh", border: "1px solid var(--mantine-color-default-border)"}}
            />

            {/* Every round actually played goes straight from the embedded player to the runtime's own
                HTTP API (see this component's own doc comment) -- Studio is never in that request path,
                but the periodic onRefreshSession poll above (or a round played from elsewhere in Studio,
                e.g. Runtime's own Spin, since they share the same `session` slot) catches up on it within
                one poll tick. It renders through the identical RoundSummary/RoundArtifactInspector/
                GameScreenView chain Runtime's "Inspect round" and Replay already use, rather than a
                Play-local re-presentation of the same screen/win/payline/paytable/feature data --
                whenever this session does have one to show. */}
            <PageSection legend="Last round (from this Studio session)">
                {playedRound === undefined ? (
                    <EmptyState message="No round played through Studio yet this session -- spin using the player above, or from Runtime, and it will appear here within a few seconds." />
                ) : (
                    <RoundSummary session={playedRound} />
                )}
            </PageSection>
        </div>
    );
}
