import type {JobDiscoveryStatus} from "../../hooks/useDurableJobs";
import {Alert, Button, Stack, Text} from "@mantine/core";

export function JobObservationNotice({discoveryStatus, connectionError, actionError, onReattach}: {
    discoveryStatus?: JobDiscoveryStatus;
    connectionError?: string;
    actionError?: string;
    onReattach: () => Promise<void>;
}) {
    if (discoveryStatus !== "pending" && connectionError === undefined && actionError === undefined) return null;
    return (
        <Stack gap="xs">
            {discoveryStatus === "pending" && <Text role="status">Checking for retained work…</Text>}
            {connectionError !== undefined && <Alert role="alert" color="orange">{connectionError}</Alert>}
            {actionError !== undefined && <Alert role="alert" color="red">{actionError}</Alert>}
            {(connectionError !== undefined || actionError !== undefined) && <Button variant="default" size="xs" onClick={() => {
                onReattach();
            }}>Reattach to retained work</Button>}
        </Stack>
    );
}
