import {Anchor, Text} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {useId, type ReactNode} from "react";
import {PageSection} from "./PageSection";

// A normal PageSection whose long body is collapsed by default. The legend and a one-line summary
// stay visible, so the page is shorter without hiding whether the section passed or failed. Mirrors
// AdvancedDisclosure's WAI-ARIA disclosure contract: a real button, aria-expanded, and an
// aria-controls region that is always mounted and toggled via `hidden`.
export function CollapsiblePageSection({
    legend,
    summary,
    defaultOpened = false,
    detailsLabel = "details",
    children,
}: {
    legend: string;
    summary: string;
    defaultOpened?: boolean;
    /** Visible link noun, e.g. "field list"; the accessible name keeps the stable "Show <legend> details" form. */
    detailsLabel?: string;
    children: ReactNode;
}) {
    const [opened, {toggle}] = useDisclosure(defaultOpened);
    const contentId = useId();
    return (
        <PageSection legend={legend}>
            <Text size="sm" c="dimmed">
                {summary}
            </Text>
            <Text size="sm" mt="xs">
                <Anchor
                    component="button"
                    type="button"
                    aria-expanded={opened}
                    aria-controls={contentId}
                    aria-label={`${opened ? "Hide" : "Show"} ${legend} details`}
                    onClick={toggle}
                >
                    {opened ? "Hide" : "Show"} {detailsLabel}
                </Anchor>
            </Text>
            <div id={contentId} hidden={!opened}>
                {children}
            </div>
        </PageSection>
    );
}
