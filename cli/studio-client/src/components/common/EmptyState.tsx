import {Button, Stack, Text} from "@mantine/core";

export function EmptyState({
    message,
    actionLabel,
    onAction,
}: {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
}) {
    return (
        <Stack gap="xs" align="flex-start" role="status" aria-live="polite">
            <Text size="sm" c="dimmed" style={{overflowWrap: "anywhere"}}>
                {message}
            </Text>
            {actionLabel && onAction && <Button size="xs" onClick={onAction}>{actionLabel}</Button>}
        </Stack>
    );
}
