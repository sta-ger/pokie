import {Alert, Anchor, Button, Group, Stack, Text} from "@mantine/core";
import type {StudioJobView} from "../../api/types.js";

function recoveryActionLabel(action: NonNullable<StudioJobView["recovery"]>["action"]): string {
    if (action === "new-session") return "Start new session";
    if (action === "rebuild") return "Rebuild";
    return "Retry";
}

type RecordValue = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is RecordValue {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A durable common job intentionally keeps operation-specific data below
// `detail`: that lets the generic lifecycle survive independently of every
// feature DTO. Recognize the published Outcome Library shape here only to
// render its terminal facts as a result, never to invent them from a path.
function outcomeLibraryResult(job: StudioJobView): RecordValue | undefined {
    const result = job.result?.detail?.result;
    return isRecord(result) && result.status === "ok" && isRecord(result.mode) && isRecord(result.generator) && isRecord(result.selector)
        ? result
        : undefined;
}

function textValue(value: unknown): string | undefined {
    return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function selectorLabel(selector: RecordValue): string {
    if (selector.kind === "bundle" && typeof selector.bundleDir === "string" && typeof selector.modeName === "string") return `Bundle ${selector.bundleDir}, mode ${selector.modeName}`;
    if (selector.kind === "json" && typeof selector.path === "string") return `JSON ${selector.path}`;
    if (selector.kind === "stakeEngine" && typeof selector.stakeDir === "string" && typeof selector.modeName === "string") return `Stake Engine ${selector.stakeDir}, mode ${selector.modeName}`;
    return "Retained selector metadata is incomplete.";
}

export function JobResultCard({job, onRecover, onRecoveryAction, onOpenOutput, onRevealOutput, onInspectOutput, outputActionsUnavailableReason}: {
    job: StudioJobView;
    onRecover?: (id: string) => void;
    onRecoveryAction?: (job: StudioJobView) => void;
    onOpenOutput?: (path: string) => void;
    onRevealOutput?: (path: string) => void;
    onInspectOutput?: (path: string) => void;
    /** Omit host-only controls until this Studio session can truthfully use them. */
    outputActionsUnavailableReason?: string;
}) {
    if (job.status === "queued" || job.status === "running" || job.status === "cancelling") return null;
    let color: "green" | "orange" | "red" = "red";
    if (job.status === "completed") color = "green";
    if (job.status === "recovery-required") color = "orange";
    const title = `${job.operation}: ${job.status}`;
    const outcomeResult = outcomeLibraryResult(job);
    const mode = outcomeResult?.mode as RecordValue | undefined;
    const generator = outcomeResult?.generator as RecordValue | undefined;
    const selector = outcomeResult?.selector as RecordValue | undefined;
    const byteSize = textValue(outcomeResult?.byteSize);
    const outcomeCount = textValue(mode?.outcomeCount);
    const libraryHash = textValue(mode?.hash);
    const configurationHash = textValue(generator?.configHash);
    const generatorStrategy = textValue(generator?.strategy);
    const generatorAlgorithm = textValue(generator?.algorithm);
    const generatedAt = textValue(generator?.generatedAt);
    const generatorGame = isRecord(generator?.game)
        ? [textValue(generator.game.id), textValue(generator.game.version)].filter((entry): entry is string => entry !== undefined).join(" · ")
        : undefined;
    // The durable output is written by StudioOutcomeLibraryGenerateJobService
    // from resolvedBundleDir. Do not substitute the project-relative selector
    // path for a host action when viewing an older incomplete durable record.
    const resolvedOutcomeLibraryPath = textValue(outcomeResult?.resolvedBundleDir);
    return (
        <Alert color={color} title={title}>
            <Stack gap={4}>
                <Text size="sm">{job.result?.summary ?? job.error ?? job.recovery?.reason ?? "No additional result is available."}</Text>
                {job.durationMs !== undefined && <Text size="xs">Duration: {job.durationMs}ms</Text>}
                {job.result?.warnings?.map((warning) => <Text size="xs" c="orange" key={warning}>{warning}</Text>)}
                {outcomeResult !== undefined && (
                    <Stack gap={2} aria-label="Published Outcome Library result">
                        {outcomeCount !== undefined && <Text size="xs">Published outcomes: {outcomeCount}</Text>}
                        <Text size="xs">Final size: {byteSize === undefined ? "unknown" : `${Number(byteSize).toLocaleString()} bytes`}</Text>
                        {libraryHash !== undefined && <Text size="xs" style={{overflowWrap: "anywhere"}}>Library hash: {libraryHash}</Text>}
                        {configurationHash !== undefined && <Text size="xs" style={{overflowWrap: "anywhere"}}>Configuration hash: {configurationHash}</Text>}
                        {(generatorAlgorithm !== undefined || generatorStrategy !== undefined) && <Text size="xs">Generation provenance: {[generatorAlgorithm, generatorStrategy].filter((entry): entry is string => entry !== undefined).join(" · ")}</Text>}
                        {generatorGame !== undefined && <Text size="xs">Source game: {generatorGame}</Text>}
                        {generatedAt !== undefined && <Text size="xs">Generated: {generatedAt}</Text>}
                        {selector !== undefined && <Text size="xs">Selector: {selectorLabel(selector)}</Text>}
                    </Stack>
                )}
                {job.result?.provenance !== undefined &&
                    <details><summary>Inspect provenance</summary><Text size="xs">{JSON.stringify(job.result.provenance)}</Text></details>}
                {job.result?.detail !== undefined &&
                    <details><summary>Inspect operation result</summary><Text size="xs">{JSON.stringify(job.result.detail)}</Text></details>}
                <details>
                    <summary>Inspect retained request</summary>
                    <Text size="xs">{JSON.stringify(job.request)}</Text>
                </details>
                {job.result?.outputs?.map((output) => {
                    const outputPath = job.operation === "outcome-library-generation" && outcomeResult !== undefined
                        ? resolvedOutcomeLibraryPath
                        : output.path;
                    return (
                        <Group gap="xs" key={output.label}>
                            {output.downloadPath !== undefined && <Anchor size="xs" href={output.downloadPath}>Download {output.label}</Anchor>}
                            {job.operation === "outcome-library-generation" && outputPath !== undefined && onInspectOutput !== undefined &&
                                <Button size="xs" variant="subtle" onClick={() => onInspectOutput(outputPath)}>Inspect {output.label}</Button>}
                            {outputPath !== undefined && outputActionsUnavailableReason === undefined && onOpenOutput !== undefined &&
                                <Button size="xs" variant="subtle" onClick={() => onOpenOutput(outputPath)}>Open {output.label}</Button>}
                            {outputPath !== undefined && outputActionsUnavailableReason === undefined && onRevealOutput !== undefined &&
                                <Button size="xs" variant="subtle" onClick={() => onRevealOutput(outputPath)}>Reveal {output.label}</Button>}
                            {outputPath !== undefined && outputActionsUnavailableReason !== undefined &&
                                <Text size="xs">Open and reveal are unavailable: {outputActionsUnavailableReason}</Text>}
                            {output.downloadPath === undefined && (outputPath === undefined || (onOpenOutput === undefined && onRevealOutput === undefined && onInspectOutput === undefined)) &&
                                <Text size="xs">{output.label}{outputPath === undefined ? "" : `: ${outputPath}`}</Text>}
                        </Group>
                    );
                })}
                {job.recovery !== undefined && <Text size="xs">Next: {job.recovery.action} — {job.recovery.reason}</Text>}
                {job.recovery !== undefined && (
                    <Group gap="xs">
                        {job.recovery.action === "resume" && onRecover !== undefined &&
                            <Button size="xs" variant="light" onClick={() => onRecover(job.id)}>Resume</Button>}
                        {job.recovery.action !== "resume" && onRecoveryAction !== undefined &&
                            <Button size="xs" variant="light" onClick={() => onRecoveryAction(job)}>
                                {recoveryActionLabel(job.recovery.action)}
                            </Button>}
                    </Group>
                )}
            </Stack>
        </Alert>
    );
}
