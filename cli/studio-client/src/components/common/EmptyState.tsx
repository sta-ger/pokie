import {Text} from "@mantine/core";

export function EmptyState({message}: {message: string}) {
    return (
        <Text size="sm" c="dimmed">
            {message}
        </Text>
    );
}
