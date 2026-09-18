import {Alert, Button, Group, Progress, Text} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
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
        return Math.min(100, Number((completed * BigInt(10_000)) / all) / 100);
    } catch {
        return undefined;
    }
}

export function JobProgressCard({job, onCancel}: {job: StudioJobView; onCancel?: (id: string) => void}) {
    const [observedAt, setObservedAt] = useState<number | undefined>();
    const previousProgress = useRef<{stage: string; unit: string; current: bigint; at: number} | undefined>();
    const [rate, setRate] = useState<{perSecond: number; etaMs: number} | undefined>();
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
    useEffect(() => {
        const progress = job.progress;
        if (progress === undefined) {
            previousProgress.current = undefined;
            setRate(undefined);
            return;
        }
        try {
            const current = BigInt(progress.current);
            const total = BigInt(progress.total);
            if (current < BigInt(0) || total <= BigInt(0)) throw new Error("indeterminate progress");
            const now = Date.now();
            const previous = previousProgress.current;
            previousProgress.current = {stage: progress.stage, unit: progress.unit, current, at: now};
            if (previous === undefined || previous.stage !== progress.stage || previous.unit !== progress.unit || current <= previous.current || now <= previous.at) {
                setRate(undefined);
                return;
            }
            const advanced = current - previous.current;
            const remaining = total > current ? total - current : BigInt(0);
            // A numeric rate is presentation-only. Refuse a lossy conversion
            // for very large bigint deltas rather than fabricating an ETA.
            if (advanced > BigInt(Number.MAX_SAFE_INTEGER) || remaining > BigInt(Number.MAX_SAFE_INTEGER)) {
                setRate(undefined);
                return;
            }
            const perSecond = Number(advanced) / ((now - previous.at) / 1000);
            if (!Number.isFinite(perSecond) || perSecond <= 0) {
                setRate(undefined);
                return;
            }
            setRate({perSecond, etaMs: Number(remaining) / perSecond * 1000});
        } catch {
            previousProgress.current = undefined;
            setRate(undefined);
        }
    }, [job.progress?.current, job.progress?.stage, job.progress?.total, job.progress?.unit]);
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
                    {rate !== undefined && <Text size="xs">Throughput: {rate.perSecond.toFixed(2)} {progress?.unit}/s · ETA: {Math.ceil(rate.etaMs)}ms</Text>}
                </div>
                {job.status !== "cancelling" && onCancel !== undefined && <Button size="xs" variant="light" color="red" onClick={() => onCancel(job.id)}>Cancel</Button>}
            </Group>
            {percent !== undefined && <Progress value={percent} mt="xs" aria-label={`${job.operation} progress`} />}
        </Alert>
    );
}
