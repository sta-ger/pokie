import {Alert, Button, type ButtonProps, type MantineColor} from "@mantine/core";
import {IconAlertTriangle} from "@tabler/icons-react";
import type {ReactNode} from "react";

// The "something about the world moved out from under you, here's how to recover" pattern -- a yellow
// Alert with one inline recovery action -- independently hand-rolled in half a dozen tabs (a stale
// selection, a save/export conflict, a round no longer available). One shared rendering instead.
// `actionColor`/`actionVariant` let a destructive recovery (e.g. "Overwrite") keep its red styling,
// same convention Phase C establishes for a single, non-repeated destructive action elsewhere.
// `secondaryActionLabel`/`onSecondaryAction` are an optional second, subdued button alongside the
// primary one -- for a recovery with a genuine two-way choice (e.g. draft recovery's own Restore/
// Discard) rather than a single "fix it" action; omitted (every other existing call site), this renders
// exactly as it always has. `role="alert"` (implicit assertive) -- every call site is "you need to
// notice and act on this now", not a routine status update.
export function RecoveryNotice({
    title,
    message,
    actionLabel,
    onAction,
    actionColor,
    actionVariant,
    secondaryActionLabel,
    onSecondaryAction,
    actionsDisabled,
}: {
    title?: string;
    message: ReactNode;
    actionLabel: string;
    onAction: () => void;
    actionColor?: MantineColor;
    actionVariant?: ButtonProps["variant"];
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
    actionsDisabled?: boolean;
}) {
    return (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} title={title} role="alert" mb="sm" style={{overflowWrap: "anywhere"}}>
            {message}
            <Button size="xs" mt="sm" color={actionColor} variant={actionVariant} onClick={onAction} disabled={actionsDisabled}>
                {actionLabel}
            </Button>
            {secondaryActionLabel && onSecondaryAction && (
                <Button size="xs" mt="sm" ml="xs" variant="subtle" onClick={onSecondaryAction} disabled={actionsDisabled}>
                    {secondaryActionLabel}
                </Button>
            )}
        </Alert>
    );
}

// Availability is not restoration: opening a route must neither apply nor save a retained draft.
// Keep the choice visible but disabled while the owner is saving a different edit.
export function DraftRecoveryNotice({available, subject, disabled, onRestore, onDiscard}: {
    available: boolean;
    subject: string;
    disabled?: boolean;
    onRestore: () => void;
    onDiscard: () => void;
}) {
    if (!available) return null;
    return <RecoveryNotice
        message={`An unsaved ${subject} draft is available in this tab. Restore it to continue editing, or Discard it. Restoring does not save changes.`}
        actionLabel="Restore"
        onAction={onRestore}
        secondaryActionLabel="Discard"
        onSecondaryAction={onDiscard}
        actionsDisabled={disabled}
    />;
}
