import {Alert, Anchor, Button, Checkbox, Group, Modal, NumberInput, Progress, Stack, Text, TextInput} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import {formatAnalysisNumber} from "../../../../../src/internal/formatAnalysisNumber";
import {describeRtpSanityWarning} from "../../../../../src/reporting/describeRtpSanityWarning";
import {previewBlueprintMath} from "../../api/apiClient";
import type {StudioBlueprintMathPreviewView} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {asStringList} from "../../domain/asStringList";
import {
    applyScatterFreeGamesSetup,
    readFreeGames,
    repeatSelectedReelStrips,
} from "../../domain/blueprintFormOps";
import {
    defaultScatterReels,
    previewScatterFreeGamesSetup,
    suggestScatterSymbolId,
} from "../../domain/scatterFreeGamesSetup";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";

type ExactPreviewState =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "ok"; view: Extract<StudioBlueprintMathPreviewView, {status: "ok"}>}
    | {status: "unavailable"; message: string}
    | {status: "error"; message: string};

// One guided path for the two coupled edits that a first free-games feature always needs: a scatter
// symbol that exists on the reels, and the free-games mechanic that uses it. It deliberately previews
// the exact trigger/retrigger math from the same literal-strip model the game will use, and refuses a
// supercritical starter instead of letting the author discover an unbounded RTP later.
export function ScatterFreeGamesWizard({
    blueprint,
    mutate,
    opened,
    onClose,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    opened: boolean;
    onClose: () => void;
}) {
    const existing = readFreeGames(blueprint);
    const [symbolId, setSymbolId] = useState(() => suggestScatterSymbolId(blueprint));
    const reelStripLengths = Array.isArray(blueprint.reelStrips)
        ? blueprint.reelStrips.map((strip) => Array.isArray(strip) ? strip.length : 0)
        : [];
    const literalReels = reelStripLengths.length > 0
        && !Array.isArray(blueprint.reelSequences)
        && blueprint.reelStripGeneration === undefined
        && blueprint.symbolWeights === undefined;
    const [selectedReels, setSelectedReels] = useState<number[]>(() => defaultScatterReels(reelStripLengths.length));
    // Three selected reels at ten stops each, with the other two starter reels at five stops, produce
    // exactly 10 × 10 × 10 × 5 × 5 = 25,000 reel-stop combinations — the exact-preview cap. Repeating
    // each selected strip preserves its symbol proportions, so the base-game mix is not silently changed.
    const [longerDemoReels, setLongerDemoReels] = useState(true);
    const canUseLongerDemoReels = selectedReels.length > 0 && selectedReels.length <= 3;
    const useLongerDemoReels = longerDemoReels && canUseLongerDemoReels;
    const effectiveReelStripLengths = useLongerDemoReels
        ? reelStripLengths.map((length, index) =>
            selectedReels.includes(index) && length > 0
                ? length * Math.max(1, Math.ceil(10 / length))
                : length,
        )
        : reelStripLengths;
    const effectiveOutcomeSpace = effectiveReelStripLengths.reduce(
        (product, length) => product * Math.max(1, length),
        1,
    );
    // A new demo must not start above 100% RTP with an unbounded retrigger tail. On the 5-stop starter
    // with three 10-stop demo reels these awards land in the normal range; the exact preview below
    // remains the authority and shows the actual total for the current reels.
    const [awards, setAwards] = useState<Record<number, number | string>>(() => ({
        3: existing?.awardsByCount["3"] ?? 7,
        4: existing?.awardsByCount["4"] ?? 10,
        5: existing?.awardsByCount["5"] ?? 13,
    }));
    // A cap is part of the safe demo default for a *new* feature. An existing authored choice is
    // preserved (including an explicitly uncapped one); clearing the field still opts into the
    // uncapped path explicitly.
    const [maxFreeGames, setMaxFreeGames] = useState<number | string | undefined>(() =>
        existing === undefined ? 50 : existing.maxFreeGames,
    );
    // A guided demo still needs an explicit acknowledgement. The copy above explains the values,
    // but a producer must actively confirm they are not treating this as a balanced production game.
    const [demoAcknowledged, setDemoAcknowledged] = useState(false);
    const rows = typeof blueprint.rows === "number" && blueprint.rows > 0 ? blueprint.rows : 3;
    const parsedAwards = {
        3: Number(awards[3] ?? 0),
        4: Number(awards[4] ?? 0),
        5: Number(awards[5] ?? 0),
    };
    const invalidAward = [3, 4, 5].some((count) => !Number.isFinite(parsedAwards[count as 3 | 4 | 5]) || parsedAwards[count as 3 | 4 | 5] < 0);
    const parsedMaxFreeGames = maxFreeGames === "" || maxFreeGames === undefined ? undefined : Number(maxFreeGames);
    const invalidMaxFreeGames =
        parsedMaxFreeGames !== undefined && (!Number.isSafeInteger(parsedMaxFreeGames) || parsedMaxFreeGames < 1);
    const preview = previewScatterFreeGamesSetup({
        rows,
        reelStripLengths: effectiveReelStripLengths,
        selectedReels,
        awards: invalidAward ? {3: 0, 4: 0, 5: 0} : parsedAwards,
    });
    const fetchImpl = useStudioApi();
    const [exactPreview, setExactPreview] = useState<ExactPreviewState>({status: "idle"});
    const [exactProgress, setExactProgress] = useState<{processed: bigint; total: bigint}>();
    const [exactElapsedSeconds, setExactElapsedSeconds] = useState(0);
    const exactLifecycle = useRef({generation: 0, active: undefined as AbortController | undefined});
    useEffect(() => {
        const lifecycleRef = exactLifecycle.current;
        lifecycleRef.generation++;
        lifecycleRef.active?.abort();
        lifecycleRef.active = undefined;
        setExactPreview({status: "idle"});
        setExactProgress(undefined);
        return () => {
            lifecycleRef.generation++;
            lifecycleRef.active?.abort();
        };
    }, [blueprint, symbolId, selectedReels, awards, maxFreeGames, longerDemoReels, fetchImpl]);
    // The exact request is opaque server work with no progress channel. An elapsed clock is the honest
    // signal that it is still running, especially once a 25,000-outcome preview passes a few seconds.
    useEffect(() => {
        if (exactPreview.status !== "loading") {
            setExactElapsedSeconds(0);
            return undefined;
        }
        const startedAt = Date.now();
        setExactElapsedSeconds(0);
        const timer = window.setInterval(() => {
            setExactElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [exactPreview.status]);
    const symbols = asStringList(blueprint.symbols);
    const trimmedId = symbolId.trim();
    let error: string | undefined;
    if (!literalReels) {
        error = "This guided setup works with manual reel strips. Add the scatter in Reels first, or use Symbols.";
    } else if (trimmedId.length === 0) {
        error = "Enter a symbol id for the new scatter.";
    } else if (symbols.includes(trimmedId)) {
        error = `Symbol "${trimmedId}" already exists. Choose a new id, or mark the existing symbol as a scatter in Symbols.`;
    } else if (selectedReels.length < 3) {
        error = "Select at least three reels: the 3/4/5-scatter award table needs three visible scatters to trigger.";
    } else if (invalidAward) {
        error = "Enter a non-negative number of free games for each award.";
    } else if (invalidMaxFreeGames) {
        error = "Enter a whole-number free-games cap of at least 1, or leave the cap blank.";
    } else if (preview.retriggerFactor >= 1 && parsedMaxFreeGames === undefined) {
        error = "This setup can retrigger without a hard cap: trigger probability × average award ≥ 1 would leave total RTP unbounded. Reduce the awards, use fewer scatter reels, or set a maximum free-games cap below.";
    }
    const applyToDraft = (draft: Record<string, unknown>): void => {
        if (useLongerDemoReels) repeatSelectedReelStrips(draft, selectedReels, 10);
        applyScatterFreeGamesSetup(draft, trimmedId, selectedReels, parsedAwards, {
            maxFreeGames: parsedMaxFreeGames,
        });
    };
    const calculateExactRtp = (): void => {
        if (error !== undefined) return;
        exactLifecycle.current.active?.abort();
        const controller = new AbortController();
        exactLifecycle.current.active = controller;
        const generation = ++exactLifecycle.current.generation;
        const isCurrent = (): boolean => exactLifecycle.current.generation === generation && !controller.signal.aborted;
        const draft = JSON.parse(JSON.stringify(blueprint)) as Record<string, unknown>;
        applyToDraft(draft);
        setExactPreview({status: "loading"});
        setExactProgress(undefined);
        previewBlueprintMath(fetchImpl, draft, controller.signal, (processed, total) => {
            if (isCurrent()) setExactProgress({processed, total});
        })
            .then((view) => {
                if (!isCurrent()) return;
                setExactPreview(view.status === "ok" ? {status: "ok", view} : {status: "unavailable", message: view.message});
            })
            .catch((failure: unknown) => {
                if (isCurrent()) setExactPreview({status: "error", message: errorMessage(failure)});
            })
            .finally(() => {
                if (isCurrent()) setExactProgress(undefined);
            });
    };
    const exactEtaSeconds =
        exactProgress !== undefined &&
        exactProgress.total > 0n &&
        exactProgress.processed > 0n &&
        exactProgress.processed < exactProgress.total &&
        exactElapsedSeconds >= 5
            ? Math.max(
                1,
                Math.round(
                    (exactElapsedSeconds / Number(exactProgress.processed)) *
                        Number(exactProgress.total - exactProgress.processed),
                ),
            )
            : undefined;
    const exactFreeGames = exactPreview.status === "ok" && exactPreview.view.freeGamesRtp.status === "available"
        ? exactPreview.view.freeGamesRtp
        : undefined;
    const exactWholeRoundMaxUpperBound =
        exactPreview.status === "ok" &&
        exactFreeGames !== undefined &&
        exactFreeGames.maxFreeGames !== undefined &&
        Number.isFinite(exactPreview.view.analysis.maxWin)
            ? (exactPreview.view.analysis.maxWin * (1 + exactFreeGames.maxFreeGames)) / exactPreview.view.stake
            : undefined;
    const exactWarning = exactPreview.status === "ok"
        ? describeRtpSanityWarning(exactFreeGames?.totalRtp ?? exactPreview.view.analysis.rtp)
        : undefined;
    let starterMathNote: string;
    if (parsedMaxFreeGames !== undefined && Number.isSafeInteger(parsedMaxFreeGames) && parsedMaxFreeGames >= 1) {
        starterMathNote = `The ${parsedMaxFreeGames}-free-game cap keeps total RTP finite even when the retrigger factor is 1 or higher.`;
    } else if (preview.expectedFreeSpins === undefined) {
        starterMathNote = "The retrigger series does not converge; this starter would have unbounded total RTP.";
    } else {
        starterMathNote = `Expected free spins per trigger including retriggers: ${preview.expectedFreeSpins.toFixed(4)}.`;
    }
    const highScatterFrequency = preview.triggerProbability > 0.02;
    let addDemoTitle: string | undefined;
    if (exactPreview.status === "loading") addDemoTitle = "Wait for the exact RTP calculation to finish, or cancel it before adding.";
    else if (!demoAcknowledged) addDemoTitle = "Confirm that you understand this is a demo setup before adding.";
    const reelLengthDescription =
        reelStripLengths.length > 0 && new Set(reelStripLengths).size === 1
            ? `${reelStripLengths[0]} stops on each of ${reelStripLengths.length} reels`
            : `${reelStripLengths.join(" / ")} stops across the reels`;
    return (
        <Modal opened={opened} onClose={onClose} title="Set up scatter + free games" size="md">
            <Stack gap="sm">
                <Text size="sm" c="dimmed">
                    Add a new scatter symbol, place it on the reels, and enable free games in one step.
                    These are <strong>safe demo values</strong>: 7 free games for three scatters, a 50-free-game cap
                    and the 10-stop demo reels option enabled. The exact preview below shows the actual total for the
                    current reels; tune the awards, paytable or reel weights after adding the feature. One existing
                    stop on each selected reel is replaced, so the base-game RTP changes too.
                </Text>
                <Text size="xs" c="dimmed">
                    This starter has only {reelLengthDescription}. That is useful for a quick demo, but a scatter
                    placed on one stop is visible very often; a production game needs a much rarer scatter. Use the
                    10-stop demo reels option below for a closer demo, or import a PAR sheet for a production-like
                    scatter frequency. The cap keeps retriggers finite; you can clear it explicitly for an unbounded
                    experiment.
                </Text>
                <TextInput
                    label="New scatter symbol id"
                    value={symbolId}
                    onChange={(event) => setSymbolId(event.currentTarget.value)}
                    autoFocus
                />
                <Checkbox.Group
                    label="Reels carrying the scatter"
                    value={selectedReels.map(String)}
                    onChange={(values) => setSelectedReels(values.map(Number))}
                >
                    <Group mt={6} gap="md">
                        {reelStripLengths.map((_, index) => (
                            <Checkbox key={index} value={String(index)} label={`Reel ${index + 1}`} />
                        ))}
                    </Group>
                </Checkbox.Group>
                <Checkbox
                    label="Use 10-stop demo reels on the scatter reels"
                    description="Repeats each selected reel to at least 10 stops. On the 5-stop starter with three scatter reels this stays at the 25,000-outcome exact-preview cap and lowers the demo trigger frequency without changing unselected reels."
                    checked={useLongerDemoReels}
                    disabled={!canUseLongerDemoReels}
                    onChange={(event) => setLongerDemoReels(event.currentTarget.checked)}
                />
                {selectedReels.length > 3 && (
                    <Text size="xs" c="dimmed">
                        The 10-stop option is limited to three scatter reels. With more selected reels, the exact
                        preview may exceed its 25,000-outcome cap; turn it off or import a PAR sheet for a
                        production-like scatter frequency.
                    </Text>
                )}
                {useLongerDemoReels && effectiveOutcomeSpace > 25_000 && (
                    <Alert color="yellow" variant="light" title="Exact preview may be unavailable">
                        The longer demo reels create {effectiveOutcomeSpace.toLocaleString("en-US")} reel-stop
                        combinations, above the 25,000-outcome exact-preview cap. Turn the option off, or use
                        Simulation / a sampled outcome table for a larger design.
                    </Alert>
                )}
                <Group align="flex-end" gap="sm">
                    <NumberInput
                        label="3 scatters free games awarded"
                        aria-label="3 scatters free games awarded"
                        min={0}
                        value={awards[3]}
                        onChange={(value) => setAwards((current) => ({...current, 3: value}))}
                    />
                    <NumberInput
                        label="4 scatters free games awarded"
                        aria-label="4 scatters free games awarded"
                        min={0}
                        value={awards[4]}
                        onChange={(value) => setAwards((current) => ({...current, 4: value}))}
                    />
                    <NumberInput
                        label="5 scatters free games awarded"
                        aria-label="5 scatters free games awarded"
                        min={0}
                        value={awards[5]}
                        onChange={(value) => setAwards((current) => ({...current, 5: value}))}
                    />
                </Group>
                <NumberInput
                    label="Maximum free games per feature (optional)"
                    aria-label="Maximum free games per feature"
                    description="Caps the trigger award and every retrigger. New setups start with a 50-free-game demo cap; clear it only for an unbounded experiment. Required when the retrigger factor is 1 or higher."
                    min={1}
                    value={maxFreeGames}
                    onChange={setMaxFreeGames}
                />
                {preview.retriggerFactor >= 1 && parsedMaxFreeGames === undefined && (
                    <Group>
                        <Button size="xs" variant="default" onClick={() => setMaxFreeGames(50)}>
                            Use a 50-free-game cap
                        </Button>
                    </Group>
                )}
                {selectedReels.length < 5 && (
                    <Text size="xs" c="dimmed">
                        With {selectedReels.length} scatter reels, {selectedReels.length < 4 ? "4- and 5-scatter awards are" : "the 5-scatter award is"} unreachable.
                        The engine treats an unreachable count as zero; add the scatter to more reels later if you want that tier.
                    </Text>
                )}
                {highScatterFrequency && (
                    <Alert color="yellow" variant="light" title="Scatter frequency is high for a real slot">
                        <Text size="sm">
                            A trigger probability of {(preview.triggerProbability * 100).toFixed(4)}% is still high
                            for a production slot. The safe demo award ladder brings total RTP into a normal range,
                            but a real game still needs a rarer scatter and reels tuned for its market. Import a PAR
                            sheet or lengthen the reels for a production-like frequency; the cap guarantees the
                            feature ends, not that the demo is market-ready.
                        </Text>
                        <Anchor
                            href="#/docs/reel-strip-generation"
                            target="_blank"
                            rel="noreferrer"
                            size="sm"
                            mt={4}
                            display="block"
                        >
                            Read about reel-strip generation (opens a new tab)
                        </Anchor>
                    </Alert>
                )}
                <Alert color={preview.retriggerFactor >= 1 && parsedMaxFreeGames === undefined ? "red" : "blue"} variant="light" title="Starter math preview — demo values, not a balanced game">
                    <Text size="sm">
                        Trigger probability: {(preview.triggerProbability * 100).toFixed(4)}%;
                        average award: {preview.expectedAward.toFixed(4)} free games;
                        retrigger factor: {preview.retriggerFactor.toFixed(4)}.
                    </Text>
                    <Text size="xs" c="dimmed">
                        Retrigger factor = trigger probability × average award: the expected number of retrigger
                        awards per free spin.
                    </Text>
                    <Text size="sm">{starterMathNote}</Text>
                </Alert>
                <Group>
                    <Button
                        variant="default"
                        size="xs"
                        onClick={calculateExactRtp}
                        loading={exactPreview.status === "loading"}
                        disabled={error !== undefined}
                    >
                        Calculate exact RTP for this setup
                    </Button>
                </Group>
                {exactPreview.status === "loading" && (
                    <>
                        <LoadingState
                            label={`Enumerating this setup… ${exactElapsedSeconds}s${
                                exactEtaSeconds === undefined ? "" : ` · rough ETA ~${exactEtaSeconds}s`
                            }`}
                        />
                        {exactProgress !== undefined && exactProgress.total > 0n && (
                            <div>
                                <Progress
                                    value={Number((exactProgress.processed * 10_000n) / exactProgress.total) / 100}
                                    aria-label="Exact RTP progress"
                                />
                                <Text size="xs" c="dimmed" mt={4}>
                                    {exactProgress.processed === exactProgress.total
                                        ? "All raw combinations enumerated; finalizing the exact analysis…"
                                        : `${exactProgress.processed.toLocaleString("en-US")} / ${exactProgress.total.toLocaleString("en-US")} raw combinations`}
                                </Text>
                            </div>
                        )}
                        {exactProgress === undefined && (
                            <Text size="xs" c="dimmed">Preparing the exact enumeration…</Text>
                        )}
                        <Text size="xs" c="dimmed" role="status" aria-live="polite">
                            Add is disabled until this exact check finishes, so you can review the RTP first. It can take
                            a while for a 25,000-outcome setup; cancel the check if you want to add the demo values
                            without it.
                        </Text>
                        <Group>
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() => {
                                    exactLifecycle.current.generation++;
                                    exactLifecycle.current.active?.abort();
                                    exactLifecycle.current.active = undefined;
                                    setExactPreview({status: "idle"});
                                    setExactProgress(undefined);
                                }}
                            >
                                Cancel calculation
                            </Button>
                        </Group>
                    </>
                )}
                {exactPreview.status === "unavailable" && (
                    <Alert color="yellow" variant="light" title="Exact RTP is unavailable for this setup">
                        {exactPreview.message}
                    </Alert>
                )}
                {exactPreview.status === "error" && (
                    <ErrorState message="Could not calculate exact RTP for this setup." detail={exactPreview.message} />
                )}
                {exactPreview.status === "ok" && (
                    <Alert color={exactWarning === undefined ? "blue" : "yellow"} variant="light" title="Exact RTP for this setup">
                        {exactFreeGames !== undefined ? (
                            <Text size="sm">
                                Total RTP {formatAnalysisNumber(exactFreeGames.totalRtp * 100, 4)}% ={" "}
                                {formatAnalysisNumber(exactFreeGames.baseRtp * 100, 4)}% paid-spin +{" "}
                                {formatAnalysisNumber(exactFreeGames.featureRtp * 100, 4)}% free games.
                            </Text>
                        ) : (
                            <Text size="sm">
                                Paid-spin RTP {formatAnalysisNumber(exactPreview.view.analysis.rtp * 100, 4)}%.
                                {exactPreview.view.freeGamesRtp.status === "available" ? "" : ` ${exactPreview.view.freeGamesRtp.reason}`}
                            </Text>
                        )}
                        {exactFreeGames !== undefined && (
                            <Text size="sm" mt={4}>
                                Max whole-round win:{" "}
                                {exactFreeGames.maxFreeGames === undefined
                                    ? "unbounded without a cap"
                                    : `${formatAnalysisNumber(exactWholeRoundMaxUpperBound ?? 0, 4)}× bet (upper bound with cap)`}.
                            </Text>
                        )}
                        {exactWarning !== undefined && <Text size="sm" mt={4}>{exactWarning}</Text>}
                        <Text size="xs" c="dimmed" mt={4}>
                            Draft only — nothing was saved. This is the exact result for the scatter placement and awards above.
                        </Text>
                    </Alert>
                )}
                {error !== undefined && <Text size="sm" c="red" role="alert">{error}</Text>}
                <Checkbox
                    label="I understand this is a demo starting point, not a balanced production game. I will retune the paytable or reels before production."
                    checked={demoAcknowledged}
                    onChange={(event) => setDemoAcknowledged(event.currentTarget.checked)}
                    data-pokie-demo-acknowledgement="scatter-free-games"
                />
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cancel</Button>
                    <Button
                        disabled={error !== undefined || exactPreview.status === "loading" || !demoAcknowledged}
                        title={addDemoTitle}
                        onClick={() => {
                            mutate((draft) => applyToDraft(draft));
                            onClose();
                        }}
                    >
                        Add scatter and free games
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
