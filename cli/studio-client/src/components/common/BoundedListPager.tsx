import {Button, Group, Text} from "@mantine/core";

export function BoundedListPager({
    idPrefix,
    itemLabel,
    itemCount,
    page,
    pageSize,
    onPageChange,
}: {
    idPrefix?: string;
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
            <Button
                id={idPrefix === undefined ? undefined : `${idPrefix}-previous`}
                size="xs"
                variant="default"
                disabled={!previousAvailable}
                title={previousAvailable ? undefined : `There are no earlier ${itemLabel}.`}
                onClick={() => onPageChange(page - 1)}
            >
                Previous {pageSize} {itemLabel}
            </Button>
            <Button
                id={idPrefix === undefined ? undefined : `${idPrefix}-next`}
                size="xs"
                variant="default"
                disabled={!nextAvailable}
                title={nextAvailable ? undefined : `There are no later ${itemLabel}.`}
                onClick={() => onPageChange(page + 1)}
            >
                Next {pageSize} {itemLabel}
            </Button>
        </Group>
    );
}
