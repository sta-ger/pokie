import {Anchor, Text} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import type {ReactNode} from "react";
import {PageSection} from "./PageSection";

// The "show/hide the technical stuff" toggle -- an Anchor that flips a PageSection open/closed --
// duplicated ad hoc across every tab (each with its own noun: "advanced settings"/"advanced
// options"/"advanced spin options"/"raw blueprint JSON"). One shared component, one noun ("advanced
// details"), with `detail` carrying whatever specific parenthetical a given screen wants to keep
// (e.g. "seed, workers").
export function AdvancedDisclosure({detail, defaultOpened = false, children}: {detail?: string; defaultOpened?: boolean; children: ReactNode}) {
    const [opened, {toggle}] = useDisclosure(defaultOpened);
    return (
        <div>
            <Text size="sm" mt="sm">
                <Anchor component="button" type="button" onClick={toggle}>
                    {opened ? "Hide" : "Show"} advanced details{detail ? ` (${detail})` : ""}
                </Anchor>
            </Text>
            {opened && <PageSection legend="Advanced details">{children}</PageSection>}
        </div>
    );
}
