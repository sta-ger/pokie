import {Alert, Button, Progress, SimpleGrid, Text, Title} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import {formatAnalysisNumber} from "../../../../../src/internal/formatAnalysisNumber";
import {describeRtpSanityWarning} from "../../../../../src/reporting/describeRtpSanityWarning";
import {previewBlueprintMath} from "../../api/apiClient";
import type {StudioBlueprintMathPreviewView} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {describeFeatureEventLabel} from "../../domain/featureEventLabels";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

type PreviewState =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "ok"; view: Extract<StudioBlueprintMathPreviewView, {status: "ok"}>}
    | {status: "unavailable"; message: string}
    | {status: "error"; message: string};

export type BlueprintMathPreviewStatus = PreviewState["status"];

/**
 * Design Game's on-demand exact math preview. This is deliberately separate from the structural Game
 * Model preview: exact enumeration is the expensive "show me the numbers" action, and a draft is never
 * saved or written to an Outcome Library just to read its RTP. The request is abandoned when the draft
 * changes or the panel unmounts.
 */
export function BlueprintMathPreviewPanel({
    blueprint,
    mode = "draft",
    disabledReason,
    onRetryDisabled,
    onStatusChange,
    onSaveAndTune,
    saveAndTuneDisabledReason,
}: {
    blueprint: unknown;
    /** "saved" keeps the same preview mounted after a Game Model save; "draft" is Design Game. */
    mode?: "draft" | "saved";
    /**
     * Present while the saved design's raw content is still being loaded (or could not be loaded).
     * Disables the action instead of sending an empty placeholder draft to the exact-math endpoint.
     */
    disabledReason?: string;
    /** Offered only for a failed saved-design load, never while the first read is still in flight. */
    onRetryDisabled?: () => void;
    onStatusChange?: (status: BlueprintMathPreviewStatus) => void;
    /** Save the current design, then open Overview with Optimize math in view. */
    onSaveAndTune?: () => void;
    /** Why the save-and-tune action is unavailable in the current editor state. */
    saveAndTuneDisabledReason?: string;
}) {
    const fetchImpl = useStudioApi();
    const [state, setState] = useState<PreviewState>({status: "idle"});
    const [progress, setProgress] = useState<{processed: bigint; total: bigint}>();
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    // Save itself does not change the authored content, so a save must not erase an exact result the
    // author just computed. Only an actual value change resets it (and aborts any request in flight).
    const blueprintContent = JSON.stringify(blueprint);
    const freeGamesTotal = state.status === "ok" && state.view.freeGamesRtp.status === "available" ? state.view.freeGamesRtp : undefined;
    const wholeRoundMaxUpperBound =
        state.status === "ok" &&
        freeGamesTotal !== undefined &&
        freeGamesTotal.maxFreeGames !== undefined &&
        Number.isFinite(state.view.analysis.maxWin)
            ? (state.view.analysis.maxWin * (1 + freeGamesTotal.maxFreeGames)) / state.view.stake
            : undefined;
    let wholeRoundMaxLabel: string | undefined;
    let wholeRoundMaxValue: string | undefined;
    if (freeGamesTotal !== undefined) {
        wholeRoundMaxLabel =
            freeGamesTotal.maxFreeGames === undefined
                ? "Max whole-round win (no cap)"
                : "Max whole-round win (upper bound, capped)";
        if (freeGamesTotal.maxFreeGames === undefined) wholeRoundMaxValue = "Unbounded";
        else if (wholeRoundMaxUpperBound === undefined) wholeRoundMaxValue = "Unavailable";
        else wholeRoundMaxValue = `${formatAnalysisNumber(wholeRoundMaxUpperBound, 4)}× bet`;
    }
    const freeGamesUnavailableReason = state.status === "ok" && state.view.freeGamesRtp.status !== "available" ? state.view.freeGamesRtp.reason : undefined;
    const retriggerUnbounded = freeGamesUnavailableReason?.includes("unbounded") ?? false;
    let paidSpinLabel = "Exact RTP";
    if (freeGamesTotal !== undefined) paidSpinLabel = "Paid-spin RTP";
    else if (state.status === "ok" && state.view.featureBreakdown.featureEvents.length > 0) paidSpinLabel = "Exact RTP (paid spins)";
    const lifecycle = useRef({generation: 0, active: undefined as AbortController | undefined});
    // Exact math is a local, expensive request. A transient transport failure should not leave the
    // guided readiness checklist permanently "Blocked"; retry the same content once, while a genuine
    // unavailable/validation result is never retried.
    const retriedContent = useRef<string | undefined>(undefined);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        const requests = lifecycle.current;
        requests.generation++;
        requests.active?.abort();
        retriedContent.current = undefined;
        if (retryTimer.current !== undefined) {
            clearTimeout(retryTimer.current);
            retryTimer.current = undefined;
        }
        setState({status: "idle"});
        setProgress(undefined);
        setElapsedSeconds(0);
        return () => {
            requests.generation++;
            requests.active?.abort();
            if (retryTimer.current !== undefined) {
                clearTimeout(retryTimer.current);
                retryTimer.current = undefined;
            }
        };
    }, [blueprintContent, fetchImpl]);

    useEffect(() => {
        onStatusChange?.(state.status);
    }, [onStatusChange, state.status]);

    // Exact enumeration is opaque server work. The progress endpoint is advisory; the elapsed clock
    // is the honest fallback signal when the server cannot report a processed/total count yet.
    useEffect(() => {
        if (state.status !== "loading") {
            setElapsedSeconds(0);
            return undefined;
        }
        const startedAt = Date.now();
        setElapsedSeconds(0);
        const timer = window.setInterval(() => {
            setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [state.status]);

    function calculate(): void {
        if (disabledReason !== undefined) return;
        if (retryTimer.current !== undefined) {
            clearTimeout(retryTimer.current);
            retryTimer.current = undefined;
        }
        lifecycle.current.active?.abort();
        const controller = new AbortController();
        lifecycle.current.active = controller;
        const generation = ++lifecycle.current.generation;
        const isCurrent = (): boolean => lifecycle.current.generation === generation && !controller.signal.aborted;
        setState({status: "loading"});
        setProgress(undefined);
        previewBlueprintMath(fetchImpl, blueprint, controller.signal, (processed, total) => {
            if (isCurrent()) setProgress({processed, total});
        })
            .then((view) => {
                if (!isCurrent()) return;
                if (view.status === "ok") {
                    retriedContent.current = undefined;
                    setState({status: "ok", view});
                } else {
                    setState({status: "unavailable", message: view.message});
                }
            })
            .catch((error: unknown) => {
                if (!isCurrent()) return;
                setState({status: "error", message: errorMessage(error)});
                if (retriedContent.current !== blueprintContent) {
                    retriedContent.current = blueprintContent;
                    retryTimer.current = setTimeout(() => {
                        retryTimer.current = undefined;
                        if (lifecycle.current.generation === generation && !controller.signal.aborted) {
                            calculate();
                        }
                    }, 1_000);
                }
            })
            .finally(() => {
                if (isCurrent()) setProgress(undefined);
            });
    }

    return (
        <PageSection legend="Math preview">
            <Title order={4}>{mode === "saved" ? "Exact math preview for the saved design" : "Draft exact math preview"}</Title>
            <Text size="sm" c="dimmed" mb="sm">
                {mode === "saved"
                    ? "Calculate exact RTP, hit frequency and volatility from the saved design without writing the project's outcome table. Small designs are enumerated completely; nothing is written and no sampled estimate is presented as exact."
                    : "Calculate exact RTP, hit frequency and volatility from this draft without saving a project. Small designs are enumerated completely; nothing is written and no sampled estimate is presented as exact."}
            </Text>
            <QuickActions>
                <Button onClick={calculate} loading={state.status === "loading"} disabled={disabledReason !== undefined}>
                    Calculate exact math
                </Button>
            </QuickActions>
            {disabledReason !== undefined && (
                <Alert color="yellow" title="Math preview is not ready" mt="sm">
                    <Text size="sm">{disabledReason}</Text>
                    {onRetryDisabled !== undefined && (
                        <Button size="xs" variant="default" mt="sm" onClick={onRetryDisabled}>
                            Retry loading saved design
                        </Button>
                    )}
                </Alert>
            )}
            {state.status === "loading" && (
                <>
                    <LoadingState
                        label={`${mode === "saved" ? "Enumerating the saved design" : "Enumerating the current draft"}… ${elapsedSeconds}s`}
                    />
                    {progress !== undefined && progress.total > 0n ? (
                        <div>
                            <Progress
                                value={Number((progress.processed * 10_000n) / progress.total) / 100}
                                aria-label="Exact RTP progress"
                            />
                            <Text size="xs" c="dimmed" mt={4}>
                                {progress.processed === progress.total
                                    ? "All raw combinations enumerated; finalizing the exact analysis…"
                                    : `${progress.processed.toLocaleString("en-US")} / ${progress.total.toLocaleString("en-US")} raw combinations`}
                            </Text>
                        </div>
                    ) : (
                        <Text size="xs" c="dimmed">
                            Preparing the exact enumeration…
                        </Text>
                    )}
                </>
            )}
            {state.status === "unavailable" && (
                <Alert color="yellow" title="Exact math preview isn't available" mt="sm">
                    {state.message}
                </Alert>
            )}
            {state.status === "error" && (
                <ErrorState
                    message={mode === "saved" ? "We couldn't calculate exact math for the saved design." : "We couldn't calculate exact math for this draft."}
                    detail={state.message}
                />
            )}
            {state.status === "ok" && (
                <>
                    {freeGamesTotal !== undefined ? (
                        <Alert color="blue" variant="light" title={freeGamesTotal.maxFreeGames === undefined ? "Free-games RTP included" : "Free-games RTP included (capped)"} mt="sm">
                            <Text size="sm">
                                Total RTP includes additive free-game retriggers{freeGamesTotal.maxFreeGames === undefined ? "" : ` capped at ${freeGamesTotal.maxFreeGames} free games per feature`}: {formatAnalysisNumber(freeGamesTotal.baseRtp * 100, 4)}% paid-spin +{" "}
                                {formatAnalysisNumber(freeGamesTotal.featureRtp * 100, 4)}% free games ={" "}
                                <strong>{formatAnalysisNumber(freeGamesTotal.totalRtp * 100, 4)}%</strong>.
                            </Text>
                            <Text size="xs" mt={4}>The model assumes free spins use the same reels, paytable and bet, and each trigger awards the recorded count.</Text>
                            {freeGamesTotal.maxFreeGames === undefined && (
                                <Text size="xs" mt={4}>
                                    Authored free games are additive and uncapped. This is an expected-value RTP; it does not prove that every possible round settles.
                                </Text>
                            )}
                        </Alert>
                    ) : state.view.featureBreakdown.featureEvents.length > 0 && (
                        <Alert color="yellow" variant="light" title={retriggerUnbounded ? "Unbounded total RTP" : "Paid-spin preview"} mt="sm">
                            <Text size="sm">
                                This draft records feature triggers ({state.view.featureBreakdown.featureEvents.map((event) => describeFeatureEventLabel(event.key)).join(", ")}),
                                but their later feature payouts — for example free-game wins — are not included in this exact RTP.
                                {freeGamesUnavailableReason === undefined ? "" : ` ${freeGamesUnavailableReason}`}
                            </Text>
                            <Text size="xs" mt={4}>
                                {retriggerUnbounded
                                    ? "Simulation cannot produce a finite long-run RTP for this model. Reduce the free-games award or scatter frequency before testing."
                                    : "Use Simulation for total RTP, or compare this with the base-game partition."}
                            </Text>
                        </Alert>
                    )}
                    {describeRtpSanityWarning(freeGamesTotal?.totalRtp ?? state.view.analysis.rtp) !== undefined && (
                        <Alert color="yellow" variant="light" title="RTP looks unusual" mt="sm">
                            <Text size="sm">{describeRtpSanityWarning(freeGamesTotal?.totalRtp ?? state.view.analysis.rtp)}</Text>
                        </Alert>
                    )}
                    <SimpleGrid cols={{base: 2, md: freeGamesTotal === undefined ? 5 : 4}} spacing="sm" mt="sm">
                        {freeGamesTotal !== undefined && <Metric label="Total RTP (paid + free games)" value={`${formatAnalysisNumber(freeGamesTotal.totalRtp * 100, 4)}%`} />}
                        <Metric label={paidSpinLabel} value={`${formatAnalysisNumber(state.view.analysis.rtp * 100, 4)}%`} />
                        {freeGamesTotal !== undefined && <Metric label="Free-games RTP" value={`${formatAnalysisNumber(freeGamesTotal.featureRtp * 100, 4)}%`} />}
                        <Metric label={freeGamesTotal !== undefined ? "Hit frequency (paid spins)" : "Hit frequency"} value={`${formatAnalysisNumber(state.view.analysis.hitFrequency * 100, 4)}%`} />
                        <Metric label={freeGamesTotal !== undefined ? "Volatility (std. deviation, bet units, paid spins)" : "Volatility (std. deviation, bet units)"} value={formatAnalysisNumber(state.view.analysis.standardDeviation, 4)} />
                        <Metric label={freeGamesTotal !== undefined ? "Max win (paid spins)" : "Max win (× bet)"} value={formatAnalysisNumber(state.view.analysis.maxWin / state.view.stake, 4)} />
                        {wholeRoundMaxLabel !== undefined && wholeRoundMaxValue !== undefined && (
                            <Metric label={wholeRoundMaxLabel} value={wholeRoundMaxValue} />
                        )}
                        <Metric label={freeGamesTotal !== undefined ? "Outcomes (paid spins)" : "Outcomes"} value={state.view.outcomeCount.toLocaleString("en-US")} />
                    </SimpleGrid>
                    {onSaveAndTune !== undefined && (
                        <QuickActions>
                            <Button
                                variant="default"
                                onClick={onSaveAndTune}
                                disabled={saveAndTuneDisabledReason !== undefined}
                                data-pokie-save-and-tune
                            >
                                Save and tune RTP
                            </Button>
                        </QuickActions>
                    )}
                    {onSaveAndTune !== undefined && (
                        <Text size="xs" c="dimmed" mt={4}>
                            Saves this design and opens Optimize math on Overview, where you can search for a target
                            RTP.{saveAndTuneDisabledReason === undefined ? "" : ` ${saveAndTuneDisabledReason}`}
                        </Text>
                    )}
                    <Text size="xs" c="dimmed" mt="xs">
                        {mode === "saved"
                            ? "Preview only — these figures are not the project's stored outcome table. Use Compute exact outcome table on Overview to write it."
                            : "Draft only — nothing was saved. Exact for the values currently applied to this draft."}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                        Volatility is the standard deviation of payout per round, in bet units. Max win can exceed the
                        largest paytable entry when several lines win in the same round. With a cap, the whole-round
                        maximum is an upper bound: the paid-spin maximum plus the cap in free spins, each at the
                        paid-spin maximum. Without a cap, the theoretical whole-round maximum is unbounded.
                    </Text>
                </>
            )}
        </PageSection>
    );
}

function Metric({label, value}: {label: string; value: string}) {
    return (
        <div>
            <Text size="xs" c="dimmed">{label}</Text>
            <Text fw={600}>{value}</Text>
        </div>
    );
}
