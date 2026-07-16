import {Alert} from "@mantine/core";
import {IconAlertCircle} from "@tabler/icons-react";

export function ErrorState({message}: {message: string}) {
    return (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} role="alert" aria-live="polite">
            {message}
        </Alert>
    );
}
