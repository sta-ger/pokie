import {Alert} from "@mantine/core";
import {IconAlertCircle} from "@tabler/icons-react";

// `role="alert"` alone -- it already implies an assertive live region; pairing it with an explicit
// `aria-live="polite"` (as this used to) tells assistive tech to announce it *politely* instead,
// quietly defeating the point of marking it an alert in the first place.
//
// `detail` -- a failed Blueprint materialization's own raw npm diagnostic (see StudioServer's
// "detail"/ProjectDashboardContext's "errorDetail"), or any other optional raw technical text a caller
// has -- never renders inline next to `message`: it sits behind a collapsed native <details> disclosure,
// same convention as cli/client/index.html's own "Raw response" details, so the plain-English `message`
// stays the only thing shown up front.
export function ErrorState({message, detail}: {message: string; detail?: string}) {
    return (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} role="alert" style={{overflowWrap: "anywhere"}}>
            {message}
            {detail && (
                <details style={{marginTop: "0.5rem"}}>
                    <summary style={{cursor: "pointer"}}>Technical details</summary>
                    <pre style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{detail}</pre>
                </details>
            )}
        </Alert>
    );
}
