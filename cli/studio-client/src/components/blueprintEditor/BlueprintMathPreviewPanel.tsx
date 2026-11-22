import {Alert, Button, SimpleGrid, Text, Title} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import {formatAnalysisNumber} from "../../../../../src/internal/formatAnalysisNumber";
import {previewBlueprintMath} from "../../api/apiClient";
import type {StudioBlueprintMathPreviewView} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
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

/**
 * Design Game's on-demand exact math preview. This is deliberately separate from the structural Game
 * Model preview: exact enumeration is the expensive "show me the numbers" action, and a draft is never
 * saved or written to an Outcome Library just to read its RTP. The request is abandoned when the draft
 * changes or the panel unmounts.
 */
export function BlueprintMathPreviewPanel({blueprint, revision}: {blueprint: unknown; revision?: number}) {
    const fetchImpl = useStudioApi();
    const [state, setState] = useState<PreviewState>({status: "idle"});
    const lifecycle = useRef({generation: 0, active: undefined as AbortController | undefined});

    useEffect(() => {
        const requests = lifecycle.current;
        requests.generation++;
        requests.active?.abort();
        setState({status: "idle"});
        return () => {
            requests.generation++;
            requests.active?.abort();
        };
    }, [blueprint, revision, fetchImpl]);

    function calculate(): void {
        lifecycle.current.active?.abort();
        const controller = new AbortController();
        lifecycle.current.active = controller;
        const generation = ++lifecycle.current.generation;
        const isCurrent = (): boolean => lifecycle.current.generation === generation && !controller.signal.aborted;
        setState({status: "loading"});
        previewBlueprintMath(fetchImpl, blueprint, controller.signal)
            .then((view) => {
                if (!isCurrent()) return;
                setState(view.status === "ok"
                    ? {status: "ok", view}
                    : {status: "unavailable", message: view.message});
            })
            .catch((error: unknown) => {
                if (isCurrent()) setState({status: "error", message: errorMessage(error)});
            });
    }

    return (
        <PageSection legend="Math preview">
            <Title order={4}>Exact math preview</Title>
            <Text size="sm" c="dimmed" mb="sm">
                Calculate exact RTP, hit frequency and volatility from this draft without saving a project. Small
                designs are enumerated completely; nothing is written and no sampled estimate is presented as exact.
            </Text>
            <QuickActions>
                <Button onClick={calculate} loading={state.status === "loading"}>
                    Calculate exact math
                </Button>
            </QuickActions>
            {state.status === "loading" && <LoadingState label="Enumerating the current draft…" />}
            {state.status === "unavailable" && (
                <Alert color="yellow" title="Exact math preview isn't available" mt="sm">
                    {state.message}
                </Alert>
            )}
            {state.status === "error" && (
                <ErrorState
                    message="We couldn't calculate exact math for this draft."
                    detail={state.message}
                />
            )}
            {state.status === "ok" && (
                <>
                    <SimpleGrid cols={{base: 2, md: 5}} spacing="sm" mt="sm">
                        <Metric label="Exact RTP" value={`${formatAnalysisNumber(state.view.analysis.rtp * 100, 4)}%`} />
                        <Metric label="Hit frequency" value={`${formatAnalysisNumber(state.view.analysis.hitFrequency * 100, 4)}%`} />
                        <Metric label="Volatility (σ, bet units)" value={formatAnalysisNumber(state.view.analysis.standardDeviation, 4)} />
                        <Metric label="Max win (× bet)" value={formatAnalysisNumber(state.view.analysis.maxWin / state.view.stake, 4)} />
                        <Metric label="Outcomes" value={state.view.outcomeCount.toLocaleString("en-US")} />
                    </SimpleGrid>
                    <Text size="xs" c="dimmed" mt="xs">
                        Draft only — nothing was saved. Exact for the current editor values.
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
