import {Table, Text} from "@mantine/core";
import {AdvancedValidationPanel} from "./AdvancedValidationPanel";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {useCallback, useEffect, useId, useRef, useState} from "react";
import {previewMathDefinitionDiff} from "../../api/apiClient";
import type {MathDefinitionDiff} from "../../api/types";
import type {MathDefinitionValue} from "../../../../../src/diff/MathDefinitionDiff.js";
import {describeDefinitionChangePath} from "../../domain/definitionChangeLabels";
import {describeDefinitionComparison} from "../../domain/definitionComparisonNotice";
import {useStudioApi} from "../../context/StudioApiProvider";

type PreviewState =
    | {status: "idle" | "loading" | "cancelled"}
    | {status: "error"; message: string}
    | {status: "loaded"; diff: MathDefinitionDiff};

function formatDefinitionValue(value: MathDefinitionValue): string {
    if (!value.present) return "(absent)";
    const raw = value.value;
    if (raw === null) return "null";
    if (typeof raw === "string") return raw.length > 180 ? `${raw.slice(0, 177)}…` : raw;
    if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
    const serialized = JSON.stringify(raw);
    return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized;
}

/** Renders server results; owns only request lifecycle, never definition comparison logic. */
export function MathDefinitionDiffPreview({
    sourcePath,
    projectRoot,
    draft,
    revision = 0,
    autoCompare = false,
    leftLabel = "Saved source",
    rightLabel = "Current draft",
    swapSides = false,
}: {
    sourcePath?: string;
    projectRoot?: string;
    draft?: unknown;
    revision?: number;
    /** Run once when the source and draft are both available, e.g. on an explicit PAR import preview step. */
    autoCompare?: boolean;
    /** Name of the diff's left snapshot (the `sourcePath`). PAR import passes "Imported PAR". */
    leftLabel?: string;
    /** Name of the diff's right snapshot (the draft, or the compared saved source when no draft is supplied). */
    rightLabel?: string;
    /**
     * Display the draft in the left column and the source in the right column. The API still compares
     * source (before) to draft (after); this only aligns the table with a surrounding current-first view.
     */
    swapSides?: boolean;
}) {
    const fetchImpl = useStudioApi();
    const compareExplanationId = useId();
    const [rightPath, setRightPath] = useState("");
    const [state, setState] = useState<PreviewState>({status: "idle"});
    const lifecycle = useRef({generation: 0, active: undefined as AbortController | undefined});
    // Revision and source identity invalidate even transports which ignore AbortSignal.
    useEffect(() => {
        const requests = lifecycle.current;
        requests.generation++;
        requests.active?.abort();
        setState({status: "idle"});
        return () => {
            requests.generation++;
            requests.active?.abort();
        };
    }, [sourcePath, projectRoot, draft, revision, rightPath]);

    const cancel = (): void => {
        lifecycle.current.generation++;
        lifecycle.current.active?.abort();
        setState({status: "cancelled"});
    };
    const compare = useCallback(async (): Promise<void> => {
        if (!sourcePath || (draft === undefined && !rightPath.trim())) return;
        lifecycle.current.active?.abort();
        const controller = new AbortController();
        lifecycle.current.active = controller;
        const requestGeneration = ++lifecycle.current.generation;
        setState({status: "loading"});
        try {
            const diff = await previewMathDefinitionDiff(
                fetchImpl,
                {leftPath: sourcePath, projectRoot, revision, ...(draft === undefined ? {rightPath} : {draft})},
                controller.signal,
            );
            if (lifecycle.current.generation !== requestGeneration || controller.signal.aborted) return;
            setState({status: "loaded", diff});
        } catch (error) {
            if (lifecycle.current.generation !== requestGeneration || controller.signal.aborted) return;
            setState({status: "error", message: error instanceof Error ? error.message : String(error)});
        }
    }, [draft, fetchImpl, projectRoot, revision, rightPath, sourcePath]);

    useEffect(() => {
        if (!autoCompare || !sourcePath || draft === undefined) return;
        compare().catch(() => undefined);
    }, [autoCompare, compare, draft, sourcePath]);
    let compareDisabledReason: string | undefined;
    if (!sourcePath) compareDisabledReason = "Load or save a source before comparing definitions.";
    else if (draft === undefined && !rightPath.trim()) compareDisabledReason = "Choose a saved source to compare with the current definition.";
    const comparisonNotice = state.status === "loaded" ? describeDefinitionComparison(state.diff) : undefined;
    return (
        <section aria-label="Mathematical definition comparison">
            <h3>Mathematical definition comparison</h3>
            {!sourcePath && <p>Load or save a source to compare its saved definition with this draft.</p>}
            {draft === undefined && (
                <label>
                    Compare with saved source{" "}
                    <input
                        aria-label="Compare with saved source"
                        value={rightPath}
                        onChange={(event) => setRightPath(event.target.value)}
                    />
                </label>
            )}
            <button
                type="button"
                disabled={!sourcePath || (draft === undefined && !rightPath.trim())}
                aria-describedby={compareDisabledReason ? compareExplanationId : undefined}
                onClick={() => {
                    compare().catch(() => undefined);
                }}
            >
                {draft === undefined ? "Compare definitions" : "Compare saved versus draft"}
            </button>
            {compareDisabledReason && <p id={compareExplanationId}>{compareDisabledReason}</p>}
            {state.status === "loading" && (
                <>
                    <p role="status">Comparing definitions…</p>
                    <button type="button" onClick={cancel}>
                        Cancel comparison
                    </button>
                </>
            )}
            {state.status === "cancelled" && <p role="status">Comparison cancelled. Run it again when ready.</p>}
            {state.status === "error" && (
                <p role="alert">Comparison failed: {state.message} Check the source paths and retry.</p>
            )}
            {state.status === "loaded" && (
                <div>
                    {comparisonNotice !== undefined && (
                        <Text role="status" size="sm">
                            Definition comparison: <strong>{comparisonNotice.label}</strong>.
                            {comparisonNotice.detail === undefined ? "" : ` ${comparisonNotice.detail}`}
                        </Text>
                    )}
                    {state.diff.changes.some((change) => change.mathematical) && (
                        <Table.ScrollContainer minWidth={620} mt="xs">
                            <Table aria-label="Mathematical definition differences">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Field</Table.Th>
                                        <Table.Th>{leftLabel}</Table.Th>
                                        <Table.Th>{draft === undefined ? "Compared source" : rightLabel}</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {state.diff.changes.filter((change) => change.mathematical).map((change) => (
                                        <Table.Tr key={change.path}>
                                            <Table.Td><Text size="sm" style={{overflowWrap: "anywhere"}}>{describeDefinitionChangePath(change)}</Text></Table.Td>
                                            <Table.Td><Text size="sm">{formatDefinitionValue(swapSides ? change.after : change.before)}</Text></Table.Td>
                                            <Table.Td><Text size="sm">{formatDefinitionValue(swapSides ? change.before : change.after)}</Text></Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    )}
                    {state.diff.changes.some((change) => change.mathematical) && (
                        <Text size="xs" c="dimmed" mt={4}>
                            Technical JSON paths remain available under “technical comparison details”.
                        </Text>
                    )}
                    {state.diff.changes.some((change) => change.seededTraceImpact) && (
                        <Text size="sm" c="orange" mt="xs">
                            At least one change may affect a seeded trace. Re-run a simulation if you rely on a recorded seed.
                        </Text>
                    )}
                    <AdvancedDisclosure label="technical comparison details">
                        <Text size="sm" fw={600} mb={4}>Comparison scope</Text>
                        <Text size="sm">{state.diff.scope}</Text>
                        <Text size="sm" fw={600} mt="sm" mb={4}>Recorded identities</Text>
                        <pre style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>
                            {JSON.stringify({left: state.diff.left.identity, right: state.diff.right.identity}, null, 2)}
                        </pre>
                        {["left", "right"].map((side) => {
                            const source = state.diff[side as "left" | "right"];
                            return (
                                <div key={side}>
                                    <Text size="sm" fw={600} mt="sm">
                                        {side}: {source.support}
                                    </Text>
                                    <AdvancedValidationPanel report={source.advanced} />
                                    {source.limits.map((limit, i) => (
                                        <Text key={i} size="sm">Limit: {limit}</Text>
                                    ))}
                                    {source.diagnostics.map((issue, i) => (
                                        <Text key={i} size="sm">
                                            {issue.severity} {issue.code} {issue.path}: {issue.message}
                                        </Text>
                                    ))}
                                </div>
                            );
                        })}
                        {state.diff.changes.map((change, i) => (
                            <div key={i}>
                                <Text size="sm" fw={600} mt="sm">
                                    {change.path} [{change.classification}]
                                </Text>
                                {change.seededTraceImpact && <Text size="sm">Seeded trace may be affected.</Text>}
                                <pre style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>
                                    {JSON.stringify(
                                        {context: change.context, before: change.before, after: change.after},
                                        null,
                                        2,
                                    )}
                                </pre>
                            </div>
                        ))}
                    </AdvancedDisclosure>
                </div>
            )}
        </section>
    );
}
