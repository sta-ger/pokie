import {AdvancedValidationPanel} from "../common/AdvancedValidationPanel";
import {Button, Text} from "@mantine/core";
import type {BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import {describePathActionError} from "../../domain/pathActionError";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {CollapsiblePageSection} from "../common/CollapsiblePageSection";
import {LoadingState} from "../common/LoadingState";
import {QuickActions} from "../common/QuickActions";

function statusText(view: BlueprintValidationView): string | undefined {
    if (view.status === "inconclusive") return "Inconclusive — the design check did not complete. Review the analysis limits and retry.";
    if (view.status === "invalid") {
        return `Structure invalid — ${view.errors.length} error(s).`;
    }
    if (view.status === "ok") {
        return view.warnings.length === 0 ? "Structure valid — no format issues." : `Structure valid, with warnings — ${view.warnings.length} warning(s).`;
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
    const hasWarnings = view.status === "ok" || view.status === "invalid" || view.status === "inconclusive"
        ? view.warnings.length > 0
        : false;
    return (
        <CollapsiblePageSection
            key={view.status === "ok" && !hasWarnings ? "collapsed" : "expanded"}
            legend="Validation"
            summary={statusText(view) ?? (view.status === "loading" ? "Checking design…" : "Not checked yet.")}
            defaultOpened={view.status !== "ok" || hasWarnings}
        >
            {automatic ? (
                <Text c="dimmed" size="sm" mb="sm">
                    Checked automatically when the game model changes. Editing stays available while the check runs;
                    saving waits for it to finish.
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
            {automatic && (view.status === "error" || view.status === "inconclusive") && <Button onClick={onValidate}>Retry validation</Button>}
            {view.status === "stale" && (
                <Text c="dimmed" mb="sm">
                    Source changed — checking again…
                </Text>
            )}
            {view.status === "error" && <ErrorState message={describePathActionError("This validation request", view.message)} />}
            {(view.status === "invalid" || view.status === "inconclusive") && <IssueList title="Errors" issues={view.errors ?? []} />}
            {(view.status === "ok" || view.status === "invalid" || view.status === "inconclusive") && <IssueList title="Warnings" issues={view.warnings} />}
            {view.status === "ok" && <>
                <Text size="sm" c="dimmed">Design check. The optional feature check is reported separately below.</Text>
                <AdvancedValidationPanel report={view.advanced} />
            </>}
        </CollapsiblePageSection>
    );
}
