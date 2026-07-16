import {Button, Text} from "@mantine/core";
import type {ProjectValidationView} from "../../domain/interpret/ProjectDashboard";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {QuickActions} from "../common/QuickActions";

export function ValidationTab({view, onValidate}: {view: ProjectValidationView; onValidate: () => void}) {
    return (
        <div>
            <QuickActions>
                <Button variant="default" onClick={onValidate} loading={view.status === "loading"}>
                    Run Validate
                </Button>
            </QuickActions>
            {view.status === "loading" && <LoadingState label="Validating…" />}
            {view.status === "error" && <ErrorState message={view.message} />}
            {view.status === "success" && (
                <div>
                    <Text mb="sm">
                        {view.summary.hasIssues
                            ? `${view.summary.valid ? "Valid, with warnings" : "Invalid"} — ${view.summary.errors.length} error(s), ${view.summary.warnings.length} warning(s).`
                            : "Valid — no issues found."}
                    </Text>
                    <IssueList title="Errors" issues={view.summary.errors} />
                    <IssueList title="Warnings" issues={view.summary.warnings} />
                    {view.summary.suggestions.length > 0 && (
                        <div>
                            <Text fw={600} size="sm" mb={4}>
                                Suggestions
                            </Text>
                            <ul>
                                {view.summary.suggestions.map((suggestion, index) => (
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
