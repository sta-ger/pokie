import {Alert, Anchor, Badge, Button, Group, List, NumberInput, Progress, SegmentedControl, Table, Text, Textarea, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useEffect, useState} from "react";
import {useLocation} from "react-router-dom";
import {buildReplayDownloadUrl} from "../../api/apiClient";
import type {RoundArtifactJson, StudioRuntimeSessionView, StudioSimulationReportListEntry} from "../../api/types";
import {
    describeLoadedReplay,
    describeReplayEntryStatus,
    describeReplayReproducibility,
    describeRoundArtifact,
    describeStudioRoundOperation,
    describeStudioRoundSource,
    isReplayListEntryReproducible,
    type LoadedReplayCardView,
    type ReplayCapabilitiesView,
    type ReplayCapabilityStatus,
    type ReplayComparisonView,
    type ReplayListView,
    type ReplayProgressView,
    type ReplayResultView,
} from "../../domain/interpret/Replay";
import type {ReportListView} from "../../domain/interpret/Reports";
import {describeRuntimeScreen, type RecentSpinsListView} from "../../domain/interpret/Runtime";
import {describeReplayActionError} from "../../domain/replayActionError";
import {useConfirm} from "../../hooks/useConfirm";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {GameScreenView} from "../common/GameScreenView";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RoundArtifactInspector} from "../common/RoundArtifactInspector";

export type ExpectedReplayState =
    | {status: "empty"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {
          status: "loaded";
          round: number;
          seed?: string;
          artifact?: RoundArtifactJson;
          artifactWarnings: string[];
          stateBefore?: unknown;
          stateAfter?: unknown;
          // Whatever this record's own identity/timing is known to be -- a stored replay job's session/job
          // ids and completion time, or a pasted artifact's own round/session/timestamp fields, when
          // present. Threaded straight through to describeReplayComparison's "recorded" side summary
          // (ProjectDashboardPage.tsx) -- undefined only means the comparison shows an honest "identity not
          // recorded" rather than guessing at one.
          identity?: {label: string; seed?: string; timestamp?: number};
      };

// Two genuinely different kinds of source, kept as separate modes rather than folded into one picker
// state: "seedRound"/"simulation"/"artifact" all reproduce forward -- Reproduce below always creates a
// brand-new game session and replays it from round 1 through the target round (confirmed against
// StudioReplayExecutionService.run()), whether or not the seed happens to match something recorded
// before. "spin" is the opposite: an *existing* recorded round, looked up (not recreated) by the
// runtime session's own identity -- sessionId + studioRequestId (and studioRound as that session's own
// round index) -- with nothing to reproduce at all. Conflating the two would misrepresent a fresh
// replay as if it were retrieving the original round's actual history.
type FindMethod = "seedRound" | "artifact" | "spin" | "simulation";
type FindFormValues = {round: number; seed: string};

// Shown in place of the loaded card/action bar/result view below while the currently-selected
// source has nothing loaded yet -- one message per source rather than a single generic one, since
// what "load something" means differs by source (configure a round, paste/pick an artifact, pick a
// spin, pick a simulation round).
const SOURCE_EMPTY_PROMPT: Record<FindMethod, string> = {
    seedRound: "Load a round above to reproduce it.",
    artifact: "Paste a replay artifact, or pick one from Recent Replays above, to validate it.",
    spin: "Pick a spin above to view its details.",
    simulation: "Pick a simulation and round above to load it.",
};

// Short labels for the run result's own "Reproducibility" row -- distinct wording (never the exact
// COMPARISON_BANNER title RoundArtifactInspector renders for the same comparison, which stays the
// authoritative detail view just below) so the two never collide as duplicate text in the same page.
// Only "Replay Artifact" ever has a known prior result to compare against at all (see reproduceTarget's
// own doc comment) -- every other source's run is honestly "not verified" rather than silently omitting
// the row.
const COMPARISON_STATUS_LABEL: Record<ReplayComparisonView["status"], string> = {
    match: "Verified -- matches the recorded result",
    mismatch: "Verified -- differs from the recorded result",
    partial: "Incomplete -- every available dimension matches the recorded result, but some couldn't be checked",
    unavailable: "Exact comparison unavailable",
};

// The four capabilities the Loaded replay card below shows for every source -- same order regardless
// of which is actually available, so a reader can compare across a source switch without the rows
// reshuffling.
const CAPABILITY_ROWS: {key: keyof ReplayCapabilitiesView; label: string}[] = [
    {key: "inspectable", label: "Inspectable"},
    {key: "reproducible", label: "Reproducible"},
    {key: "comparable", label: "Comparable"},
    {key: "exportable", label: "Exportable"},
];

const CAPABILITY_STATUS_LABEL: Record<ReplayCapabilityStatus, string> = {
    available: "Available",
    bestEffort: "Best effort",
    unavailable: "Unavailable",
};

const CAPABILITY_STATUS_COLOR: Record<ReplayCapabilityStatus, string> = {
    available: "teal",
    bestEffort: "yellow",
    unavailable: "gray",
};

function downloadJsonBlob(filename: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

// Replay has no single sequential order shared by every source, so this doesn't use a Stepper (the
// previous design's Find -> Load -> Reproduce -> Inspect -> Export pages). "Session Spin" is already
// a recorded result with nothing to reproduce; "Replay Artifact" adds a validate-then-optionally-
// reproduce gate the other three don't have; "Recreate from seed"/"Recent Simulation" are fresh
// attempts with no prior result to compare against at all. Forcing all four through the same five-page
// sequence meant most sources skipped or faked pages that didn't apply to them (a permanently-
// disabled Reproduce page for Session Spin, an inert confirm page for the others). This instead
// renders one page: a source choice, that source's own configuration/load controls, then -- once
// loaded -- a card showing what's loaded, an action bar for whatever's actually available
// (reproduce/cancel/retry/export), and the result view inline, with nothing gated behind a click.
//
// `loadedForMethod`/`jobLoaded` are the two flags that tie the loaded card/action bar/progress/result
// section to the source and load action that produced it: `switchSource` (the source picker) and
// every per-source load action reset them, so a stale card, in-flight/terminal job, or result from a
// previous source or a previous load never lingers under a newly-picked one. `jobLoaded` in particular
// is what the shared action bar below keys off of instead of the parent's raw `progress`/`result`/
// `error` -- those are a single global in-flight-or-last-completed replay job the parent tracks across
// every source, so without this flag a terminal job from one target would keep presenting its
// retry/result/error as if it belonged to a different target loaded afterward.
export function ReplayTab({
    progress,
    result,
    error,
    onRun,
    onCancel,
    onRetry,
    listView,
    listError,
    onRefreshList,
    onInspectStored,
    onCompareStored,
    expected,
    onLoadExpectedFromPaste,
    onClearExpected,
    comparison,
    recentSpins,
    recentSpinsError,
    onRefreshRecentSpins,
    recentRuns,
    recentRunsError,
    onRefreshRecentRuns,
    currentGame,
}: {
    progress: ReplayProgressView | undefined;
    result: ReplayResultView | undefined;
    error: string | undefined;
    onRun: (round: number, seed: string | undefined, keepExpected?: boolean) => void;
    onCancel: () => void;
    onRetry: () => void;
    listView: ReplayListView;
    listError: string | undefined;
    onRefreshList: () => void;
    onInspectStored: (id: string) => Promise<void>;
    onCompareStored: (id: string) => void;
    expected: ExpectedReplayState;
    onLoadExpectedFromPaste: (raw: string) => void;
    onClearExpected: () => void;
    comparison: ReplayComparisonView | undefined;
    recentSpins: RecentSpinsListView;
    recentSpinsError: string | undefined;
    onRefreshRecentSpins: () => void;
    recentRuns: ReportListView;
    recentRunsError: string | undefined;
    onRefreshRecentRuns: () => void;
    // The currently loaded project's own game id/version — the "current" side of the version-mismatch
    // check in describeReplayReproducibility. Undefined only while the project header itself hasn't
    // loaded yet, in which case that check is simply skipped (never blocks on an absent value).
    currentGame: {id: string; version: string} | undefined;
}) {
    const confirm = useConfirm();
    const form = useForm<FindFormValues>({mode: "uncontrolled", initialValues: {round: 1, seed: ""}});
    // The landing side of the Runtime tab's "Debug this round in Replay & Debug" link
    // (`navigate("/project/replay", {state: {findMethod: "spin", sessionId, requestId}})`) -- read once,
    // at mount (this component remounts fresh on every tab switch, same as every other tab -- see
    // ProjectDashboardPage's own doc comment), so it only ever affects the landing right after that
    // navigation, never a later in-page interaction. `sessionId`/`requestId` (when both present) identify
    // one *specific* round among possibly several recent spins -- see the auto-select effect below,
    // which is what actually picks it out of `recentSpins` once that list is available.
    const locationState = useLocation().state as {findMethod?: FindMethod; sessionId?: string; requestId?: string} | null;
    const initialFindMethod = locationState?.findMethod ?? "seedRound";
    const autoSelectSpin = locationState?.sessionId !== undefined && locationState?.requestId !== undefined ? {sessionId: locationState.sessionId, requestId: locationState.requestId} : undefined;

    const [findMethod, setFindMethod] = useState<FindMethod>(initialFindMethod);
    // Which source a load action last actually completed for -- the loaded card/action bar/result
    // section below is gated on this matching `findMethod`. `markLoaded` is the only way it changes
    // outside of `switchSource` resetting it.
    const [loadedForMethod, setLoadedForMethod] = useState<FindMethod>();
    // Whether the parent's `progress`/`result`/`error` -- a single global in-flight-or-last-completed
    // replay job, not scoped to any source -- actually belongs to the currently loaded target. Only
    // ever set true by an action that ties a real job to that exact target: clicking Reproduce below
    // (which calls onRun for it), or the Recent Replays "Inspect" shortcut (which loads an already-
    // completed job for it directly, with nothing left to reproduce). Every fresh load resets it via
    // `markLoaded(method, false)`, which is what keeps a prior target's terminal progress/retry/error/
    // result from being presented as this target's state.
    const [jobLoaded, setJobLoaded] = useState(false);
    const [pending, setPending] = useState<{round: number; seed?: string}>();
    const [artifactText, setArtifactText] = useState("");
    const [selectedSpin, setSelectedSpin] = useState<StudioRuntimeSessionView>();
    const [selectedSimEntry, setSelectedSimEntry] = useState<StudioSimulationReportListEntry>();
    const [simRound, setSimRound] = useState(1);
    // Recent spins can span several distinct Studio runtime sessions (a new session created after a
    // restart, a restored session, etc.) all interleaved newest-first in one list -- this narrows that
    // list down to one session at a time so picking a round from a specific session isn't a matter of
    // scanning past every other session's rounds first. "all" (the default) shows the unfiltered list,
    // same newest-first order recentSpins already arrives in.
    const [spinSessionFilter, setSpinSessionFilter] = useState<string>("all");
    // Resets the filter back to "all" the moment its selected session no longer appears in the list at
    // all (e.g. its rounds aged out past StudioRuntimeManager.MAX_RECENT_SPINS) -- otherwise the picker
    // would be stuck silently showing an empty list with no way back to "all" other than knowing to
    // reopen this exact control and pick it by hand.
    useEffect(() => {
        if (recentSpins.status === "loaded" && spinSessionFilter !== "all" && !recentSpins.entries.some((entry) => entry.sessionId === spinSessionFilter)) {
            setSpinSessionFilter("all");
        }
    }, [recentSpins, spinSessionFilter]);

    // Gated on `jobLoaded` (not just `progress !== undefined`) so a prior target's still-active or
    // terminal job is never presented as the currently loaded target's state -- see `jobLoaded`'s own
    // doc comment above.
    const active = jobLoaded && progress !== undefined && (progress.status === "queued" || progress.status === "running");
    const terminal = jobLoaded && progress !== undefined && !active;

    // The Runtime tab's "Debug this round" handoff names one exact (sessionId, requestId) pair -- matched
    // against each entry's own `studioRequestId` (Studio's own bookkeeping, recorded regardless of debug
    // mode -- see StudioRuntimeSessionView's own doc comment -- unlike `debug.requestId`, which only
    // exists alongside the rest of the debug bundle). Re-checked on every `recentSpins` change rather than
    // only once, so landing here just before the page's own refresh (triggered by the spin that produced
    // this round) lands is still recovered once that refresh's data arrives -- and it stops checking for
    // good once a match is found, so it never overrides a selection the user made by hand afterward.
    //
    // recentSpins can genuinely not contain the exact round this handoff named -- e.g. it's bounded
    // (StudioRuntimeManager.MAX_RECENT_SPINS) and a burst of later spins pushed it out. `spinNotFound`
    // tracks that outcome so the Find controls can show an honest "no longer available" message instead
    // of silently sitting on an empty/generic picker forever with no explanation -- but only once a fetch
    // has actually *settled* into a real answer. While the list is still loading, or the fetch itself
    // failed, there's no answer yet either way, so this must stay false: a "not found" verdict is only
    // warranted after a successfully loaded list has been checked and genuinely doesn't contain the
    // target.
    const [spinNotFound, setSpinNotFound] = useState(false);
    useEffect(() => {
        if (!autoSelectSpin || selectedSpin !== undefined) {
            return;
        }
        if (recentSpins.status === "loading" || recentSpinsError !== undefined) {
            setSpinNotFound(false);
            return;
        }
        if (recentSpins.status !== "loaded") {
            setSpinNotFound(true);
            return;
        }
        const match = recentSpins.entries.find(
            (entry) => entry.sessionId === autoSelectSpin.sessionId && entry.studioRequestId === autoSelectSpin.requestId,
        );
        if (match) {
            setSelectedSpin(match);
            setLoadedForMethod("spin");
            setSpinNotFound(false);
        } else {
            setSpinNotFound(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recentSpins, recentSpinsError]);

    // Resets every per-source selection, plus the source-agnostic "expected artifact" the parent
    // owns, so a source switch can never leave a stale loaded card, in-flight reproduction, or result
    // behind under the newly-selected source.
    function switchSource(next: FindMethod): void {
        setFindMethod(next);
        setLoadedForMethod(undefined);
        setJobLoaded(false);
        setPending(undefined);
        setArtifactText("");
        setSelectedSpin(undefined);
        setSelectedSimEntry(undefined);
        setSimRound(1);
        setSpinSessionFilter("all");
        onClearExpected();
    }

    // `resultReady` distinguishes "just configured/validated, nothing reproduced yet" (false --
    // Recreate from seed/Recent Simulation loading a target, Replay Artifact validating) from "already has
    // a concrete result to show" (true -- only the Recent Replays "Inspect" shortcut, which loads a
    // completed result directly with no reproduce step at all). It doubles as the initial value of
    // `jobLoaded`: false correctly means this fresh target has no job of its own yet (any progress/
    // result still showing belongs to whatever was loaded before), true means the job now backing
    // `progress`/`result` genuinely is this target's.
    function markLoaded(method: FindMethod, resultReady: boolean): void {
        setLoadedForMethod(method);
        setJobLoaded(resultReady);
    }

    function loadTarget(round: number, seed: string | undefined): void {
        setPending({round, seed});
        markLoaded(findMethod, false);
    }

    const isCurrentSourceLoaded = findMethod === loadedForMethod;
    // Recreate from seed / Recent Simulation share one "loaded target" shape: the round/seed the user
    // configured, or -- reached via Recent Replays' "Inspect" shortcut, which loads a result directly
    // without going through Load -- the round/seed of the result itself.
    const target = pending ?? (result ? {round: result.round, seed: result.seed ?? undefined} : undefined);

    // Only a "Replay Artifact" record (pasted or picked from Recent Replays) carries known
    // seed/provenance to check up front — Recreate from seed/Recent Simulation are fresh attempts that never
    // claim to reproduce one *specific* prior result, and Session Spin has nothing to reproduce at all.
    const artifactReproducibility =
        expected.status === "loaded"
            ? describeReplayReproducibility({seed: expected.seed, artifact: expected.artifact, stateBefore: expected.stateBefore, stateAfter: expected.stateAfter}, currentGame)
            : undefined;

    // The round/seed to reproduce, shared across every non-spin source once its own load step has
    // produced one -- undefined until then, which is what gates the shared action bar/result view
    // below (Session Spin never has one at all: there's nothing to reproduce).
    let reproduceTarget: {round: number; seed: string | undefined} | undefined;
    if (findMethod === "artifact") {
        reproduceTarget = expected.status === "loaded" ? {round: expected.round, seed: expected.seed} : undefined;
    } else if (findMethod === "seedRound" || findMethod === "simulation") {
        reproduceTarget = target ? {round: target.round, seed: target.seed} : undefined;
    }
    const reproduceDisabled = findMethod === "artifact" && artifactReproducibility?.status === "blocked";
    // What the run result's own "Reproducibility" row (below) reports -- only "Replay Artifact" ever
    // has a known prior result loaded to actually compare a fresh run against (`comparison`, built from
    // `expected`); Recreate from seed/Recent Simulation are always a fresh forward replay with nothing to
    // compare, so their honest status is "not verified", never a guessed match/mismatch.
    const runReproducibilityLabel =
        findMethod === "artifact" && comparison
            ? COMPARISON_STATUS_LABEL[comparison.status]
            : "Not verified -- a fresh forward replay with no prior recorded result to compare against.";
    // Export is an action, not a page: always visible (disabled until there's something to export)
    // rather than gated behind navigating anywhere. Ready exactly once the *currently loaded* source
    // has something to export -- `isCurrentSourceLoaded` keeps this from staying enabled off a stale
    // spin/result left over from a source that's no longer selected.
    const exportReady =
        (findMethod === "spin" && isCurrentSourceLoaded && selectedSpin !== undefined) ||
        (findMethod !== "spin" && isCurrentSourceLoaded && jobLoaded && result !== undefined);

    // The Loaded replay card's single source of truth for source/identities/seed/version-hash/
    // timestamp/completeness/capabilities (requirement: every loaded replay is judged the same way,
    // regardless of source) -- undefined whenever nothing is actually loaded for the currently-selected
    // source, in which case SOURCE_EMPTY_PROMPT below covers it instead.
    let loadedReplayCard: LoadedReplayCardView | undefined;
    if (isCurrentSourceLoaded) {
        // Only a *finished* job's own result counts as "loaded" here -- a still-active (queued/running)
        // job belongs to the progress bar below, not to a card claiming a result is ready to inspect.
        const finishedResult = jobLoaded && !active ? result : undefined;
        if (findMethod === "spin" && selectedSpin) {
            loadedReplayCard = describeLoadedReplay({source: "spin", spin: selectedSpin, canExport: exportReady});
        } else if (findMethod === "artifact") {
            loadedReplayCard = describeLoadedReplay({
                source: "artifact",
                expected: expected.status === "loaded" ? {seed: expected.seed, artifact: expected.artifact} : {},
                reproducibility: artifactReproducibility,
                result: finishedResult,
                comparison,
                canExport: exportReady,
            });
        } else if ((findMethod === "seedRound" || findMethod === "simulation") && target) {
            loadedReplayCard = describeLoadedReplay({source: findMethod, target, currentGame, result: finishedResult, canExport: exportReady});
        }
    }

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Best-effort reproducibility: replay plays a fresh session forward from round 1 using the same seed, and
                matches exactly for deterministic games. A game whose logic doesn&apos;t depend solely on the seed (e.g. it
                reads external state) may not reproduce the original round.
            </Text>

            <SegmentedControl
                value={findMethod}
                onChange={(value) => switchSource(value as FindMethod)}
                data={[
                    {label: "Recreate from seed", value: "seedRound"},
                    {label: "Replay Artifact", value: "artifact"},
                    {label: "Session Spin", value: "spin"},
                    {label: "Recent Simulation", value: "simulation"},
                ]}
                mb="md"
                aria-label="Find method"
            />

            {findMethod === "seedRound" && (
                <form onSubmit={form.onSubmit((values) => loadTarget(values.round, values.seed.trim() || undefined))}>
                    <QuickActions>
                        {/* Confirmed against StudioReplayExecutionService.run(): Reproduce below creates a brand-new
                            game session (game.createSession()) and plays it forward through round 1, 2, ... up to
                            this number -- it never seeks into or looks up an existing session's history, so the
                            label/description here say so plainly rather than reading like a round lookup. */}
                        <NumberInput
                            label="Target round number in a new replay session"
                            description="Reproducing plays a brand-new session forward from round 1 up to this round -- it doesn't look up an existing recorded round."
                            min={1}
                            step={1}
                            required
                            {...form.getInputProps("round")}
                            key={form.key("round")}
                        />
                        <TextInput label="Seed (optional)" {...form.getInputProps("seed")} key={form.key("seed")} />
                        <Button type="submit">Load</Button>
                    </QuickActions>
                </form>
            )}

            {findMethod === "artifact" && (
                <div>
                    <Textarea
                        label="Paste a replay artifact JSON (downloaded from Export)"
                        minRows={6}
                        autosize
                        maxRows={16}
                        value={artifactText}
                        onChange={(event) => setArtifactText(event.currentTarget.value)}
                        mb="sm"
                    />
                    <QuickActions>
                        <Button
                            disabled={artifactText.trim() === ""}
                            onClick={() => {
                                onLoadExpectedFromPaste(artifactText);
                                markLoaded("artifact", false);
                            }}
                        >
                            Validate &amp; load
                        </Button>
                    </QuickActions>

                    <PageSection legend="Or pick from recent replays to reproduce & compare">
                        <QuickActions>
                            <Button variant="default" size="xs" onClick={onRefreshList}>
                                Refresh
                            </Button>
                        </QuickActions>
                        {listError && <ErrorState message={describeReplayActionError("The replay list", listError)} />}
                        {listView.status === "empty" && <EmptyState message="No replays run yet." />}
                        {listView.status === "loaded" && (
                            <List listStyleType="none" spacing={4}>
                                {listView.entries.map((entry) =>
                                    isReplayListEntryReproducible(entry) ? (
                                        <List.Item key={entry.id}>
                                            <Anchor
                                                component="button"
                                                type="button"
                                                onClick={() => {
                                                    onCompareStored(entry.id);
                                                    markLoaded("artifact", false);
                                                }}
                                                style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                            >
                                                {entry.game?.id ?? "?"} round {entry.round} — {describeReplayEntryStatus(entry.status)}
                                            </Anchor>
                                        </List.Item>
                                    ) : (
                                        <List.Item key={entry.id}>
                                            <Text size="sm" c="dimmed" style={{overflowWrap: "anywhere"}}>
                                                {entry.game?.id ?? "?"} round {entry.round} — {describeReplayEntryStatus(entry.status)} (reproduce
                                                unavailable — no recorded seed; use Recent replays below to inspect it instead)
                                            </Text>
                                        </List.Item>
                                    ),
                                )}
                            </List>
                        )}
                    </PageSection>
                </div>
            )}

            {findMethod === "spin" && (
                <div>
                    {spinNotFound && autoSelectSpin && selectedSpin === undefined && (
                        <Alert color="yellow" variant="light" title="Round no longer available" mb="sm">
                            The exact round handed off here (session {autoSelectSpin.sessionId}, request{" "}
                            {autoSelectSpin.requestId}) isn&apos;t available in the recent spin history anymore. Pick
                            a spin below instead, if it&apos;s still listed.
                        </Alert>
                    )}
                    <QuickActions>
                        <Button variant="default" size="xs" onClick={onRefreshRecentSpins}>
                            Refresh
                        </Button>
                    </QuickActions>
                    {recentSpins.status === "loading" && recentSpinsError === undefined && <LoadingState label="Loading recent spins…" />}
                    {recentSpinsError && <ErrorState message={describeReplayActionError("The spin list", recentSpinsError)} />}
                    {recentSpins.status === "empty" && (
                        <EmptyState message="No spins recorded yet in this Studio session — start the runtime and spin a session first." />
                    )}
                    {recentSpins.status === "loaded" && (
                        <div>
                            {/* Distinct session ids in first-seen order -- recentSpins.entries is already
                                newest-first, so this naturally lists the most recently active session first
                                too. Rendered even with a single session so the control never disappears out
                                from under an already-picked filter value (see the reset effect above). */}
                            <SegmentedControl
                                value={spinSessionFilter}
                                onChange={setSpinSessionFilter}
                                data={[
                                    {label: "All sessions", value: "all"},
                                    ...Array.from(new Set(recentSpins.entries.map((entry) => entry.sessionId))).map((sessionId) => ({
                                        label: sessionId,
                                        value: sessionId,
                                    })),
                                ]}
                                mb="sm"
                                aria-label="Filter by session"
                            />
                            {(() => {
                                const filteredSpins =
                                    spinSessionFilter === "all"
                                        ? recentSpins.entries
                                        : recentSpins.entries.filter((entry) => entry.sessionId === spinSessionFilter);
                                return filteredSpins.length === 0 ? (
                                    <EmptyState message="No spins recorded for the selected session." />
                                ) : (
                                    <List listStyleType="none" spacing={4}>
                                        {filteredSpins.map((entry) => (
                                            // `studioRound` (this session's own stable round index -- see
                                            // StudioRuntimeSessionView's own doc comment) makes this key stable across
                                            // a refresh, unlike the array index it replaces: a duplicate (sessionId,
                                            // studioRequestId) pair (an idempotency-protected retry) is deduplicated
                                            // into the *same* round by StudioRuntimeManager.recordRecentSpin() before
                                            // it ever reaches this list, so (sessionId, studioRound) alone is already
                                            // unique here -- never conflated with a legitimate round from a different
                                            // session, since the pairing always includes sessionId. Falling back to
                                            // studioRequestId (still per-session-unique by construction) covers an
                                            // entry that predates studioRound existing at all.
                                            <List.Item key={`${entry.sessionId}-${entry.studioRound ?? entry.studioRequestId ?? "unknown"}`}>
                                                <Anchor
                                                    component="button"
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedSpin(entry);
                                                        markLoaded("spin", false);
                                                    }}
                                                    style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                                >
                                                    Round {entry.studioRound ?? "?"} in session {entry.sessionId} — credits{" "}
                                                    {entry.credits ?? "—"}, win {entry.win ?? 0}
                                                    {entry.studioRequestId ? `, request ${entry.studioRequestId}` : ""}
                                                    {entry.studioRecordedAt ? `, ${new Date(entry.studioRecordedAt).toLocaleString()}` : ""}
                                                </Anchor>
                                            </List.Item>
                                        ))}
                                    </List>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}

            {findMethod === "simulation" && (
                <div>
                    <QuickActions>
                        <Button variant="default" size="xs" onClick={onRefreshRecentRuns}>
                            Refresh
                        </Button>
                    </QuickActions>
                    {recentRunsError && <ErrorState message={describeReplayActionError("The simulation list", recentRunsError)} />}
                    {recentRuns.status === "empty" && <EmptyState message="No completed simulations yet." />}
                    {recentRuns.status === "loaded" && (
                        <List listStyleType="none" spacing={4} mb="sm">
                            {recentRuns.entries.map((entry) => (
                                <List.Item key={entry.id}>
                                    <Anchor
                                        component="button"
                                        type="button"
                                        onClick={() => {
                                            setSelectedSimEntry(entry);
                                            setSimRound(1);
                                        }}
                                        style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                    >
                                        {entry.game.id} v{entry.game.version} — seed {entry.seed ?? "(none)"}, {entry.actualRounds} rounds,{" "}
                                        {new Date(entry.startedAt).toLocaleString()}
                                    </Anchor>
                                </List.Item>
                            ))}
                        </List>
                    )}
                    {selectedSimEntry && (
                        <QuickActions>
                            <NumberInput
                                label="Round"
                                min={1}
                                max={selectedSimEntry.actualRounds}
                                step={1}
                                value={simRound}
                                onChange={(value) => setSimRound(typeof value === "number" ? value : 1)}
                            />
                            <Button onClick={() => loadTarget(simRound, selectedSimEntry.seed)}>Load</Button>
                        </QuickActions>
                    )}
                </div>
            )}

            {isCurrentSourceLoaded ? (
                <div>
                    {loadedReplayCard &&
                        (() => {
                            const card: LoadedReplayCardView = loadedReplayCard;
                            return (
                                <PageSection legend="Loaded replay">
                                    <Table withRowBorders={false} mb="sm">
                                        <Table.Tbody>
                                            <Table.Tr>
                                                <Table.Th>Source</Table.Th>
                                                <Table.Td>{card.source}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Identities</Table.Th>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{card.identities}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Seed</Table.Th>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{card.seed}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Version / hash</Table.Th>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{card.versionHash}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Timestamp</Table.Th>
                                                <Table.Td>{card.timestamp}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Completeness</Table.Th>
                                                <Table.Td>{card.completeness}</Table.Td>
                                            </Table.Tr>
                                            {CAPABILITY_ROWS.map(({key, label}) => (
                                                <Table.Tr key={key}>
                                                    <Table.Th>{label}</Table.Th>
                                                    <Table.Td>
                                                        <Badge size="xs" variant="light" color={CAPABILITY_STATUS_COLOR[card.capabilities[key].status]} mr={6}>
                                                            {CAPABILITY_STATUS_LABEL[card.capabilities[key].status]}
                                                        </Badge>
                                                        {card.capabilities[key].reason}
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                </PageSection>
                            );
                        })()}

                    {findMethod === "spin" && selectedSpin && (
                        <div>
                            {/* The Loaded replay card's Reproducible row above already says there's nothing to reproduce;
                                its Identities/Timestamp rows already name the session/round/request/recorded-at/source. */}
                            {selectedSpin.debug?.artifact ? (
                                // A complete RoundArtifact was captured for this exact spin (see
                                // StudioRuntimeManager.buildSessionView/buildPreGeneratedSessionView) -- the same
                                // inspector Replay Artifact/Recreate from seed/Recent Simulation results already use,
                                // so a recorded spin is inspected the identical way rather than through a bespoke
                                // raw-JSON view. `credits` is passed through separately since it's a wallet/session
                                // concept RoundArtifact itself never carries.
                                <RoundArtifactInspector
                                    artifact={describeRoundArtifact(selectedSpin.debug.artifact)}
                                    stateBefore={selectedSpin.debug.stateBefore}
                                    stateAfter={selectedSpin.debug.stateAfter}
                                    credits={selectedSpin.credits}
                                />
                            ) : (
                                <div>
                                    {selectedSpin.debug?.artifactUnavailableReason && (
                                        <Alert color="yellow" variant="light" title="Round artifact unavailable" mb="sm">
                                            <Text size="sm">{selectedSpin.debug.artifactUnavailableReason}</Text>
                                        </Alert>
                                    )}
                                    <Table withRowBorders={false} mb="sm">
                                        <Table.Tbody>
                                            <Table.Tr>
                                                <Table.Th>Game</Table.Th>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>
                                                    {selectedSpin.game.name} (id: &quot;{selectedSpin.game.id}&quot;, v{selectedSpin.game.version})
                                                </Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Session</Table.Th>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{selectedSpin.sessionId}</Table.Td>
                                            </Table.Tr>
                                            {selectedSpin.studioRound !== undefined && (
                                                <Table.Tr>
                                                    <Table.Th>Round</Table.Th>
                                                    <Table.Td>
                                                        Round {selectedSpin.studioRound} in session {selectedSpin.sessionId} -- this session&apos;s own
                                                        round count, not a global one.
                                                    </Table.Td>
                                                </Table.Tr>
                                            )}
                                            {selectedSpin.studioRequestId && (
                                                <Table.Tr>
                                                    <Table.Th>Request id</Table.Th>
                                                    <Table.Td style={{overflowWrap: "anywhere"}}>{selectedSpin.studioRequestId}</Table.Td>
                                                </Table.Tr>
                                            )}
                                            {selectedSpin.studioRecordedAt && (
                                                <Table.Tr>
                                                    <Table.Th>Recorded</Table.Th>
                                                    <Table.Td>{new Date(selectedSpin.studioRecordedAt).toLocaleString()}</Table.Td>
                                                </Table.Tr>
                                            )}
                                            {selectedSpin.studioSource && (
                                                <Table.Tr>
                                                    <Table.Th>Source</Table.Th>
                                                    <Table.Td>{describeStudioRoundSource(selectedSpin.studioSource)}</Table.Td>
                                                </Table.Tr>
                                            )}
                                            {selectedSpin.studioOperation && (
                                                <Table.Tr>
                                                    <Table.Th>Operation</Table.Th>
                                                    <Table.Td>{describeStudioRoundOperation(selectedSpin.studioOperation)}</Table.Td>
                                                </Table.Tr>
                                            )}
                                            <Table.Tr>
                                                <Table.Th>Credits</Table.Th>
                                                <Table.Td>{selectedSpin.credits ?? "—"}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Bet</Table.Th>
                                                <Table.Td>{selectedSpin.bet ?? "—"}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Win</Table.Th>
                                                <Table.Td>{selectedSpin.win ?? 0}</Table.Td>
                                            </Table.Tr>
                                        </Table.Tbody>
                                    </Table>

                                    {selectedSpin.screen ? (
                                        <GameScreenView screen={describeRuntimeScreen(selectedSpin.screen) ?? []} />
                                    ) : (
                                        <Text size="sm" c="dimmed">
                                            No screen available.
                                        </Text>
                                    )}

                                    <AdvancedDisclosure detail="raw JSON, debug data, raw state">
                                        {selectedSpin.debug?.debugData && (
                                            <div>
                                                <Group gap="xs" mb={4}>
                                                    <Text size="sm" fw={600}>
                                                        Debug data
                                                    </Text>
                                                    <Badge size="xs" variant="light">
                                                        game-provided, may include RNG/reel-stop data
                                                    </Badge>
                                                </Group>
                                                <CodeBlock>{JSON.stringify(selectedSpin.debug.debugData, null, 2)}</CodeBlock>
                                            </div>
                                        )}
                                        {(selectedSpin.debug?.stateBefore !== undefined || selectedSpin.debug?.stateAfter !== undefined) && (
                                            <div>
                                                {selectedSpin.debug?.stateBefore !== undefined && (
                                                    <div>
                                                        <Text size="sm" fw={600} mt="sm" mb={4}>
                                                            Raw state before
                                                        </Text>
                                                        <CodeBlock>{JSON.stringify(selectedSpin.debug.stateBefore, null, 2)}</CodeBlock>
                                                    </div>
                                                )}
                                                {selectedSpin.debug?.stateAfter !== undefined && (
                                                    <div>
                                                        <Text size="sm" fw={600} mt="sm" mb={4}>
                                                            Raw state after
                                                        </Text>
                                                        <CodeBlock>{JSON.stringify(selectedSpin.debug.stateAfter, null, 2)}</CodeBlock>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <Text size="sm" fw={600} mt="sm" mb={4}>
                                            Full session view
                                        </Text>
                                        <CodeBlock>{JSON.stringify(selectedSpin, null, 2)}</CodeBlock>
                                    </AdvancedDisclosure>
                                </div>
                            )}
                        </div>
                    )}

                    {findMethod === "artifact" && (
                        <div>
                            {expected.status === "loading" && <LoadingState label="Validating artifact…" />}
                            {expected.status === "error" && <ErrorState message={expected.message} />}
                            {expected.status === "loaded" && (
                                <div>
                                    <Text size="sm" mb="xs">
                                        Round {expected.round}, seed {expected.seed ?? "(none)"}.
                                    </Text>
                                    {expected.artifactWarnings.length > 0 && (
                                        <List size="sm" mb="sm">
                                            {expected.artifactWarnings.map((warning, index) => (
                                                <List.Item key={index}>{warning}</List.Item>
                                            ))}
                                        </List>
                                    )}
                                    {artifactReproducibility?.status === "bestEffort" && (
                                        <Alert color="blue" variant="light" title="Best effort only -- not verifiable" mb="sm">
                                            <Text size="sm">{artifactReproducibility.reason}</Text>
                                        </Alert>
                                    )}
                                    {artifactReproducibility?.status === "blocked" && (
                                        <Alert color="yellow" variant="light" title="Reproduce isn't reliable for this round" mb="sm">
                                            <Text size="sm">{artifactReproducibility.reason}</Text>
                                            <Text size="sm" mt={4}>
                                                {artifactReproducibility.remediation}
                                            </Text>
                                        </Alert>
                                    )}
                                    {/* The recorded round itself, inspected through the same RoundArtifactInspector
                                        every other source uses -- available the moment this record is loaded, never
                                        gated behind clicking Reproduce below. `comparison` is intentionally omitted
                                        here: there is nothing to compare against yet, only once Reproduce actually
                                        produces a recreated result (see the reproduced-result inspector further
                                        down, which does carry `comparison`). A malformed artifact (artifactWarnings
                                        non-empty) is never rendered here -- the warnings above already explain why. */}
                                    {expected.artifact && expected.artifactWarnings.length === 0 && (
                                        <RoundArtifactInspector
                                            artifact={describeRoundArtifact(expected.artifact)}
                                            stateBefore={expected.stateBefore}
                                            stateAfter={expected.stateAfter}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {(findMethod === "seedRound" || findMethod === "simulation") && target && (
                        <div>
                            <Text size="sm" mb={4}>
                                Round {target.round}, seed {target.seed ?? "(none)"}.
                            </Text>
                            {/* The pre-run summary: honest about what Reproduce below actually does (confirmed
                                against StudioReplayExecutionService.run()) -- a brand-new game session, played
                                forward from round 1 through the target round. Never a lookup of any existing
                                session/round, even when the seed matches one that was recorded before. */}
                            <Text size="sm" c="dimmed" mb="sm">
                                Reproducing will create a new replay session and play it forward from round 1 through
                                round {target.round}, using {target.seed ? `seed "${target.seed}"` : "a freshly generated seed"}, to
                                reach round {target.round}.
                            </Text>
                        </div>
                    )}

                    {/* Shared action bar + progress + result view for every non-spin source once its own
                        controls above have produced a concrete round/seed to reproduce -- Session Spin
                        never reaches here (its own block above is self-contained: nothing to reproduce,
                        nothing to gate). */}
                    {findMethod !== "spin" && reproduceTarget && (
                        <div>
                            <QuickActions>
                                {!jobLoaded && (
                                    <Button
                                        disabled={reproduceDisabled}
                                        onClick={() => {
                                            onRun(reproduceTarget.round, reproduceTarget.seed, findMethod === "artifact" ? true : undefined);
                                            setJobLoaded(true);
                                        }}
                                    >
                                        {/* Only "Replay Artifact" ever names one specific recorded round this run
                                            claims to reproduce -- Recreate from seed/Recent Simulation are always a
                                            fresh parameterized run with no recorded round behind it (see
                                            runReproducibilityLabel's own doc comment), so "Reproduce" would overstate
                                            what's actually happening for them. */}
                                        {findMethod === "artifact" ? "Reproduce" : "Run again"}
                                    </Button>
                                )}
                                {active && (
                                    <Button color="red" variant="light" onClick={() => confirm("Cancel the running replay?", onCancel)}>
                                        Cancel
                                    </Button>
                                )}
                                {terminal && (
                                    <Button variant="default" onClick={onRetry}>
                                        Run again with the same parameters
                                    </Button>
                                )}
                            </QuickActions>

                            {jobLoaded && progress !== undefined && (
                                <div>
                                    {progress.status === "failed" && error === undefined && (
                                        <Alert
                                            color="red"
                                            variant="light"
                                            role="alert"
                                            title={findMethod === "artifact" ? "Reproduce failed" : "Run failed"}
                                            mb="sm"
                                            style={{overflowWrap: "anywhere"}}
                                        >
                                            <Text size="sm" mb="xs">
                                                The replay session hit an error partway through -- most likely a bug in the game&apos;s own logic
                                                triggered by this seed/round, not something wrong with Replay itself. &quot;Run again with the same
                                                parameters&quot; below retries it as-is.
                                            </Text>
                                            <AdvancedDisclosure detail="server message">
                                                <Text size="sm">{progress.error ?? "Replay failed."}</Text>
                                            </AdvancedDisclosure>
                                        </Alert>
                                    )}
                                    {error && <ErrorState message={describeReplayActionError("This replay request", error)} />}
                                    <Text size="sm" mb={4}>
                                        {progress.status} — {progress.completedRounds}/{progress.round} rounds
                                    </Text>
                                    <Progress value={progress.percent} mb="sm" />
                                </div>
                            )}

                            {/* The run's own record, honest about what actually ran (see runReproducibilityLabel's
                                own doc comment): the actual newly-created replay session this run produced (never
                                the job/request id -- see result.sessionId's own doc comment), the round the caller
                                asked for vs. the round the session actually reached, the seed used, when it ran, and
                                whether it was ever checked against a known-good prior result. Shown once for
                                every source here rather than duplicated per-branch below (RoundArtifactInspector
                                itself is shared with Runtime/Deployment and has no notion of a "replay session"
                                to show this for). */}
                            {jobLoaded && !active && result && (
                                <Table withRowBorders={false} mb="sm">
                                    <Table.Tbody>
                                        <Table.Tr>
                                            <Table.Th>Replay session</Table.Th>
                                            <Table.Td style={{overflowWrap: "anywhere"}}>{result.sessionId}</Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Replay job</Table.Th>
                                            <Table.Td style={{overflowWrap: "anywhere"}}>{result.id}</Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Requested round</Table.Th>
                                            <Table.Td>{reproduceTarget.round}</Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Actual round reached</Table.Th>
                                            <Table.Td>{result.round}</Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Seed</Table.Th>
                                            <Table.Td>{result.seed ?? "(none)"}</Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Run at</Table.Th>
                                            <Table.Td>{new Date(result.timestamp).toLocaleString()}</Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Reproducibility</Table.Th>
                                            <Table.Td>{runReproducibilityLabel}</Table.Td>
                                        </Table.Tr>
                                    </Table.Tbody>
                                </Table>
                            )}

                            {jobLoaded && !active && result?.artifact && (
                                <RoundArtifactInspector
                                    artifact={result.artifact}
                                    comparison={findMethod === "artifact" ? comparison : undefined}
                                    stateBefore={result.stateBefore}
                                    stateAfter={result.stateAfter}
                                />
                            )}
                            {jobLoaded && !active && result && !result.artifact && (
                                <div>
                                    <Table withRowBorders={false} mb="sm">
                                        <Table.Tbody>
                                            <Table.Tr>
                                                <Table.Th>Game</Table.Th>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>
                                                    {result.game.name} (id: &quot;{result.game.id}&quot;, v{result.game.version})
                                                </Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Total bet</Table.Th>
                                                <Table.Td>{result.totalBet.toFixed(2)}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Total payout</Table.Th>
                                                <Table.Td>{result.totalWin.toFixed(2)}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Duration</Table.Th>
                                                <Table.Td>{result.durationMs}ms</Table.Td>
                                            </Table.Tr>
                                        </Table.Tbody>
                                    </Table>
                                    {result.screen ? (
                                        <GameScreenView screen={result.screen} />
                                    ) : (
                                        <Text size="sm" c="dimmed">
                                            No screen available — this game&apos;s session doesn&apos;t expose a symbols combination.
                                        </Text>
                                    )}
                                </div>
                            )}
                            {jobLoaded && !active && !result && <EmptyState message="Reproduce a round to inspect it." />}
                        </div>
                    )}
                </div>
            ) : (
                <EmptyState message={SOURCE_EMPTY_PROMPT[findMethod]} />
            )}

            <QuickActions>
                {findMethod === "spin" && selectedSpin && exportReady && (
                    <Button variant="default" onClick={() => downloadJsonBlob(`spin-${selectedSpin.sessionId}.json`, selectedSpin)}>
                        Download JSON
                    </Button>
                )}
                {findMethod !== "spin" && result && exportReady && (
                    <Anchor href={buildReplayDownloadUrl(result.id)} download>
                        Download JSON
                    </Anchor>
                )}
                {!exportReady && (
                    <Button variant="default" disabled>
                        Download JSON
                    </Button>
                )}
            </QuickActions>

            <PageSection legend="Recent replays">
                <QuickActions>
                    <Button variant="default" size="xs" onClick={onRefreshList}>
                        Refresh
                    </Button>
                </QuickActions>
                {listError && <ErrorState message={describeReplayActionError("The replay list", listError)} />}
                {listView.status === "empty" && <EmptyState message="No replays run yet." />}
                {listView.status === "loaded" && (
                    <List listStyleType="none" spacing={4}>
                        {listView.entries.map((entry) => (
                            <List.Item key={entry.id}>
                                <Group gap="xs" wrap="wrap" align="baseline">
                                    <Text size="sm" style={{overflowWrap: "anywhere"}}>
                                        {entry.game?.id ?? "?"} round {entry.round} — {describeReplayEntryStatus(entry.status)}
                                    </Text>
                                    <Anchor
                                        component="button"
                                        type="button"
                                        onClick={() => {
                                            switchSource("seedRound");
                                            // Only mark it loaded once the fetch actually succeeds -- a
                                            // failure is surfaced below via listError instead of silently
                                            // showing a loaded card/result for a round that never loaded.
                                            onInspectStored(entry.id)
                                                .then(() => markLoaded("seedRound", true))
                                                .catch(() => undefined);
                                        }}
                                    >
                                        Inspect
                                    </Anchor>
                                    {isReplayListEntryReproducible(entry) ? (
                                        <Anchor
                                            component="button"
                                            type="button"
                                            onClick={() => {
                                                switchSource("artifact");
                                                onCompareStored(entry.id);
                                                markLoaded("artifact", false);
                                            }}
                                        >
                                            Reproduce &amp; compare
                                        </Anchor>
                                    ) : (
                                        <Text size="sm" c="dimmed">
                                            Reproduce unavailable — no recorded seed
                                        </Text>
                                    )}
                                </Group>
                            </List.Item>
                        ))}
                    </List>
                )}
            </PageSection>
        </div>
    );
}
