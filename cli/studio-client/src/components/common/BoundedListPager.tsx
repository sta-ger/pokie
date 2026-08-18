import {Button, Group, Text} from "@mantine/core";

export function BoundedListPager({
    itemLabel,
    itemCount,
    page,
    pageSize,
    onPageChange,
}: {
    itemLabel: string;
    itemCount: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
}) {
    const start = page * pageSize;
    const lastVisible = Math.min(start + pageSize, itemCount);
    const previousAvailable = page > 0;
    const nextAvailable = lastVisible < itemCount;

    return (
        <Group gap="xs" mb="sm">
            <Text size="sm" c="dimmed">
                Showing {itemLabel} {start + 1}–{lastVisible} of {itemCount}.
            </Text>
            <Button size="xs" variant="default" disabled={!previousAvailable} onClick={() => onPageChange(page - 1)}>
                Previous {pageSize} {itemLabel}
            </Button>
            <Button size="xs" variant="default" disabled={!nextAvailable} onClick={() => onPageChange(page + 1)}>
                Next {pageSize} {itemLabel}
            </Button>
        </Group>
    );
}
