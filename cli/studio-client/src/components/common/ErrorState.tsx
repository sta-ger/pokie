import {Alert} from "@mantine/core";
import {IconAlertCircle} from "@tabler/icons-react";

// `role="alert"` alone -- it already implies an assertive live region; pairing it with an explicit
// `aria-live="polite"` (as this used to) tells assistive tech to announce it *politely* instead,
// quietly defeating the point of marking it an alert in the first place.
export function ErrorState({message}: {message: string}) {
    return (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} role="alert" style={{overflowWrap: "anywhere"}}>
            {message}
        </Alert>
    );
}
