import {Badge, ThemeIcon} from "@mantine/core";
import {IconCheck} from "@tabler/icons-react";
import type {SectionStatus} from "../../domain/interpret/BlueprintSections";

// Decorative relative to whatever label it sits next to (e.g. a Tabs.Tab's own text) -- `aria-hidden`
// so it never pollutes that label's accessible name; conveying counts audibly is out of scope here.
export function StatusBadge({status}: {status: SectionStatus}) {
    if (status.tone === "neutral") {
        return null;
    }
    if (status.tone === "success") {
        return (
            <ThemeIcon size="sm" radius="xl" color="green" variant="light" aria-hidden="true">
                <IconCheck size={12} />
            </ThemeIcon>
        );
    }
    const count = status.tone === "error" ? status.errorCount : status.warningCount;
    return (
        <Badge size="sm" circle color={status.tone === "error" ? "red" : "yellow"} aria-hidden="true">
            {count}
        </Badge>
    );
}
