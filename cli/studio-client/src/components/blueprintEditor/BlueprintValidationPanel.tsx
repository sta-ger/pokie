import {Button, Text} from "@mantine/core";
import type {BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

function statusText(view: BlueprintValidationView): string | undefined {
    if (view.status === "error") {
        return view.message;
    }
    if (view.status === "invalid") {
        return `Invalid — ${view.errors.length} error(s).`;
    }
    if (view.status === "ok") {
        return view.warnings.length === 0 ? "Valid — no issues found." : `Valid, with warnings — ${view.warnings.length} warning(s).`;
    }
    return undefined;
}

export function BlueprintValidationPanel({view, onValidate}: {view: BlueprintValidationView; onValidate: () => void}) {
    return (
        <PageSection legend="Validation">
            <QuickActions>
                <Button onClick={onValidate} loading={view.status === "loading"}>
                    Validate
                </Button>
            </QuickActions>
            {view.status === "loading" && <LoadingState label="Validating…" />}
            {statusText(view) && <Text mb="sm">{statusText(view)}</Text>}
            {view.status === "invalid" && <IssueList title="Errors" issues={view.errors} />}
            {view.status === "ok" && <IssueList title="Warnings" issues={view.warnings} />}
        </PageSection>
    );
}
