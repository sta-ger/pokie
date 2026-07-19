import {Alert} from "@mantine/core";
import {IconAlertTriangle} from "@tabler/icons-react";

// Sibling to ErrorState/EmptyState -- for a notice that's blocking-but-not-erroneous ("you can't do
// this right now", not "something failed"). Several tabs were reaching for ErrorState (red) for this
// class of message; this gives them a correctly-toned (yellow) alternative instead.
export function WarningState({message}: {message: string}) {
    return (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} role="status" aria-live="polite" style={{overflowWrap: "anywhere"}}>
            {message}
        </Alert>
    );
}
