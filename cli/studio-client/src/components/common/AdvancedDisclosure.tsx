import {Anchor, Text} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {useId, type ReactNode} from "react";
import {PageSection} from "./PageSection";

// The "show/hide the technical stuff" toggle -- an Anchor that flips a PageSection open/closed --
// duplicated ad hoc across every tab (each with its own noun: "advanced settings"/"advanced
// options"/"advanced spin options"/"raw blueprint JSON"). One shared component, one noun ("advanced
// details"), with `detail` carrying whatever specific parenthetical a given screen wants to keep
// (e.g. "seed, workers").
//
// Follows the WAI-ARIA "Disclosure (Show/Hide)" pattern: the toggle is a real <button> (via
// `component="button"`) carrying `aria-expanded` (so assistive tech announces open/closed state, not
// just the Show/Hide label swap) and `aria-controls` pointing at the revealed region's own id, so a
// screen reader user can tell which content the toggle governs before choosing to navigate into it.
export function AdvancedDisclosure({detail, defaultOpened = false, children}: {detail?: string; defaultOpened?: boolean; children: ReactNode}) {
    const [opened, {toggle}] = useDisclosure(defaultOpened);
    const contentId = useId();
    return (
        <div>
            <Text size="sm" mt="sm">
                <Anchor component="button" type="button" aria-expanded={opened} aria-controls={contentId} onClick={toggle}>
                    {opened ? "Hide" : "Show"} advanced details{detail ? ` (${detail})` : ""}
                </Anchor>
            </Text>
            {opened && (
                <PageSection id={contentId} legend="Advanced details">
                    {children}
                </PageSection>
            )}
        </div>
    );
}
