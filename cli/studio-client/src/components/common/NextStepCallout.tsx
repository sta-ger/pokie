import {Alert, Button, Group, Text} from "@mantine/core";
import {IconArrowRight, IconCircleCheck, IconInfoCircle} from "@tabler/icons-react";
import type {ReactNode} from "react";

export type NextStepTone = "info" | "success" | "warning";

const TONE_COLOR: Record<NextStepTone, string> = {info: "blue", success: "green", warning: "yellow"};
const TONE_ICON: Record<NextStepTone, ReactNode> = {
    info: <IconInfoCircle size={16} />,
    success: <IconCircleCheck size={16} />,
    warning: <IconInfoCircle size={16} />,
};

// The one shared "here's what to do next" affordance -- used by Project Overview's recommended-action
// summary and the guided Blueprint Editor's step hint, so the pattern reads the same everywhere in the
// happy path instead of every screen inventing its own next-step copy/styling.
export function NextStepCallout({
    title,
    description,
    actionLabel,
    onAction,
    tone = "info",
}: {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    tone?: NextStepTone;
}) {
    return (
        <Alert
            color={TONE_COLOR[tone]}
            variant="light"
            icon={TONE_ICON[tone]}
            title={title}
            role="status"
            aria-live="polite"
            mb="md"
            style={{overflowWrap: "anywhere"}}
        >
            <Text size="sm" mb={actionLabel && onAction ? "sm" : 0}>
                {description}
            </Text>
            {actionLabel && onAction && (
                <Group>
                    <Button size="xs" rightSection={<IconArrowRight size={14} />} onClick={onAction}>
                        {actionLabel}
                    </Button>
                </Group>
            )}
        </Alert>
    );
}
