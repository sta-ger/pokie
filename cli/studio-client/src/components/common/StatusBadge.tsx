import {Badge, ThemeIcon, VisuallyHidden} from "@mantine/core";
import {IconCheck} from "@tabler/icons-react";
import {describeSectionStatusText, type SectionStatus} from "../../domain/interpret/BlueprintSections";

// The icon/count is decorative (`aria-hidden`) -- the *same* information (state and error/warning count)
// must also reach assistive tech through a real, non-hidden text node, which is what the
// `<VisuallyHidden>` sibling below is for: it becomes part of the containing control's (e.g. a
// Tabs.Tab's) accessible name, so "Game basics" reads as "Game basics, 2 errors" once dirty+invalid,
// without visually duplicating the count next to the badge. Neutral status renders neither -- no visual
// badge and no accessible text -- so a not-yet-validated tab's accessible name is untouched.
export function StatusBadge({status}: {status: SectionStatus}) {
    const accessibleText = describeSectionStatusText(status);
    return (
        <>
            {status.tone === "success" && (
                <ThemeIcon size="sm" radius="xl" color="green" variant="light" aria-hidden="true">
                    <IconCheck size={12} />
                </ThemeIcon>
            )}
            {(status.tone === "error" || status.tone === "warning") && (
                <Badge size="sm" circle color={status.tone === "error" ? "red" : "yellow"} aria-hidden="true">
                    {status.tone === "error" ? status.errorCount : status.warningCount}
                </Badge>
            )}
            {accessibleText.length > 0 && <VisuallyHidden>{accessibleText}</VisuallyHidden>}
        </>
    );
}
