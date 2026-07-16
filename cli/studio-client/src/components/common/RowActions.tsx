import {ActionIcon, Group} from "@mantine/core";
import {IconArrowDown, IconArrowUp, IconCopy, IconTrash} from "@tabler/icons-react";

export type RowActionsProps = {
    // Identifies the row for its aria-labels, e.g. "symbol 2" -> "Move symbol 2 up" -- matches the
    // existing app's exact aria-label convention (see dom.ts's appendRowActions).
    itemLabel: string;
    onDuplicate?: () => void;
    onRemove: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
};

export function RowActions({itemLabel, onDuplicate, onRemove, onMoveUp, onMoveDown}: RowActionsProps) {
    return (
        <Group gap={4} wrap="nowrap">
            {onMoveUp && (
                <ActionIcon variant="subtle" aria-label={`Move ${itemLabel} up`} onClick={onMoveUp}>
                    <IconArrowUp size={16} />
                </ActionIcon>
            )}
            {onMoveDown && (
                <ActionIcon variant="subtle" aria-label={`Move ${itemLabel} down`} onClick={onMoveDown}>
                    <IconArrowDown size={16} />
                </ActionIcon>
            )}
            {onDuplicate && (
                <ActionIcon variant="subtle" aria-label={`Duplicate ${itemLabel}`} onClick={onDuplicate}>
                    <IconCopy size={16} />
                </ActionIcon>
            )}
            <ActionIcon variant="subtle" color="red" aria-label={`Remove ${itemLabel}`} onClick={onRemove}>
                <IconTrash size={16} />
            </ActionIcon>
        </Group>
    );
}
