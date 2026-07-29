import {Group, Text, ThemeIcon, VisuallyHidden} from "@mantine/core";
import {IconAlertCircle, IconCircle, IconCircleCheck, IconLock, IconPlayerTrackNextFilled, IconPointFilled} from "@tabler/icons-react";
import type {ReactNode} from "react";

// A read-only, non-navigable counterpart to Mantine's `Stepper` -- for a flow whose active stage is
// purely a *derived* function of domain state (no `onStepClick`, nothing to jump to), rendering it with
// `Stepper` produces a row of real `<button>`s that do nothing when clicked: keyboard/screen-reader
// users get an affordance that lies about being interactive. This renders as a plain `<ol>` of `<li>`s
// (no button/tabindex), and each stage's status (both the decorative icon and the color) is mirrored as
// real text via `VisuallyHidden` -- same icon+VisuallyHidden split StatusBadge.tsx already uses, so the
// same information never depends on color or icon shape alone. See docs/studio-frontend.md's Stepper/
// wizard UX audit for why this exists alongside the interactive `Stepper` usages the rest of Studio's
// project tabs keep.
//
// `aria-current="step"` marks the caller's *position* in the flow -- "current" (in progress, healthy) and
// "failed" (attempted at this position, but it errored) both describe that position; the other four
// statuses describe steps the flow isn't sitting at right now (already done, not reached yet, or
// explicitly unreachable/bypassed). A flow only ever sits at one position, so only the first step whose
// status is "current" or "failed" is marked aria-current="step" -- this keeps the semantics singular even
// if a caller mistakenly hands us more than one current-position status in the same list.
export type StepProgressStatus = "completed" | "current" | "available" | "blocked" | "skipped" | "failed";

const CURRENT_POSITION_STATUSES: ReadonlySet<StepProgressStatus> = new Set(["current", "failed"]);

export type StepProgressItem = {
    id: string;
    label: string;
    description?: string;
    status: StepProgressStatus;
};

const STATUS_TEXT: Record<StepProgressStatus, string> = {
    completed: "completed",
    current: "current step",
    available: "not started",
    blocked: "blocked",
    skipped: "skipped",
    failed: "failed",
};

const STATUS_COLOR: Record<StepProgressStatus, string> = {
    completed: "green",
    current: "blue",
    available: "gray",
    blocked: "gray",
    skipped: "gray",
    failed: "red",
};

const STATUS_ICON: Record<StepProgressStatus, ReactNode> = {
    completed: <IconCircleCheck size={14} />,
    current: <IconPointFilled size={14} />,
    available: <IconCircle size={14} />,
    blocked: <IconLock size={14} />,
    skipped: <IconPlayerTrackNextFilled size={14} />,
    failed: <IconAlertCircle size={14} />,
};

export function StepProgressList({steps}: {steps: StepProgressItem[]}) {
    const currentPositionId = steps.find((step) => CURRENT_POSITION_STATUSES.has(step.status))?.id;

    return (
        <Group component="ol" gap="lg" wrap="wrap" mb="md" style={{listStyle: "none", padding: 0}} role="list" aria-label="Progress">
            {steps.map((step) => {
                const isCurrentPosition = step.id === currentPositionId;
                return (
                    <Group
                        key={step.id}
                        component="li"
                        gap="xs"
                        wrap="nowrap"
                        aria-current={isCurrentPosition ? "step" : undefined}
                        aria-disabled={step.status === "blocked" ? true : undefined}
                    >
                        <ThemeIcon size="sm" radius="xl" color={STATUS_COLOR[step.status]} variant={step.status === "available" ? "outline" : "light"} aria-hidden="true">
                            {STATUS_ICON[step.status]}
                        </ThemeIcon>
                        <div>
                            <Text size="sm" fw={isCurrentPosition ? 600 : 400}>
                                {step.label}
                                <VisuallyHidden component="span">, {STATUS_TEXT[step.status]}</VisuallyHidden>
                            </Text>
                            {step.description && (
                                <Text size="xs" c="dimmed">
                                    {step.description}
                                </Text>
                            )}
                        </div>
                    </Group>
                );
            })}
        </Group>
    );
}
