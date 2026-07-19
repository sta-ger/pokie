import {Alert, Text} from "@mantine/core";
import type {ReactNode} from "react";
import {IssueList, type IssueListEntry} from "./IssueList";

// The "colored Alert classifying a run outcome, with its errors/warnings broken out underneath" pattern
// -- independently reimplemented per tab (Deployment, PAR Sheet import/export, Outcome Libraries), each
// with its own outcome-kind-to-{color,icon,title} map. This is just the shared rendering half; each
// call site keeps its own map, since the outcome kinds themselves are domain-specific per tab.
//
// The live-region role is derived from `errors`/`warnings` themselves rather than a separate prop --
// an outcome that actually failed gets `role="alert"` (implicit assertive, worth interrupting for),
// everything else (success, warnings-only) gets `role="status"` (implicit polite) -- same "don't mix
// role=alert with an explicit conflicting aria-live" discipline as ErrorState/WarningState.
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
    const role = errors.length > 0 ? "alert" : "status";
    return (
        <Alert color={color} variant="light" icon={icon} title={title} role={role} mb="sm" style={{overflowWrap: "anywhere"}}>
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
