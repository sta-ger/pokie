import {Alert, Badge, Button, Table, Text} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import {previewBlueprintMath} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {
    describeParSheetImportMathComparison,
    type ParSheetImportMathComparison,
} from "../../domain/parSheetImportMathComparison";
import {errorMessage} from "../../domain/errorMessage";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";

type ComparisonState =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "ready"; comparison: ParSheetImportMathComparison}
    | {status: "error"; message: string};

/**
 * Exact math comparison for the PAR import preview. Both sides are enumerated from the drafts the
 * author is comparing, never from a workbook MathSummary that may belong to a different model or
 * POKIE version. The action is explicit because enumerating two drafts can take a few seconds.
 */
export function ParSheetImportMathComparison({current, imported}: {current: unknown; imported: unknown}) {
    const fetchImpl = useStudioApi();
    const [state, setState] = useState<ComparisonState>({status: "idle"});
    const lifecycle = useRef({generation: 0, active: undefined as AbortController | undefined});

    useEffect(() => {
        const lifecycleRef = lifecycle.current;
        lifecycleRef.generation++;
        lifecycleRef.active?.abort();
        lifecycleRef.active = undefined;
        setState({status: "idle"});
        return () => {
            lifecycleRef.generation++;
            lifecycleRef.active?.abort();
        };
    }, [current, imported, fetchImpl]);

    const compare = (): void => {
        lifecycle.current.active?.abort();
        const controller = new AbortController();
        lifecycle.current.active = controller;
        const generation = ++lifecycle.current.generation;
        const isCurrent = (): boolean => lifecycle.current.generation === generation && !controller.signal.aborted;
        setState({status: "loading"});
        // Enumerate one draft at a time: both requests are CPU-bound exact enumerations, and the
        // server should not be asked to run two of them merely to save a few seconds.
        const run = async (): Promise<void> => {
            const currentView = await previewBlueprintMath(fetchImpl, current, controller.signal);
            if (!isCurrent()) return;
            const importedView = await previewBlueprintMath(fetchImpl, imported, controller.signal);
            if (!isCurrent()) return;
            setState({status: "ready", comparison: describeParSheetImportMathComparison(currentView, importedView)});
        };
        run().catch((error: unknown) => {
            if (isCurrent()) setState({status: "error", message: errorMessage(error)});
        });
    };

    return (
        <PageSection legend="Exact math comparison">
            <Text size="sm" c="dimmed" mb="xs">
                Calculate exact RTP and payout statistics for both the current draft and the imported workbook. Nothing
                is saved or written to an outcome table. This enumerates both drafts and can take a while for a small
                design; a design too large for complete enumeration is reported honestly instead of sampled.
            </Text>
            <Button variant="default" onClick={compare} loading={state.status === "loading"}>
                Compare exact RTP
            </Button>
            {state.status === "loading" && <LoadingState label="Enumerating both drafts…" />}
            {state.status === "error" && (
                <ErrorState message="Could not compare exact math for these two drafts." detail={state.message} />
            )}
            {state.status === "ready" && state.comparison.status === "unavailable" && (
                <Alert color="yellow" variant="light" title="Exact comparison is unavailable" mt="sm">
                    {state.comparison.message}
                </Alert>
            )}
            {state.status === "ready" && state.comparison.status === "ok" && (
                <>
                    <Table.ScrollContainer minWidth={620} mt="sm">
                        <Table aria-label="PAR import exact math comparison">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Metric</Table.Th>
                                    <Table.Th>Current draft</Table.Th>
                                    <Table.Th>Imported PAR</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {state.comparison.rows.map((row) => (
                                    <Table.Tr key={row.key}>
                                        <Table.Th scope="row">{row.label}</Table.Th>
                                        <Table.Td>{row.current}</Table.Td>
                                        <Table.Td>
                                            <Text span fw={row.changed ? 600 : undefined}>
                                                {row.imported}
                                            </Text>
                                            {row.changed && (
                                                <Badge size="xs" variant="light" ml={6}>
                                                    different
                                                </Badge>
                                            )}
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                    {state.comparison.rtpWarnings?.current !== undefined && (
                        <Alert color="yellow" variant="light" title="Current draft RTP looks unusual" mt="sm">
                            {state.comparison.rtpWarnings.current}
                        </Alert>
                    )}
                    {state.comparison.rtpWarnings?.imported !== undefined && (
                        <Alert color="yellow" variant="light" title="Imported PAR RTP looks unusual" mt="sm">
                            {state.comparison.rtpWarnings.imported}
                        </Alert>
                    )}
                    <Text size="xs" c="dimmed" mt="xs">
                        Draft only — nothing was saved. Total RTP appears when both drafts have a complete whole-round
                        total: an additive free-games derivation, or no later-settling feature at all. A draft with
                        other feature payouts and no supported derivation keeps paid-spin RTP as its only honest
                        comparable value.
                    </Text>
                </>
            )}
        </PageSection>
    );
}
