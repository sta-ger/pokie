import {Alert, Button, Group, Progress, Text} from "@mantine/core";
import type {StudioJobView} from "../../api/types.js";

const active = (status: StudioJobView["status"]): boolean => status === "queued" || status === "running" || status === "cancelling";

export function JobProgressCard({job, onCancel}: {job: StudioJobView; onCancel?: (id: string) => void}) {
    if (!active(job.status)) return null;
    const progress = job.progress;
    const current = progress === undefined ? 0 : Number(progress.current);
    const total = progress === undefined ? 0 : Number(progress.total);
    const percent = Number.isFinite(current) && Number.isFinite(total) && total > 0 ? Math.max(0, Math.min(100, current / total * 100)) : undefined;
    return (
        <Alert color={job.status === "cancelling" ? "orange" : "blue"} title={job.operation}>
            <Group justify="space-between" align="start">
                <div>
                    <Text size="sm">{job.status === "cancelling" ? "Cancellation requested; waiting for cleanup." : progress?.stage ?? "Queued"}</Text>
                    {progress !== undefined && <Text size="xs">{progress.current} / {progress.total} {progress.unit}{progress.message === undefined ? "" : ` · ${progress.message}`}</Text>}
                    {progress === undefined && job.status !== "queued" && <Text size="xs">Progress is indeterminate while this operation prepares its next safe boundary.</Text>}
                </div>
                {job.status !== "cancelling" && onCancel !== undefined && <Button size="xs" variant="light" color="red" onClick={() => onCancel(job.id)}>Cancel</Button>}
            </Group>
            {percent !== undefined && <Progress value={percent} mt="xs" aria-label={`${job.operation} progress`} />}
        </Alert>
    );
}
