import {Fieldset, Group} from "@mantine/core";
import type {ReactNode} from "react";

// `action`, when given, renders alongside `legend` (e.g. a section's own Edit/Save/Cancel controls --
// see GameModelSections.tsx) instead of requiring every caller that needs one to hand-roll its own
// legend layout.
export function PageSection({
    id,
    legend,
    action,
    hidden,
    children,
}: {
    id?: string;
    legend: string;
    action?: ReactNode;
    hidden?: boolean;
    children: ReactNode;
}) {
    return (
        <Fieldset
            id={id}
            legend={
                action ? (
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                        <span>{legend}</span>
                        {action}
                    </Group>
                ) : (
                    legend
                )
            }
            hidden={hidden}
            mb="md"
        >
            {children}
        </Fieldset>
    );
}
