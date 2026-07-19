import {Alert, Text} from "@mantine/core";
import type {ReactNode} from "react";
import {IssueList, type IssueListEntry} from "./IssueList";

// The "colored Alert classifying a run outcome, with its errors/warnings broken out underneath" pattern
// -- independently reimplemented per tab (Deployment, PAR Sheet import/export, Outcome Libraries), each
// with its own outcome-kind-to-{color,icon,title} map. This is just the shared rendering half; each
// call site keeps its own map, since the outcome kinds themselves are domain-specific per tab.
export function OutcomeBanner({
    color,
    icon,
    title,
    errors,
    warnings,
}: {
    color: string;
    icon: ReactNode;
    title: string;
    errors: IssueListEntry[];
    warnings: IssueListEntry[];
}) {
    return (
        <Alert color={color} variant="light" icon={icon} title={title} mb="sm">
            <IssueList title="Errors" issues={errors} />
            <IssueList title="Warnings" issues={warnings} />
            {errors.length === 0 && warnings.length === 0 && (
                <Text size="sm" c="dimmed">
                    No issues reported.
                </Text>
            )}
        </Alert>
    );
}
