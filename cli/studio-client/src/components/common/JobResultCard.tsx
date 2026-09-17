import {Alert, Anchor, Button, Group, Stack, Text} from "@mantine/core";
import type {StudioJobView} from "../../api/types.js";

export function JobResultCard({job, onRecover, onOpenOutput}: {job: StudioJobView; onRecover?: (id: string) => void; onOpenOutput?: (path: string) => void}) {
    if (job.status === "queued" || job.status === "running" || job.status === "cancelling") return null;
    let color: "green" | "orange" | "red" = "red";
    if (job.status === "completed") color = "green";
    if (job.status === "recovery-required") color = "orange";
    const title = `${job.operation}: ${job.status}`;
    return (
        <Alert color={color} title={title}>
            <Stack gap={4}>
                <Text size="sm">{job.result?.summary ?? job.error ?? job.recovery?.reason ?? "No additional result is available."}</Text>
                {job.durationMs !== undefined && <Text size="xs">Duration: {job.durationMs}ms</Text>}
                {job.result?.warnings?.map((warning) => <Text size="xs" c="orange" key={warning}>{warning}</Text>)}
                {job.result?.provenance !== undefined &&
                    <details><summary>Inspect provenance</summary><Text size="xs">{JSON.stringify(job.result.provenance)}</Text></details>}
                {job.result?.outputs?.map((output) => (
                    <Group gap="xs" key={output.label}>
                        {output.downloadPath !== undefined && <Anchor size="xs" href={output.downloadPath}>Download {output.label}</Anchor>}
                        {output.path !== undefined && onOpenOutput !== undefined &&
                            <Button size="xs" variant="subtle" onClick={() => onOpenOutput(output.path!)}>Open {output.label}</Button>}
                        {output.downloadPath === undefined && (output.path === undefined || onOpenOutput === undefined) &&
                            <Text size="xs">{output.label}{output.path === undefined ? "" : `: ${output.path}`}</Text>}
                    </Group>
                ))}
                {job.recovery !== undefined && <Text size="xs">Next: {job.recovery.action} — {job.recovery.reason}</Text>}
                {job.recovery?.action === "resume" && onRecover !== undefined &&
                    <Group gap="xs"><Button size="xs" variant="light" onClick={() => onRecover(job.id)}>Resume</Button></Group>}
            </Stack>
        </Alert>
    );
}
