import {Button, Text} from "@mantine/core";
import type {ValidationSummaryView} from "../../domain/interpret/ProjectDashboard";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {QuickActions} from "../common/QuickActions";

export function ValidationTab({
    summary,
    loading,
    onValidate,
}: {
    summary: ValidationSummaryView | undefined;
    loading: boolean;
    onValidate: () => void;
}) {
    return (
        <div>
            <QuickActions>
                <Button variant="default" onClick={onValidate} loading={loading}>
                    Run Validate
                </Button>
            </QuickActions>
            {loading && <LoadingState label="Validating…" />}
            {summary && (
                <div>
                    <Text mb="sm">
                        {summary.hasIssues
                            ? `${summary.valid ? "Valid, with warnings" : "Invalid"} — ${summary.errors.length} error(s), ${summary.warnings.length} warning(s).`
                            : "Valid — no issues found."}
                    </Text>
                    <IssueList title="Errors" issues={summary.errors} />
                    <IssueList title="Warnings" issues={summary.warnings} />
                    {summary.suggestions.length > 0 && (
                        <div>
                            <Text fw={600} size="sm" mb={4}>
                                Suggestions
                            </Text>
                            <ul>
                                {summary.suggestions.map((suggestion, index) => (
                                    <li key={index}>
                                        <Text size="sm">{suggestion}</Text>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
