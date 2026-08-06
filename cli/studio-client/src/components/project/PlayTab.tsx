import {Button, Text} from "@mantine/core";
import {useClipboard} from "@mantine/hooks";
import {useEffect} from "react";
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
// gameplay UI (reels, paytable, bet selection, win highlights) as a Play-local clone. Whenever this same
// shared `session` slot does carry a played round (e.g. one played from Runtime's own Spin, since Play and
// Runtime read the same session state -- see the effect below), "Last round" renders it through the exact
// RoundSummary/RoundArtifactInspector/GameScreenView chain Runtime's own "Inspect round" and Replay
// already use, so Play never grows its own bespoke screen/win/payline/paytable/feature presentation.
export function PlayTab({
    state,
    running,
    session,
    sessionId,
    onStart,
    onCreateSession,
}: {
    state: RuntimeStateView;
    running: boolean;
    session: Session;
    sessionId: string | undefined;
    onStart: (options: StartRuntimeOptions) => void;
    onCreateSession: (seed?: string, initialBalance?: number) => void;
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
    // auto-selected `selectedRound`; here, via the one session slot Play and Runtime already share, see
    // this component's own doc comment). `screen` is only ever present on a round's own response, never
    // on a plain create/get-session one (see StudioRuntimeSessionView's own doc comment) -- checking it
    // is what keeps this from showing a stale/misleading "Round complete" the moment a session is created.
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
                HTTP API (see this component's own doc comment) -- Studio never sees it, so this can only
                ever reflect a round played through this same shared `session` slot from elsewhere in
                Studio (Runtime's own Spin, or a round restored by id). It renders through the identical
                RoundSummary/RoundArtifactInspector/GameScreenView chain Runtime's "Inspect round" and
                Replay already use, rather than a Play-local re-presentation of the same screen/win/
                payline/paytable/feature data -- whenever this session does have one to show. */}
            <PageSection legend="Last round (from this Studio session)">
                {playedRound === undefined ? (
                    <EmptyState message="No round played through Studio yet this session -- spin using the player above (its rounds aren't visible to Studio), or from Runtime, and a round played from Runtime will appear here." />
                ) : (
                    <RoundSummary session={playedRound} />
                )}
            </PageSection>
        </div>
    );
}
