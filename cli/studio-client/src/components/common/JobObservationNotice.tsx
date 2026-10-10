import {Alert, Button, Stack} from "@mantine/core";

export function JobObservationNotice({connectionError, actionError, onReattach}: {
    connectionError?: string;
    actionError?: string;
    onReattach: () => Promise<void>;
}) {
    if (connectionError === undefined && actionError === undefined) return null;
    return (
        <Stack gap="xs">
            {connectionError !== undefined && <Alert role="alert" color="orange">{connectionError}</Alert>}
            {actionError !== undefined && <Alert role="alert" color="red">{actionError}</Alert>}
            <Button variant="default" size="xs" onClick={() => {
                onReattach();
            }}>Reattach to retained work</Button>
        </Stack>
    );
}
