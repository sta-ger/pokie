import {Alert, Anchor, Badge, Button, Group, Paper, SimpleGrid, Stack, Table, Text, Title} from "@mantine/core";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {formatAnalysisNumber} from "../../../../../src/internal/formatAnalysisNumber";
import type {AdvancedModelValidationReport} from "../../../../../src/validation/AdvancedModelValidation.js";
import {orderContributionEntries} from "../../domain/contributionTableOrder";
import {describeFeatureEventLabel} from "../../domain/featureEventLabels";
import {formatOneIn} from "../../domain/formatOneIn";
import {describeRtpSanityWarning} from "../../../../../src/reporting/describeRtpSanityWarning";
import {VOLATILITY_SCALE_DECISION} from "../../domain/volatilityScale";
import {describeExactMathScope, freeGamesAreUncapped, type ExactMathScope} from "../../domain/exactMathScope";
import type {ExactMathSummary} from "../../domain/exactMathSummary";
import {
    cancelOutcomeLibraryGeneration,
    estimateOutcomeLibraryGeneration,
    getExactMath,
    getOutcomeLibraryGenerationJob,
    listOutcomeLibraryGenerationJobs,
    OutcomeLibraryGenerationStartError,
    startOutcomeLibraryGeneration,
} from "../../api/apiClient";
import type {
    StudioExactMathContributionTable,
    StudioExactMathEventTable,
    StudioExactMathView,
    StudioOutcomeLibraryGenerateJobView,
} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import type {ProjectMathStatus} from "../../domain/validationScope";
import {errorMessage} from "../../domain/errorMessage";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {ExactPayoutDistribution} from "../common/ExactPayoutDistribution";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {VolatilityBandBadge} from "../common/VolatilityBandsControl";

const STAGE_LABELS: Record<string, string> = {
    generation: "Enumerating combinations",
    finalization: "Preparing outcomes",
    writing: "Writing the outcome table",
    analyzing: "Analyzing outcomes",
    "building-index": "Indexing outcomes",
    serialization: "Serializing outcomes",
    validation: "Validating the outcome table",
    publication: "Publishing the outcome table",
};

function formatElapsed(ms: number | undefined): string {
    if (ms === undefined || !Number.isFinite(ms)) return "—";
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function isTerminal(job: StudioOutcomeLibraryGenerateJobView): boolean {
    return (
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled" ||
        job.status === "recovery-required"
    );
}

function hasFreeGamesTerminationWarning(report: AdvancedModelValidationReport | undefined): boolean {
    return (
        report?.checks.some((check) => check.id === "termination.free-games" && check.status === "violation") ?? false
    );
}

function jobError(job: StudioOutcomeLibraryGenerateJobView): string {
    const result = job.result;
    let message = `Exact-math generation ended with status "${job.status}".`;
    if (result !== undefined && "error" in result && typeof result.error === "string") {
        message = result.error;
    } else if (result !== undefined && "errors" in result && Array.isArray(result.errors)) {
        message = result.errors.map((issue) => issue.message).join("; ");
    }
    if ((/Unsupported shared WASM math model|cannot be lowered to the compact exact-math model/i).test(message)) {
        return "Exact math is unavailable for this design. It uses a feature the compact exact model does not support (for example generated reel strips or stacks), or its outcome space is too large. Use Simulation, or generate a sampled outcome table in Build/Export.";
    }
    return message;
}

/**
 * Overview's exact-math card. Reads an already-computed compatible Outcome Library and offers an explicit
 * one-click generation when none exists. It never treats a sampled Simulation report as exact, and a
 * stale library is reported as stale rather than silently shown as current.
 */
export function ExactMathPanel({
    projectRoot,
    sourceRevision,
    refreshKey,
    autoRefreshStale,
    featureCheck,
    autoCompute,
    onGenerated,
    onStatusChange,
    onSummaryChange,
    onOpenPlay,
}: {
    projectRoot: string;
    sourceRevision?: string;
    refreshKey?: number;
    /** A new token means "the saved design just changed; offer a stale-table rebuild once instead of running it silently". */
    autoRefreshStale?: number;
    featureCheck?: AdvancedModelValidationReport;
    autoCompute?: boolean;
    onGenerated?: () => void;
    /** Lets Overview's structure/math badges say "exact", "stale" or "not checked" truthfully. */
    onStatusChange?: (status: ProjectMathStatus) => void;
    /** Lifts the exact headline so the producer summary can lead with it instead of a sampled RTP. */
    onSummaryChange?: (summary: ExactMathSummary | undefined) => void;
    /** The compact key-numbers card's single primary action; omitted for read-only surfaces. */
    onOpenPlay?: () => void;
}) {
    const fetchImpl = useStudioApi();
    const [view, setView] = useState<StudioExactMathView | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [starting, setStarting] = useState(false);
    const [job, setJob] = useState<StudioOutcomeLibraryGenerateJobView>();
    const [notice, setNotice] = useState<string>();
    const [lastDurationMs, setLastDurationMs] = useState<number>();
    const [rebuildDeferred, setRebuildDeferred] = useState(false);
    const loadGeneration = useRef(0);
    const pollGeneration = useRef(0);
    const autoComputeStarted = useRef(false);
    // The generation this panel last started. A Save/Apply can re-read the stale table while that job
    // is still running; the next start must cancel and drain it first, or the server rejects the new
    // request with "job already owns this resource".
    const activeJobId = useRef<string | undefined>(undefined);
    const promptedStaleToken = useRef<number | undefined>(undefined);

    const load = (): void => {
        const generation = ++loadGeneration.current;
        setLoading(true);
        setError(undefined);
        getExactMath(fetchImpl)
            .then((next) => {
                if (generation === loadGeneration.current) setView(next);
            })
            .catch((failure: unknown) => {
                if (generation === loadGeneration.current) setError(errorMessage(failure));
            })
            .finally(() => {
                if (generation === loadGeneration.current) setLoading(false);
            });
    };

    useEffect(() => {
        setLastDurationMs(undefined);
        setRebuildDeferred(false);
        promptedStaleToken.current = undefined;
    }, [projectRoot]);

    useEffect(() => {
        setJob(undefined);
        setNotice(undefined);
        // A saved design change invalidates the exact numbers immediately. Clear the previous view
        // while the fresh read runs instead of leaving an old RTP on screen until the request settles.
        setView(undefined);
        load();
        const loadToken = loadGeneration;
        const pollToken = pollGeneration;
        return () => {
            loadToken.current++;
            pollToken.current++;
        };
        // sourceRevision/refreshKey are intentional: an applied optimization or Blueprint save changes
        // the saved design, and keeping an old exact result visible would falsely present it as current.
        // refreshKey also covers an apply whose new optimizer revision is not known to the client.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchImpl, projectRoot, sourceRevision, refreshKey]);

    const poll = async (id: string): Promise<void> => {
        const generation = ++pollGeneration.current;
        for (;;) {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 1000);
            });
            if (generation !== pollGeneration.current) return;
            let next: StudioOutcomeLibraryGenerateJobView;
            try {
                next = await getOutcomeLibraryGenerationJob(fetchImpl, id);
            } catch (failure) {
                if (generation === pollGeneration.current) {
                    setError(errorMessage(failure));
                    setStarting(false);
                }
                return;
            }
            if (generation !== pollGeneration.current) return;
            setJob(next);
            if (!isTerminal(next)) continue;
            activeJobId.current = undefined;
            setStarting(false);
            if (next.status === "completed") {
                const duration = next.durationMs ?? (next.startedAt === undefined ? undefined : Date.now() - next.startedAt);
                if (duration !== undefined && Number.isFinite(duration)) setLastDurationMs(duration);
                setNotice(
                    "Exact outcome table generated. This is the complete paid-spin outcome table for this saved design.",
                );
                // The generation job is complete, but the exact-math view still holds the pre-generation
                // "missing" snapshot until its own read settles. Clear that snapshot first so the card
                // never shows "generated" and "no table exists" at the same time.
                setView(undefined);
                load();
                onGenerated?.();
            } else if (next.status === "cancelled") {
                setNotice("Exact-math generation was cancelled. The previous result, if any, is unchanged.");
            } else {
                setError(jobError(next));
            }
            return;
        }
    };

    const waitForGenerationToStop = async (id: string): Promise<void> => {
        for (let attempt = 0; attempt < 600; attempt++) {
            const next = await getOutcomeLibraryGenerationJob(fetchImpl, id).catch(() => undefined);
            if (next === undefined || isTerminal(next)) return;
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 100);
            });
        }
    };

    const cancelTrackedJob = async (): Promise<void> => {
        const id = activeJobId.current;
        if (id === undefined) return;
        activeJobId.current = undefined;
        try {
            const cancelled = await cancelOutcomeLibraryGeneration(fetchImpl, id);
            if (!isTerminal(cancelled)) await waitForGenerationToStop(id);
        } catch {
            // The job may already have reached a terminal state and released the resource. A new
            // preflight/start below will surface a real conflict if the resource is still owned.
        }
    };

    const start = (): void => {
        setStarting(true);
        setError(undefined);
        setNotice(undefined);
        (async () => {
            await cancelTrackedJob();
            const startGeneration = async (): Promise<StudioOutcomeLibraryGenerateJobView | undefined> => {
                // Ask the cheap preflight first. It tells us whether this design can fit an exact enumeration and
                // whether the compact exact model supports it at all, so a doomed large/stacks job is never queued.
                const estimate = await estimateOutcomeLibraryGeneration(fetchImpl, {generation: "exact"});
                if (estimate.status !== "ok") {
                    setStarting(false);
                    setError(estimate.error);
                    return undefined;
                }
                if (estimate.requiresBounded) {
                    setStarting(false);
                    const formatSpace = (value: number | string): string =>
                        typeof value === "number" ? value.toLocaleString("en-US") : value;
                    setError(
                        `This design has ${formatSpace(
                            estimate.totalOutcomeSpaceSize,
                        )} possible reel-stop combinations, above the exact limit of ${formatSpace(
                            estimate.maxOutcomeSpaceSize,
                        )}. Use Simulation, or generate a sampled outcome table in Build/Export.`,
                    );
                    return undefined;
                }
                return startOutcomeLibraryGeneration(fetchImpl, {
                    generation: "exact",
                    preflightToken: estimate.preflightToken,
                });
            };
            let started: StudioOutcomeLibraryGenerateJobView | undefined;
            try {
                started = await startGeneration();
            } catch (failure) {
                // A reload or a rapid Save can leave a previous generation owning the destination after
                // this panel lost its job id. Wait for that job to release the resource, then retry the
                // preflight/start once. Never cancel someone else's explicit generation silently.
                if (!(failure instanceof OutcomeLibraryGenerationStartError) || failure.outcomeStatus !== "conflict") {
                    throw failure;
                }
                const active = (await listOutcomeLibraryGenerationJobs(fetchImpl)).filter((candidate) => !isTerminal(candidate));
                if (active.length > 0) {
                    setNotice("Waiting for the active exact-math generation to finish before rebuilding this table…");
                    await Promise.all(active.map((candidate) => waitForGenerationToStop(candidate.id)));
                } else {
                    // Terminal status and destination-owner release are adjacent but not atomic.
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, 250);
                    });
                }
                started = await startGeneration();
            }
            if (started === undefined) return;
            setNotice(undefined);
            activeJobId.current = started.id;
            setJob(started);
            await poll(started.id);
        })().catch((failure: unknown) => {
            setStarting(false);
            if (
                failure instanceof OutcomeLibraryGenerationStartError &&
                failure.outcomeStatus === "requires-bounded"
            ) {
                setError(
                    "This game's outcome space is too large for one-click exact enumeration. Use Build/Export → Outcome tables to generate a sampled outcome table, or raise the exact cap explicitly.",
                );
            } else {
                setError(errorMessage(failure));
            }
        });
    };

    useEffect(() => {
        if (!autoCompute || autoComputeStarted.current || view?.status !== "missing") return;
        autoComputeStarted.current = true;
        start();
        // start is intentionally not a dependency: it is recreated each render, while the one-shot
        // guard above is what keeps a missing table from starting a generation loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoCompute, view?.status]);

    const cancel = (): void => {
        if (job === undefined) return;
        activeJobId.current = undefined;
        cancelOutcomeLibraryGeneration(fetchImpl, job.id)
            .then(setJob)
            .catch((failure: unknown) => setError(errorMessage(failure)));
    };

    const active = job !== undefined && !isTerminal(job) && job.status !== "recovery-required";

    // A Save or reviewed Apply changed the saved design. Offer the rebuild once for this token rather
    // than starting a possibly slow enumeration silently. "Later" leaves the normal stale-state action
    // in place; a new token offers the choice again.
    useEffect(() => {
        if (autoRefreshStale === undefined || view?.status !== "stale" || starting || active) return;
        if (promptedStaleToken.current === autoRefreshStale) return;
        promptedStaleToken.current = autoRefreshStale;
        setRebuildDeferred(true);
    }, [autoRefreshStale, view?.status, starting, active]);

    useEffect(() => {
        const status: ProjectMathStatus = starting || active
            ? "loading"
            : view?.status ?? (error === undefined ? "loading" : "error");
        onStatusChange?.(status);
    }, [active, error, onStatusChange, starting, view?.status]);

    useEffect(() => {
        if (view?.status !== "ok") {
            onSummaryChange?.(undefined);
            return;
        }
        const freeGamesTotal = view.freeGamesRtp?.status === "available" ? view.freeGamesRtp : undefined;
        const scope = describeExactMathScope(view.freeGamesRtp, view.featurePayoutsIncluded);
        onSummaryChange?.({
            rtp: freeGamesTotal?.totalRtp ?? view.analysis.rtp,
            paidRtp: view.analysis.rtp,
            ...(freeGamesTotal === undefined ? {} : {freeRtp: freeGamesTotal.featureRtp}),
            hitFrequency: view.analysis.hitFrequency,
            volatility: view.analysis.standardDeviation,
            maxWin: view.analysis.maxWin / view.stake,
            outcomes: view.outcomeCount,
            scope,
            wholeRound: scope === "whole-round",
        });
    }, [onSummaryChange, view]);

    const progress = job?.progress;
    const durable = job?.durableProgress;
    const elapsedMs = job?.durationMs ?? (job?.startedAt === undefined ? undefined : Date.now() - job.startedAt);
    const processedRaw = progress === undefined ? undefined : Number(progress.processedRawIndex);
    const totalRaw = progress === undefined ? undefined : Number(progress.progressTotal);
    const durableCurrent =
        durable === undefined || durable.current === "indeterminate" ? undefined : Number(durable.current);
    const durableTotal = durable === undefined || durable.total === "indeterminate" ? undefined : Number(durable.total);
    const measuredCurrent = durableCurrent ?? processedRaw;
    const measuredTotal = durableTotal ?? totalRaw;
    // The first records are written while the writer is still warming up; a linear ETA from that
    // instant can claim minutes for a job that finishes in seconds. Wait for a real rate and a
    // meaningful share of the work, then call the result "rough" rather than presenting it as a promise.
    const canEstimateEta =
        active &&
        measuredCurrent !== undefined &&
        measuredTotal !== undefined &&
        elapsedMs !== undefined &&
        measuredCurrent > 0 &&
        measuredTotal > measuredCurrent &&
        elapsedMs >= 8000 &&
        measuredCurrent >= Math.min(500, measuredTotal * 0.02);
    const estimate = canEstimateEta
        ? formatElapsed((elapsedMs / measuredCurrent) * (measuredTotal - measuredCurrent))
        : undefined;
    let etaLabel: string | undefined;
    if (
        active &&
        measuredCurrent !== undefined &&
        measuredTotal !== undefined &&
        measuredCurrent > 0 &&
        measuredTotal > measuredCurrent
    ) {
        etaLabel = estimate === undefined ? "estimating…" : `rough ETA ~${estimate}`;
    }
    const stageLabel = durable?.stage ?? STAGE_LABELS[job?.lifecycleStage ?? ""] ?? job?.lifecycleStage ?? "Working";
    const progressLabel =
        measuredCurrent === undefined || measuredTotal === undefined
            ? undefined
            : `${measuredCurrent.toLocaleString("en-US")} / ${measuredTotal.toLocaleString("en-US")} ${
                durable?.unit ?? "combinations"
            }`;

    let body: React.ReactNode;
    if (loading && view === undefined) {
        body = <LoadingState label="Reading exact math…" />;
    } else if (view?.status === "ok") {
        const analysis = view.analysis;
        const contribution = view.contributions;
        const freeGamesTotal = view.freeGamesRtp?.status === "available" ? view.freeGamesRtp : undefined;
        const exactScope = describeExactMathScope(view.freeGamesRtp, view.featurePayoutsIncluded);
        const uncapped = freeGamesAreUncapped(view.freeGamesRtp);
        const wholeRoundMaxUpperBound =
            freeGamesTotal !== undefined &&
            freeGamesTotal.maxFreeGames !== undefined &&
            Number.isFinite(analysis.maxWin)
                ? (analysis.maxWin * (1 + freeGamesTotal.maxFreeGames)) / view.stake
                : undefined;
        let wholeRoundMaxLabel: string | undefined;
        let wholeRoundMaxCardLabel: string | undefined;
        let wholeRoundMaxValue: string | undefined;
        if (freeGamesTotal !== undefined) {
            wholeRoundMaxLabel =
                freeGamesTotal.maxFreeGames === undefined
                    ? "Max whole-round win (no cap)"
                    : "Max whole-round win (upper bound, capped)";
            wholeRoundMaxCardLabel =
                freeGamesTotal.maxFreeGames === undefined
                    ? "Whole-round max (no cap)"
                    : "Whole-round max (capped)";
            if (freeGamesTotal.maxFreeGames === undefined) wholeRoundMaxValue = "Unbounded";
            else if (wholeRoundMaxUpperBound === undefined) wholeRoundMaxValue = "Unavailable";
            else wholeRoundMaxValue = `${formatAnalysisNumber(wholeRoundMaxUpperBound, 4)}× bet`;
        }
        let featureScopeWarning: string | undefined;
        let featureScopeTitle = "Paid-spin exact math";
        let featureScopeColor: "yellow" | "blue" = "yellow";
        if (freeGamesTotal !== undefined) {
            featureScopeTitle =
                freeGamesTotal.maxFreeGames === undefined
                    ? "Free-games RTP included"
                    : "Free-games RTP included (capped)";
            featureScopeColor = "blue";
            featureScopeWarning = `Total RTP includes additive free-game retriggers${
                freeGamesTotal.maxFreeGames === undefined
                    ? ""
                    : ` capped at ${freeGamesTotal.maxFreeGames} free games per feature`
            }: ${(freeGamesTotal.baseRtp * 100).toFixed(4)}% paid-spin + ${(freeGamesTotal.featureRtp * 100).toFixed(
                4,
            )}% free games = ${(freeGamesTotal.totalRtp * 100).toFixed(
                4,
            )}%. The model assumes free spins use the same reels, paytable and bet, and each trigger awards the recorded count.`;
        } else if (view.featurePayoutsIncluded === false) {
            const unbounded = view.freeGamesRtp?.status === "infinite";
            const reason =
                view.freeGamesRtp?.status === "infinite" || view.freeGamesRtp?.status === "unsupported"
                    ? ` ${view.freeGamesRtp.reason}`
                    : "";
            if (unbounded) {
                featureScopeTitle = "Unbounded total RTP";
                featureScopeWarning = `This exact RTP covers paid entry spins only.${reason} Simulation cannot produce a finite long-run RTP for this model; reduce the free-games award or scatter frequency before testing.`;
            } else {
                featureScopeWarning = `This exact RTP covers paid entry spins only. The outcome table records feature triggers, but feature payouts that settle later — for example free-game wins — are not included.${reason} Use Simulation for total RTP.`;
            }
        } else if (view.featurePayoutsIncluded === undefined) {
            featureScopeWarning =
                "This exact outcome table is too large to inspect feature triggers here. The figures cover paid entry spins; if the design has free games or other features, their later payouts are not included.";
        }
        const rtpWarning = describeRtpSanityWarning(freeGamesTotal?.totalRtp ?? analysis.rtp);
        let paidSpinLabel = "Exact RTP";
        if (freeGamesTotal !== undefined) paidSpinLabel = "Paid-spin RTP";
        else if (view.featurePayoutsIncluded === false) paidSpinLabel = "Exact RTP (paid spins)";
        const hitFrequencyLabel = freeGamesTotal !== undefined ? "Hit frequency (paid spins)" : "Hit frequency";
        const volatilityLabel =
            freeGamesTotal !== undefined
                ? "Volatility (σ, × bet, paid spins)"
                : "Volatility (σ, × bet)";
        const maxWinLabel = freeGamesTotal !== undefined ? "Max win (× bet, paid spins)" : "Max win (× bet)";
        const hasFreeGamesCaveat =
            freeGamesTotal !== undefined &&
            freeGamesTotal.maxFreeGames === undefined &&
            hasFreeGamesTerminationWarning(featureCheck);
        body = (
            <Stack gap="sm">
                <KeyNumbersCard
                    totalRtp={freeGamesTotal?.totalRtp}
                    paidRtp={analysis.rtp}
                    freeRtp={freeGamesTotal?.featureRtp}
                    hitFrequency={analysis.hitFrequency}
                    volatility={analysis.standardDeviation}
                    maxWin={analysis.maxWin / view.stake}
                    volatilityLabel={volatilityLabel}
                    maxWinLabel={maxWinLabel}
                    wholeRoundMaxLabel={wholeRoundMaxCardLabel}
                    wholeRoundMaxValue={wholeRoundMaxValue}
                    outcomes={view.outcomeCount}
                    exactScope={exactScope}
                    uncapped={uncapped}
                    onOpenPlay={onOpenPlay}
                />
                {rtpWarning !== undefined && (
                    <Alert color="red" variant="light" title="RTP looks unusual">
                        <Text size="md">{rtpWarning}</Text>
                    </Alert>
                )}
                {(hasFreeGamesCaveat || featureScopeWarning !== undefined) && (
                    <AdvancedDisclosure label="free-games and RTP caveats">
                        {hasFreeGamesCaveat && (
                            <Alert color="yellow" variant="light" title="Free games have no hard cap">
                                <Text size="md">
                                    In plain terms: the average RTP is exact, but one round can run indefinitely. A
                                    retrigger factor below 1 keeps the average finite and means a round ends with
                                    probability 1, but it does not put a hard limit on one round. Treat this as an
                                    expected-value result.
                                </Text>
                                <Anchor
                                    href={`#/project/${encodeURIComponent(projectRoot)}/gameModel`}
                                    size="sm"
                                    mt={6}
                                    display="block"
                                >
                                    Review free-games mechanics
                                </Anchor>
                            </Alert>
                        )}
                        {featureScopeWarning !== undefined && (
                            <Alert color={featureScopeColor} variant="light" title={featureScopeTitle}>
                                <Text size="md">{featureScopeWarning}</Text>
                                {view.freeGamesRtp?.status !== "infinite" && (
                                    <Anchor
                                        href={`#/project/${encodeURIComponent(projectRoot)}/simulation`}
                                        size="sm"
                                        mt={6}
                                        display="block"
                                    >
                                        Open Simulation to compare total RTP
                                    </Anchor>
                                )}
                            </Alert>
                        )}
                    </AdvancedDisclosure>
                )}
                <AdvancedDisclosure label="all exact math figures">
                    <SimpleGrid cols={{base: 2, md: freeGamesTotal === undefined ? 5 : 4}} spacing="sm">
                        {freeGamesTotal !== undefined && (
                            <Metric
                                primary
                                label="Total RTP (paid + free games)"
                                value={`${formatAnalysisNumber(freeGamesTotal.totalRtp * 100, 4)}%`}
                            />
                        )}
                        <Metric
                            primary={freeGamesTotal === undefined}
                            label={paidSpinLabel}
                            value={`${formatAnalysisNumber(analysis.rtp * 100, 4)}%`}
                        />
                        {freeGamesTotal !== undefined && (
                            <Metric
                                label="Free-games RTP"
                                value={`${formatAnalysisNumber(freeGamesTotal.featureRtp * 100, 4)}%`}
                            />
                        )}
                        <Metric
                            label={hitFrequencyLabel}
                            value={`${formatAnalysisNumber(analysis.hitFrequency * 100, 4)}%`}
                        />
                        <Metric label={volatilityLabel} value={formatAnalysisNumber(analysis.standardDeviation, 4)} />
                        <Metric label={maxWinLabel} value={formatAnalysisNumber(analysis.maxWin / view.stake, 4)} />
                        {wholeRoundMaxLabel !== undefined && wholeRoundMaxValue !== undefined && (
                            <Metric label={wholeRoundMaxLabel} value={wholeRoundMaxValue} />
                        )}
                        <Metric
                            label={freeGamesTotal !== undefined ? "Outcomes (paid spins)" : "Outcomes"}
                            value={view.outcomeCount.toLocaleString("en-US")}
                        />
                    </SimpleGrid>
                    <Text size="xs" c="dimmed" mt="sm">
                        Exact enumeration of {view.outcomeCount.toLocaleString("en-US")} paid-spin outcomes for bet mode
                        &quot;{view.modeName}&quot;; not a sample. This table is a fixed snapshot of this saved design.
                    </Text>
                    <Text size="xs" c="dimmed">
                        Outcome table {view.libraryId} · generated {view.generatedAt}
                        {view.strategy === undefined ? "" : ` · ${view.strategy}`}
                    </Text>
                </AdvancedDisclosure>
                <AdvancedDisclosure label="how to read these figures">
                    <Text size="sm" c="dimmed">
                        Volatility and max win here are paid-spin figures. A paid spin is the spin that starts a
                        round. Volatility is the standard deviation of payout per paid spin, in bet units. Max win is
                        the largest single-round paid-spin payout, also in bet units; it can exceed the largest
                        paytable entry when several lines win in the same round. Simulation reports whole rounds; when
                        the design has free games or other features, its volatility and largest observed win include
                        them and can be larger. Studio reports the standard deviation rather than imposing a
                        low/medium/high class, because there is no single industry threshold for those labels. If you
                        define portfolio bands, Studio adds an explicit label without changing the number or the
                        game&apos;s math. With a free-games cap, the whole-round maximum shown here is an upper bound:
                        the paid-spin maximum plus the cap in free spins, each at the paid-spin maximum. Without a cap,
                        retriggers can chain indefinitely, so the theoretical whole-round maximum is unbounded even
                        when expected RTP is finite. Simulation&apos;s largest observed win is a sample, not a
                        theoretical maximum.
                    </Text>
                </AdvancedDisclosure>
                <ExactPayoutDistribution
                    buckets={analysis.payoutDistribution}
                    label={freeGamesTotal !== undefined ? "paid-spin payout distribution" : "payout distribution"}
                />
                {view.events.entries.length > 0 && (
                    <AdvancedDisclosure
                        label={
                            freeGamesTotal !== undefined
                                ? "paid-spin win event probabilities"
                                : "win event probabilities"
                        }
                    >
                        <Text size="sm" c="dimmed" mb="xs">
                            Exact chance that a random round contains at least one of these wins. A round can contain
                            several events, so the probabilities overlap and do not sum to 100%. The RTP contribution
                            column still adds up to the exact RTP above.
                        </Text>
                        <EventTable table={view.events} />
                        {view.events.truncated && (
                            <Text size="xs" c="dimmed" mt="xs">
                                Showing the most likely events. The outcome table itself remains complete.
                            </Text>
                        )}
                    </AdvancedDisclosure>
                )}
                {view.events.entries.length === 0 && view.eventNote !== undefined && (
                    <Text size="xs" c="dimmed">
                        {view.eventNote}
                    </Text>
                )}
                {(contribution.line.entries.length > 0 || contribution.symbol.entries.length > 0) && (
                    <AdvancedDisclosure
                        label={
                            freeGamesTotal !== undefined
                                ? "paid-spin line and symbol contributions"
                                : "line and symbol contributions"
                        }
                    >
                        <Text size="sm" c="dimmed" mb="xs">
                            Exact weighted contribution to RTP, using the same per-unit-stake scale as the RTP above.
                            The line table covers line wins; the symbol table covers every win once. The two tables
                            overlap, so do not add one to the other — that would count line wins twice. The symbol
                            table&apos;s RTP column adds up to exact RTP; the line table does too when every win is a
                            line win. A truncated table omits only its smallest rows. Rows are sorted by RTP
                            contribution, highest first; ties are ordered by their label.
                        </Text>
                        {contribution.line.entries.length > 0 && (
                            <>
                                <Text fw={600} size="sm" mt="xs">
                                    Line contributions
                                </Text>
                                <ContributionTable entries={contribution.line.entries} />
                            </>
                        )}
                        {contribution.symbol.entries.length > 0 && (
                            <>
                                <Text fw={600} size="sm" mt="xs">
                                    Symbol contributions
                                </Text>
                                <ContributionTable entries={contribution.symbol.entries} />
                            </>
                        )}
                        {view.contributionNote !== undefined && (
                            <Text size="xs" c="dimmed" mt="xs">
                                {view.contributionNote}
                            </Text>
                        )}
                    </AdvancedDisclosure>
                )}
                {view.contributionNote !== undefined &&
                    contribution.line.entries.length === 0 &&
                    contribution.symbol.entries.length === 0 && (
                    <Text size="xs" c="dimmed">
                        {view.contributionNote}
                    </Text>
                )}
                {view.featureEvents !== undefined && view.featureEvents.length > 0 && (
                    <AdvancedDisclosure
                        label={
                            freeGamesTotal !== undefined
                                ? "feature triggers and free-games RTP derivation"
                                : "feature triggers (payouts not included)"
                        }
                    >
                        <Text size="sm" c="dimmed" mb="xs">
                            {freeGamesTotal !== undefined
                                ? "These triggers feed the derived total RTP above; the outcome table itself keeps paid-spin records."
                                : "These are the feature events recorded by the paid-spin outcome table. Their later feature outcomes are not part of the exact figures above."}
                        </Text>
                        {view.freeGamesRtp?.status === "available" && (
                            <Stack gap={4} mb="sm">
                                <Text fw={600} size="sm">
                                    Free-games RTP derivation
                                    {view.freeGamesRtp.maxFreeGames === undefined ? "" : " (capped)"}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Free-games RTP = trigger probability × expected free spins × paid-spin RTP. Free
                                    spins use the same reels, paytable and bet; retriggers are additive.
                                </Text>
                                <Table withRowBorders={false} aria-label="Free-games RTP derivation">
                                    <Table.Tbody>
                                        <Table.Tr>
                                            <Table.Th>Trigger probability (per paid spin)</Table.Th>
                                            <Table.Td>
                                                {formatAnalysisNumber(view.freeGamesRtp.triggerProbability * 100, 4)}%
                                            </Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Average award per trigger</Table.Th>
                                            <Table.Td>
                                                {formatAnalysisNumber(view.freeGamesRtp.expectedAward, 4)} free games
                                            </Table.Td>
                                        </Table.Tr>
                                        {view.freeGamesRtp.maxFreeGames !== undefined && (
                                            <Table.Tr>
                                                <Table.Th>Cap per feature (initial award + retriggers)</Table.Th>
                                                <Table.Td>{view.freeGamesRtp.maxFreeGames} free games</Table.Td>
                                            </Table.Tr>
                                        )}
                                        <Table.Tr>
                                            <Table.Th>Retrigger factor (per free spin)</Table.Th>
                                            <Table.Td>
                                                {formatAnalysisNumber(
                                                    view.freeGamesRtp.triggerProbability *
                                                        view.freeGamesRtp.expectedAward,
                                                    4,
                                                )}
                                            </Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Expected free spins per trigger (incl. retriggers)</Table.Th>
                                            <Table.Td>
                                                {formatAnalysisNumber(view.freeGamesRtp.expectedFreeSpins, 4)}
                                            </Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Paid-spin RTP</Table.Th>
                                            <Table.Td>
                                                {formatAnalysisNumber(view.freeGamesRtp.baseRtp * 100, 4)}%
                                            </Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Free-games RTP</Table.Th>
                                            <Table.Td>
                                                {formatAnalysisNumber(view.freeGamesRtp.featureRtp * 100, 4)}%
                                            </Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Total RTP</Table.Th>
                                            <Table.Td>
                                                {formatAnalysisNumber(view.freeGamesRtp.totalRtp * 100, 4)}%
                                            </Table.Td>
                                        </Table.Tr>
                                    </Table.Tbody>
                                </Table>
                                <Text size="xs" c="dimmed">
                                    Retrigger factor = trigger probability × average award. It is the expected number of
                                    retrigger awards per free spin; without a cap, the geometric series includes every
                                    later retrigger.
                                </Text>
                                {view.freeGamesRtp.maxFreeGames !== undefined && (
                                    <Text size="xs" c="dimmed">
                                        The cap counts the trigger award and every retrigger. It keeps every feature
                                        finite even when the retrigger factor is 1 or higher.
                                    </Text>
                                )}
                            </Stack>
                        )}
                        {view.freeGamesRtp?.status === "infinite" && (
                            <Alert color="yellow" variant="light" title="Unbounded free-games RTP" mb="sm">
                                <Text size="sm">{view.freeGamesRtp.reason}</Text>
                            </Alert>
                        )}
                        {view.freeGamesRtp?.status === "unsupported" && (
                            <Text size="xs" c="dimmed" mb="sm">
                                Free-games RTP derivation unavailable: {view.freeGamesRtp.reason}
                            </Text>
                        )}
                        <Table withRowBorders={false}>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Feature event</Table.Th>
                                    <Table.Th>Paid spins triggering it</Table.Th>
                                    <Table.Th>Outcomes</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {view.featureEvents.map((event) => (
                                    <Table.Tr key={event.key}>
                                        <Table.Td>{describeFeatureEventLabel(event.key)}</Table.Td>
                                        <Table.Td>{formatAnalysisNumber(event.weightedFrequency * 100, 4)}%</Table.Td>
                                        <Table.Td>{event.outcomeCount.toLocaleString("en-US")}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </AdvancedDisclosure>
                )}
                <Group>
                    <Button variant="default" size="xs" onClick={start} loading={starting || active}>
                        Recompute exact outcome table
                    </Button>
                </Group>
            </Stack>
        );
    } else if (active && (view?.status === "missing" || view?.status === "stale")) {
        // The progress alert above already explains the running generation. Showing the missing/stale
        // empty state here at the same time reads as a contradiction ("no table exists" under a
        // progress bar that says it is being written).
        body = (
            <Text size="sm" c="dimmed">
                {view?.status === "stale"
                    ? "The previous outcome table is not used while its replacement is being written."
                    : "The first exact outcome table for this saved design is being generated."}
            </Text>
        );
    } else if (view?.status === "missing" || view?.status === "stale") {
        const stale = view.status === "stale";
        const durationHint = lastDurationMs === undefined
            ? "Typical rebuilds take a few seconds; feature-heavy tables can take a minute or more."
            : `The last exact rebuild took ${formatElapsed(lastDurationMs)}.`;
        body = (
            <Stack gap="sm">
                {stale && rebuildDeferred ? (
                    <Alert color="blue" variant="light" title="The exact table is out of date" data-pokie-exact-rebuild-choice="true">
                        <Text size="sm">
                            The saved design changed. {durationHint}
                        </Text>
                        <Group mt="xs">
                            <Button
                                onClick={() => {
                                    setRebuildDeferred(false);
                                    start();
                                }}
                                loading={starting || active}
                            >
                                Rebuild now
                            </Button>
                            <Button variant="default" onClick={() => setRebuildDeferred(false)}>
                                Later
                            </Button>
                        </Group>
                        <Text size="xs" c="dimmed" mt={4}>
                            Later leaves the old table unavailable until you choose Recompute exact outcome table.
                        </Text>
                    </Alert>
                ) : (
                    <>
                        <EmptyState message={view.message} />
                        {stale && (
                            <Text size="sm" c="dimmed">
                                Generating again replaces the stale outcome table with one computed from the current saved
                                design. {durationHint}
                            </Text>
                        )}
                        <Group>
                            <Button onClick={start} loading={starting || active}>
                                {stale ? "Recompute exact outcome table" : "Compute exact outcome table"}
                            </Button>
                        </Group>
                        <Text size="xs" c="dimmed">
                            This writes the exact outcome table into the project&apos;s <code>outcomelibrary</code> folder. It
                            can take a while for a large game; progress is shown below.
                        </Text>
                    </>
                )}
                <AdvancedDisclosure label="technical file name">
                    <Text size="xs" c="dimmed">
                        The project folder and API call this an Outcome Library; the UI calls it an outcome table. It is
                        an outcome table, not a code library.
                    </Text>
                </AdvancedDisclosure>
            </Stack>
        );
    } else if (view?.status === "error") {
        body = (
            <Stack gap="sm">
                <ErrorState message={view.message} />
                <Group>
                    <Button variant="default" size="xs" onClick={load} loading={loading}>
                        Retry exact-math read
                    </Button>
                    <Button variant="default" size="xs" onClick={start} loading={starting || active}>
                        Compute exact outcome table
                    </Button>
                </Group>
            </Stack>
        );
    } else {
        body = <LoadingState label="Reading exact math…" />;
    }

    return (
        <PageSection legend="Exact math">
            <Title order={4}>Exact math for this saved design</Title>
            {error !== undefined && <ErrorState message={error} />}
            {notice !== undefined && (
                <Alert color="green" mb="sm">
                    {notice}
                </Alert>
            )}
            {active && (
                <Alert color="blue" mb="sm" title="Generating exact outcomes">
                    <Text size="sm">
                        {stageLabel} · {formatElapsed(elapsedMs)} elapsed
                        {progressLabel === undefined ? "" : ` · ${progressLabel}`}
                        {etaLabel === undefined ? "" : ` · ${etaLabel}`}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                        This runs in the background. You can switch tabs or keep editing; the old table stays
                        out of the current RTP until the replacement is ready.
                        {autoRefreshStale === undefined ? "" : " Studio offered this rebuild because the saved design changed."}
                    </Text>
                    <Group mt="xs">
                        {!job.cancellationRequested && (
                            <Button color="red" variant="light" size="xs" onClick={cancel} title="Stop waiting for this rebuild. You can recompute the table later from Overview; the old table is not treated as current.">
                                Cancel and recompute later
                            </Button>
                        )}
                        {job.cancellationRequested && (
                            <Text size="sm">Cancellation requested; waiting for safe cleanup.</Text>
                        )}
                    </Group>
                </Alert>
            )}
            {body}
        </PageSection>
    );
}

function KeyStat({label, value, title, tone, badge}: {label: string; value: string; title?: string; tone?: "warning"; badge?: ReactNode}) {
    return (
        <div title={title}>
            <Text size="sm" c="dimmed">
                {label}
            </Text>
            <Group gap={6} align="center" wrap="nowrap">
                <Text size="md" fw={700} c={tone === "warning" ? "yellow.9" : undefined}>
                    {value}
                </Text>
                {badge}
            </Group>
        </div>
    );
}

function KeyNumbersCard({
    totalRtp,
    paidRtp,
    freeRtp,
    hitFrequency,
    volatility,
    maxWin,
    volatilityLabel,
    maxWinLabel,
    wholeRoundMaxLabel,
    wholeRoundMaxValue,
    outcomes,
    exactScope,
    uncapped,
    onOpenPlay,
}: {
    totalRtp?: number;
    paidRtp: number;
    freeRtp?: number;
    hitFrequency: number;
    volatility: number;
    maxWin: number;
    volatilityLabel: string;
    maxWinLabel: string;
    wholeRoundMaxLabel?: string;
    wholeRoundMaxValue?: string;
    outcomes: number;
    exactScope: ExactMathScope;
    uncapped: boolean;
    onOpenPlay?: () => void;
}) {
    const headline = totalRtp ?? paidRtp;
    let scopeBadgeColor = "gray";
    let scopeBadgeLabel = "Scope not inspected";
    let scopeNote =
        "This table is too large to inspect feature payouts here. If this design has later-settling features, these exact figures cover paid entry spins only.";
    if (exactScope === "whole-round") {
        scopeBadgeColor = "teal";
        scopeBadgeLabel = "Whole-round exact";
        scopeNote =
            "Use this exact RTP as the whole-round reference. Any sampled summary above is an estimate, not a second exact result.";
    } else if (exactScope === "base-spins") {
        scopeBadgeColor = "yellow";
        scopeBadgeLabel = "Paid-spin exact";
        scopeNote =
            "This exact RTP covers paid entry spins only. A paid spin starts a round; use Simulation for whole-round RTP.";
    }
    return (
        <Paper withBorder p="md" radius="md" className="studio-key-numbers" data-pokie-producer-summary="true">
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        At a glance
                    </Text>
                    <Group align="baseline" gap="xs" mt={2} wrap="wrap">
                        <Text fw={700} fz={36} lh={1.05}>
                            {formatAnalysisNumber(headline * 100, 4)}%
                        </Text>
                        <Text size="sm" c="dimmed">
                            {totalRtp === undefined ? "Exact RTP" : "Total RTP (paid + free games)"}
                        </Text>
                        <Badge
                            color={scopeBadgeColor}
                            variant="light"
                            tt="none"
                            data-pokie-exact-scope={exactScope}
                        >
                            {scopeBadgeLabel}
                        </Badge>
                    </Group>
                    <Text size="sm" c="dimmed" mt={4} data-pokie-exact-scope-note={exactScope}>
                        {scopeNote}
                    </Text>
                    {freeRtp !== undefined && (
                        <Text size="sm" c="dimmed" mt={2}>
                            Paid-spin RTP {formatAnalysisNumber(paidRtp * 100, 4)}% · Free-games RTP{" "}
                            {formatAnalysisNumber(freeRtp * 100, 4)}%
                        </Text>
                    )}
                    <Group gap="lg" mt="sm" wrap="wrap">
                        <KeyStat
                            label={freeRtp === undefined ? "Hit frequency" : "Hit frequency (paid spins)"}
                            value={`${formatAnalysisNumber(hitFrequency * 100, 4)}%`}
                        />
                        <KeyStat
                            label={volatilityLabel}
                            value={formatAnalysisNumber(volatility, 4)}
                            title="Standard deviation of payout per paid spin, in bet units."
                            badge={<VolatilityBandBadge value={volatility} basis={freeRtp === undefined ? undefined : "paid-spin volatility"} />}
                        />
                        <KeyStat
                            label={maxWinLabel}
                            value={formatAnalysisNumber(maxWin, 4)}
                            title="Largest paid-spin payout in bet units. Feature wins that settle later are not included here."
                        />
                        {wholeRoundMaxLabel !== undefined && wholeRoundMaxValue !== undefined && (
                            <KeyStat
                                label={wholeRoundMaxLabel}
                                value={wholeRoundMaxValue}
                                tone={uncapped ? "warning" : undefined}
                                title={
                                    uncapped
                                        ? "There is no hard limit on free games, so a single round has no theoretical maximum. The paid-spin maximum above is not the whole-round maximum."
                                        : "The paid-spin maximum plus the capped free-games allowance, each at the paid-spin maximum."
                                }
                            />
                        )}
                    </Group>
                    {uncapped && (
                        <Text size="sm" mt="sm" data-pokie-producer-uncapped-note="true">
                            The average RTP is exact, but this game has no hard cap on free games: one round can run
                            indefinitely. The paid-spin maximum above is not the game&apos;s whole-round maximum; use
                            Simulation to see whole-round hit frequency, volatility and the largest observed win.
                        </Text>
                    )}
                    <Group gap="xs" mt="sm">
                        <Badge color="gray" variant="light" tt="none">
                            Exact · {outcomes.toLocaleString("en-US")} outcomes
                        </Badge>
                        {uncapped && (
                            <Badge
                                color="yellow"
                                variant="light"
                                tt="none"
                                title="The average RTP is finite, but one round can run indefinitely. See free-games and RTP caveats below."
                            >
                                Uncapped free games
                            </Badge>
                        )}
                    </Group>
                    <Text size="xs" c="dimmed" mt="sm" data-pokie-volatility-policy="true">
                        {VOLATILITY_SCALE_DECISION}
                    </Text>
                </div>
                {onOpenPlay !== undefined && (
                    <Button size="md" onClick={onOpenPlay}>
                        Open Play
                    </Button>
                )}
            </Group>
        </Paper>
    );
}

function Metric({label, value, primary = false}: {label: string; value: string; primary?: boolean}) {
    return (
        <div data-pokie-primary-metric={primary || undefined}>
            <Text size="xs" c="dimmed">
                {label}
            </Text>
            <Text fw={primary ? 700 : 600} size={primary ? "xl" : undefined} className={primary ? "studio-primary-metric" : undefined}>
                {value}
            </Text>
        </div>
    );
}

function EventTable({table}: {table: StudioExactMathEventTable}) {
    return (
        <Table withRowBorders={false} aria-label="Exact win event probabilities">
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Event</Table.Th>
                    <Table.Th>Probability</Table.Th>
                    <Table.Th>1 in</Table.Th>
                    <Table.Th>RTP contribution</Table.Th>
                    <Table.Th>Outcomes</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {table.entries.map((entry) => (
                    <Table.Tr key={entry.key}>
                        <Table.Td>{entry.label}</Table.Td>
                        <Table.Td>{formatAnalysisNumber(entry.probability * 100, 4)}%</Table.Td>
                        <Table.Td>{formatOneIn(entry.probability)}</Table.Td>
                        <Table.Td>{formatAnalysisNumber(entry.rtpContribution * 100, 4)}%</Table.Td>
                        <Table.Td>{entry.outcomeCount.toLocaleString("en-US")}</Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
}

function ContributionTable({entries}: {entries: StudioExactMathContributionTable["entries"]}) {
    // The server's contribution table is complete but tie order is an implementation detail. Sorting
    // here makes the math-review order explicit and repeatable: contribution first, label second.
    const sortedEntries = orderContributionEntries(entries);
    return (
        <Table withRowBorders={false} aria-label="Exact line and symbol contributions">
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Win</Table.Th>
                    <Table.Th>RTP contribution</Table.Th>
                    <Table.Th>Hit frequency</Table.Th>
                    <Table.Th>Outcomes</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {sortedEntries.map((entry) => (
                    <Table.Tr key={entry.key}>
                        <Table.Td>{entry.label}</Table.Td>
                        <Table.Td>{formatAnalysisNumber(entry.rtpContribution * 100, 4)}%</Table.Td>
                        <Table.Td>{formatAnalysisNumber(entry.hitFrequency * 100, 4)}%</Table.Td>
                        <Table.Td>{entry.outcomeCount.toLocaleString("en-US")}</Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
}
