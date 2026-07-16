import {Group} from "@mantine/core";
import type {ReactNode} from "react";

// Today's `.quick-actions` flex-row convention (a form control + its submit button, or a refresh
// button above a list) -- one reusable layout wrapper instead of ad hoc flex styling per screen.
export function QuickActions({children}: {children: ReactNode}) {
    return (
        <Group gap="sm" mb="sm" align="flex-end" wrap="wrap">
            {children}
        </Group>
    );
}
