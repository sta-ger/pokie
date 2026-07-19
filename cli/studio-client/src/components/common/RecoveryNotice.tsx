import {Alert, Button, type ButtonProps, type MantineColor} from "@mantine/core";
import {IconAlertTriangle} from "@tabler/icons-react";
import type {ReactNode} from "react";

// The "something about the world moved out from under you, here's how to recover" pattern -- a yellow
// Alert with one inline recovery action -- independently hand-rolled in half a dozen tabs (a stale
// selection, a save/export conflict, a round no longer available). One shared rendering instead.
// `actionColor`/`actionVariant` let a destructive recovery (e.g. "Overwrite") keep its red styling,
// same convention Phase C establishes for a single, non-repeated destructive action elsewhere.
// `role="alert"` (implicit assertive) -- every call site is "you need to notice and act on this now",
// not a routine status update.
export function RecoveryNotice({
    title,
    message,
    actionLabel,
    onAction,
    actionColor,
    actionVariant,
}: {
    title?: string;
    message: ReactNode;
    actionLabel: string;
    onAction: () => void;
    actionColor?: MantineColor;
    actionVariant?: ButtonProps["variant"];
}) {
    return (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} title={title} role="alert" mb="sm" style={{overflowWrap: "anywhere"}}>
            {message}
            <Button size="xs" mt="sm" color={actionColor} variant={actionVariant} onClick={onAction}>
                {actionLabel}
            </Button>
        </Alert>
    );
}
