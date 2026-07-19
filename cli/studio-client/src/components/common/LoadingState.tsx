import {Group, Loader, Text} from "@mantine/core";

export function LoadingState({label = "Loading…"}: {label?: string}) {
    return (
        <Group gap="xs" role="status" aria-live="polite">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
                {label}
            </Text>
        </Group>
    );
}
