import {Button, NumberInput, Progress, Text, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import type {SimulationProgressView, SimulationReportView} from "../../domain/interpret/Simulation";
import {useConfirm} from "../../hooks/useConfirm";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {QuickActions} from "../common/QuickActions";
import {SimulationReportDisplay} from "../common/SimulationReportDisplay";

type FormValues = {rounds: number; seed: string; workers: number};

export function SimulationTab({
    progress,
    report,
    error,
    onRun,
    onCancel,
    onRerun,
    onViewInReports,
}: {
    progress: SimulationProgressView | undefined;
    report: SimulationReportView | undefined;
    error: string | undefined;
    onRun: (rounds: number, seed: string | undefined, workers: number) => void;
    onCancel: () => void;
    onRerun: () => void;
    onViewInReports: () => void;
}) {
    const confirm = useConfirm();
    const form = useForm<FormValues>({mode: "uncontrolled", initialValues: {rounds: 1000, seed: "", workers: 1}});

    const active = progress !== undefined && (progress.status === "queued" || progress.status === "running");
    const terminal = progress !== undefined && !active;

    return (
        <div>
            <form
                onSubmit={form.onSubmit((values) => onRun(values.rounds, values.seed.trim() || undefined, values.workers))}
            >
                <QuickActions>
                    <NumberInput label="Rounds" min={1} step={1} required {...form.getInputProps("rounds")} key={form.key("rounds")} />
                    <TextInput label="Seed (optional)" {...form.getInputProps("seed")} key={form.key("seed")} />
                    <NumberInput label="Workers" min={1} step={1} required {...form.getInputProps("workers")} key={form.key("workers")} />
                    <Button type="submit">Run Simulation</Button>
                </QuickActions>
            </form>

            {progress === undefined && <EmptyState message="No simulation has been run yet." />}
            {progress?.status === "failed" && error === undefined && <ErrorState message={progress.error ?? "Simulation failed."} />}
            {error && <ErrorState message={error} />}

            {progress !== undefined && (
                <div>
                    <Text size="sm" mb={4}>
                        {progress.status} — {progress.roundsCompleted}/{progress.rounds} rounds
                    </Text>
                    <Progress value={progress.percent} mb="sm" />
                    {active && (
                        <QuickActions>
                            <Button
                                color="red"
                                variant="light"
                                onClick={() => confirm("Cancel the running simulation?", onCancel)}
                            >
                                Cancel
                            </Button>
                        </QuickActions>
                    )}
                </div>
            )}

            {terminal && (
                <QuickActions>
                    <Button variant="default" onClick={onRerun}>
                        Run again with the same parameters
                    </Button>
                </QuickActions>
            )}

            {progress?.status === "completed" && report && (
                <div>
                    <SimulationReportDisplay view={report} />
                    <QuickActions>
                        <Button variant="default" onClick={onViewInReports}>
                            View in Reports
                        </Button>
                    </QuickActions>
                </div>
            )}
        </div>
    );
}
