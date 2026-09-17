import {Alert, Anchor, Stack, Text} from "@mantine/core";
import type {StudioJobView} from "../../api/types.js";

export function JobResultCard({job}: {job: StudioJobView}) {
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
                {job.status === "completed" && job.result?.outputs?.map((output) =>
                    output.downloadPath === undefined
                        ? <Text size="xs" key={output.label}>{output.label}: {output.path}</Text>
                        : <Anchor size="xs" href={output.downloadPath} key={output.label}>{output.label}</Anchor>,
                )}
                {job.recovery !== undefined && <Text size="xs">Next: {job.recovery.action} — {job.recovery.reason}</Text>}
            </Stack>
        </Alert>
    );
}
