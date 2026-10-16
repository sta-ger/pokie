import {AdvancedValidationPanel} from "../common/AdvancedValidationPanel";
import {Button, Text} from "@mantine/core";
import type {BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import {describePathActionError} from "../../domain/pathActionError";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

function statusText(view: BlueprintValidationView): string | undefined {
    if (view.status === "invalid") {
        return `Invalid — ${view.errors.length} error(s).`;
    }
    if (view.status === "ok") {
        return view.warnings.length === 0 ? "Valid — no issues found." : `Valid, with warnings — ${view.warnings.length} warning(s).`;
    }
    return undefined;
}

export function BlueprintValidationPanel({
    view,
    onValidate,
    automatic = false,
    onCancel,
}: {
    view: BlueprintValidationView;
    onValidate: () => void;
    automatic?: boolean;
    onCancel?: () => void;
}) {
    return (
        <PageSection legend="Validation">
            {automatic ? (
                <Text c="dimmed" size="sm" mb="sm">
                    Checked automatically when the game model changes.
                </Text>
            ) : (
                <QuickActions>
                    <Button onClick={onValidate} loading={view.status === "loading"}>
                        Validate
                    </Button>
                </QuickActions>
            )}
            {view.status === "loading" && <>
                <LoadingState label="Validating…" />
                {onCancel && <Button variant="default" onClick={onCancel}>Cancel validation</Button>}
            </>}
            {automatic && view.status === "error" && <Button onClick={onValidate}>Retry validation</Button>}
            {view.status === "stale" && (
                <Text c="dimmed" mb="sm">
                    Source changed — checking again…
                </Text>
            )}
            {view.status === "error" && <ErrorState message={describePathActionError("This validation request", view.message)} />}
            {statusText(view) && <Text mb="sm">{statusText(view)}</Text>}
            {(view.status === "ok" || view.status === "invalid") && <Text size="sm" c="dimmed">Structural validation. Advanced analysis is reported separately below.</Text>}
            {view.status === "invalid" && <IssueList title="Errors" issues={view.errors} />}
            {(view.status === "ok" || view.status === "invalid") && <>
                <IssueList title="Warnings" issues={view.warnings} />
                <AdvancedValidationPanel report={view.advanced} />
            </>}
        </PageSection>
    );
}
