import {Alert, Button, Group, Progress, Text} from "@mantine/core";
import {useEffect, useState} from "react";
import type {StudioJobView} from "../../api/types.js";

const active = (status: StudioJobView["status"]): boolean => status === "queued" || status === "running" || status === "cancelling";

function percentFor(current: number | string | undefined, total: number | string | undefined): number | undefined {
    if (current === undefined || total === undefined) return undefined;
    try {
        // Decimal strings are bigint-safe durable values. Never coerce a
        // large outcome count through Number just to draw a progress bar.
        const completed = BigInt(current);
        const all = BigInt(total);
        if (completed < BigInt(0) || all <= BigInt(0)) return undefined;
        return Number((completed * BigInt(10_000)) / all) / 100;
    } catch {
        return undefined;
    }
}

export function JobProgressCard({job, onCancel}: {job: StudioJobView; onCancel?: (id: string) => void}) {
    const [observedAt, setObservedAt] = useState<number | undefined>();
    useEffect(() => {
        let timer: number | undefined;
        if (job.startedAt !== undefined && job.completedAt === undefined) {
            const update = () => setObservedAt(Date.now());
            update();
            timer = window.setInterval(update, 1000);
        }
        return () => {
            if (timer !== undefined) window.clearInterval(timer);
        };
    }, [job.startedAt, job.completedAt]);
    if (!active(job.status)) return null;
    const progress = job.progress;
    const percent = percentFor(progress?.current, progress?.total);
    const elapsedMs = job.startedAt === undefined ? undefined : (job.completedAt ?? observedAt ?? job.startedAt) - job.startedAt;
    return (
        <Alert color={job.status === "cancelling" ? "orange" : "blue"} title={job.operation}>
            <Group justify="space-between" align="start">
                <div>
                    <Text size="sm">{job.status === "cancelling" ? "Cancellation requested; waiting for cleanup." : progress?.stage ?? "Queued"}</Text>
                    {progress !== undefined && <Text size="xs">{progress.current} / {progress.total} {progress.unit}{progress.message === undefined ? "" : ` · ${progress.message}`}</Text>}
                    {progress === undefined && job.status !== "queued" && <Text size="xs">Progress is indeterminate while this operation prepares its next safe boundary.</Text>}
                    {elapsedMs !== undefined && <Text size="xs">Elapsed: {elapsedMs}ms</Text>}
                </div>
                {job.status !== "cancelling" && onCancel !== undefined && <Button size="xs" variant="light" color="red" onClick={() => onCancel(job.id)}>Cancel</Button>}
            </Group>
            {percent !== undefined && <Progress value={percent} mt="xs" aria-label={`${job.operation} progress`} />}
        </Alert>
    );
}
