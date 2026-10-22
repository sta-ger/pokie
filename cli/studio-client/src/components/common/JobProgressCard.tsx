import {Alert, Button, Group, Progress, Text} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import type {StudioJobView} from "../../api/types.js";

const active = (status: StudioJobView["status"]): boolean => status === "queued" || status === "running" || status === "cancelling";

function statusLabel(status: StudioJobView["status"]): string {
    if (status === "cancelling") return "Cancelling";
    if (status === "queued") return "Queued";
    return "Running";
}

// Persisted/extension samples are not guaranteed to be measured work. Validate
// the pair together and never clamp an incompatible sample into completion.
function measuredProgress(progress: StudioJobView["progress"]): {current: bigint; total: bigint} | undefined {
    if (progress === undefined || typeof progress.unit !== "string" || !progress.unit.trim()) return undefined;
    const count = (value: number | string): bigint | undefined => {
        if (typeof value === "number" ? !Number.isSafeInteger(value) : !(/^[0-9]+$/).test(value)) return undefined;
        try {
            const parsed = BigInt(value);
            return parsed < BigInt(0) ? undefined : parsed;
        } catch {
            return undefined;
        }
    };
    const current = count(progress.current);
    const total = count(progress.total);
    if (current === undefined || total === undefined || total <= BigInt(0) || current > total) return undefined;
    return {current, total};
}

export function JobProgressCard({job, onCancel, cancellationPending = false}: {job: StudioJobView; onCancel?: (id: string) => void; cancellationPending?: boolean}) {
    const [observedAt, setObservedAt] = useState<number | undefined>(undefined);
    const previousProgress = useRef<{id: string; projectId: string; startedAt?: number; stage: string; unit: string; current: bigint; total: bigint; at: number} | undefined>(undefined);
    const [rate, setRate] = useState<(Pick<StudioJobView, "id" | "projectId" | "startedAt" | "progress"> & {perSecond: number; etaMs: number}) | undefined>();
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
    }, [job.id, job.projectId, job.startedAt, job.completedAt]);
    useEffect(() => {
        const progress = job.progress;
        if (progress === undefined || job.status !== "running" || cancellationPending) {
            previousProgress.current = undefined;
            setRate(undefined);
            return;
        }
        try {
            const measured = measuredProgress(progress);
            if (measured === undefined) throw new Error("indeterminate progress");
            const {current, total} = measured;
            const now = Date.now();
            const previous = previousProgress.current;
            previousProgress.current = {id: job.id, projectId: job.projectId, startedAt: job.startedAt, stage: progress.stage, unit: progress.unit, current, total, at: now};
            // A rate belongs to one owned execution. Its work samples cannot
            // estimate another run or the unmeasured cancellation cleanup.
            if (previous === undefined || previous.id !== job.id || previous.projectId !== job.projectId || previous.startedAt !== job.startedAt || previous.stage !== progress.stage || previous.unit !== progress.unit || previous.total !== total || current <= previous.current || now <= previous.at) {
                setRate(undefined);
                return;
            }
            const advanced = current - previous.current;
            const remaining = total - current;
            // A numeric rate is presentation-only. Refuse a lossy conversion
            // for very large bigint deltas rather than fabricating an ETA.
            if (remaining === BigInt(0) || advanced > BigInt(Number.MAX_SAFE_INTEGER) || remaining > BigInt(Number.MAX_SAFE_INTEGER)) {
                setRate(undefined);
                return;
            }
            const perSecond = Number(advanced) / ((now - previous.at) / 1000);
            if (!Number.isFinite(perSecond) || perSecond <= 0) {
                setRate(undefined);
                return;
            }
            setRate({id: job.id, projectId: job.projectId, startedAt: job.startedAt, progress, perSecond, etaMs: Number(remaining) / perSecond * 1000});
        } catch {
            previousProgress.current = undefined;
            setRate(undefined);
        }
    }, [job.id, job.projectId, job.startedAt, job.status, job.progress, cancellationPending]);
    if (!active(job.status)) return null;
    const progress = job.progress;
    // Effects reset the sampling baseline, but the first committed render
    // already has to exclude another execution, snapshot or cleanup phase.
    const measured = measuredProgress(progress);
    const visibleRate = measured !== undefined && measured.current < measured.total && job.status === "running" && !cancellationPending && rate?.id === job.id && rate.projectId === job.projectId && rate.startedAt === job.startedAt && rate.progress === progress ? rate : undefined;
    const percent = measured === undefined ? undefined : Number((measured.current * BigInt(10_000)) / measured.total) / 100;
    const elapsedMs = job.startedAt === undefined ? undefined : (job.completedAt ?? observedAt ?? job.startedAt) - job.startedAt;
    let description = progress?.stage ?? statusLabel(job.status);
    if (job.status === "cancelling") description = "Cancellation requested; waiting for cleanup.";
    else if (cancellationPending) description = "Sending cancellation request…";
    return (
        <Alert className="studio-job-card" color={job.status === "cancelling" ? "orange" : "blue"} title={`${job.operation} · ${statusLabel(job.status)}`} role="status" aria-live="polite">
            <Group justify="space-between" align="start" wrap="wrap">
                <div style={{flex: "1 1 12rem", minWidth: 0}}>
                    <Text size="sm" data-job-detail>{description}</Text>
                    {progress !== undefined && <Text size="xs" data-job-detail>{progress.current}{measured === undefined ? " / unknown" : ` / ${progress.total}`} {progress.unit}{progress.message === undefined ? "" : ` · ${progress.message}`}</Text>}
                    {measured === undefined && job.status !== "queued" && <Text size="xs" data-job-detail>Progress is indeterminate; the current phase has no compatible measured total.</Text>}
                    {elapsedMs !== undefined && <Text size="xs" c="dimmed">Elapsed: {elapsedMs}ms</Text>}
                    {visibleRate !== undefined && <Text size="xs" c="dimmed">Throughput: {visibleRate.perSecond.toFixed(2)} {progress?.unit}/s · ETA: {Math.ceil(visibleRate.etaMs)}ms</Text>}
                </div>
                {onCancel !== undefined && <Button size="xs" variant="light" color="red" disabled={cancellationPending || job.status === "cancelling"} onClick={() => onCancel(job.id)}>Cancel</Button>}
            </Group>
            {percent !== undefined && <Progress value={percent} mt="xs" aria-label={`${job.operation} progress`} />}
        </Alert>
    );
}
