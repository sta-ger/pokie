import {Button, Table, Text} from "@mantine/core";
import type {StudioProjectOrigin} from "../../api/types";
import {
    BLUEPRINT_BUILD_CAPABILITY,
    describeProjectType,
    RUNTIME_EXECUTE_CAPABILITY,
    type ProjectHeaderView,
    type ProjectValidationView,
} from "../../domain/interpret/ProjectDashboard";
import {describeProjectActionError} from "../../domain/projectActionError";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {NextStepCallout} from "../common/NextStepCallout";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

function describeAddedToStudio(origin: StudioProjectOrigin | undefined): string {
    if (origin === "managed") {
        return "Created in Studio";
    }
    return "Added from your computer";
}

// Validation's own diagnostics, folded into Overview instead of a separate "Validate" section --
// ProjectDashboardPage runs this automatically once a project finishes loading (and again on demand
// via `onRevalidate`), so a visitor sees the project's current health without an extra click. Mirrors
// the removed ValidationTab's own rendering, minus its own standalone "Run Validate" entry point (this
// one lives inline, next to everything else Overview already reports).
function ValidationDiagnostics({view, onRevalidate}: {view: ProjectValidationView; onRevalidate: () => void}) {
    const terminal = view.status === "success" ? "completed" : view.status;
    return (
        <div
            role="status"
            aria-live="polite"
            tabIndex={-1}
            data-pokie-lifecycle-result="project-validation"
            data-pokie-lifecycle-result-control="project-validation-run"
            data-pokie-lifecycle-terminal={terminal}
        >
            {(view.status === "idle" || view.status === "loading") && <LoadingState label="Checking project…" />}
            {view.status === "error" && <ErrorState message={describeProjectActionError("This validation check", view.message)} />}
            {view.status === "success" && (
                <div>
                    <Text mb="sm">
                        {view.summary.hasIssues
                            ? `${view.summary.valid ? "Valid, with warnings" : "Invalid"} — ${view.summary.errors.length} error(s), ${view.summary.warnings.length} warning(s).`
                            : "Valid — no issues found."}
                    </Text>
                    <IssueList title="Errors" issues={view.summary.errors} />
                    <IssueList title="Warnings" issues={view.summary.warnings} />
                    <IssueList title="Integrity information" issues={view.summary.information} />
                </div>
            )}
            <QuickActions>
                <Button
                    id="project-validation-run"
                    variant="default"
                    size="xs"
                    data-pokie-lifecycle="operation"
                    data-pokie-transaction-state="read-only-operation"
                    data-pokie-lifecycle-operation="project-validation"
                    onClick={onRevalidate}
                    loading={view.status === "loading"}
                >
                    Re-check project
                </Button>
            </QuickActions>
        </div>
    );
}

// The Project Dashboard's landing section starts with a concrete, non-wizard workflow for a playable
// project, then reports what that project *is* (id/name/version, format, where it was added from, location,
// and whether it can be edited) alongside its current validation state. A resolved Project can be
// a "blueprint" (a single JSON file, no package.json of its own) just as easily as a "tsPackage", so
// the facts table only shows fields every resolved ProjectType actually has.
export function OverviewTab({
    header,
    validation,
    onRevalidate,
    onOpenPlay,
}: {
    header: Extract<ProjectHeaderView, {status: "loaded"}>;
    validation: ProjectValidationView;
    onRevalidate: () => void;
    onOpenPlay: () => void;
}) {
    const editable = header.capabilities.includes(BLUEPRINT_BUILD_CAPABILITY);
    const playable = editable || header.capabilities.includes(RUNTIME_EXECUTE_CAPABILITY);

    return (
        <div>
            {playable && (
                <NextStepCallout
                    title="Start by playing a round"
                    description={`Open Play to spin a real round. ${editable ? "Use Game Model to edit the saved layout, symbols, reels, paytable, and bets." : "Game Model is read-only for this package; open the original Blueprint to change its design and build a new package."} Use Simulation to estimate RTP and Replay to inspect a selected round. In Build/Export, Stake Engine export automatically plans outcome-library reuse or generation; separate generation is optional.`}
                    actionLabel="Open Play"
                    onAction={onOpenPlay}
                />
            )}
            <Table className="studio-metadata" aria-label="Project facts" withRowBorders={false} mb="md">
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>ID</Table.Th>
                        <Table.Td>{header.id}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Version</Table.Th>
                        <Table.Td>{header.version}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Game format</Table.Th>
                        <Table.Td>{header.type ? describeProjectType(header.type as Exclude<typeof header.type, "wasm">) : "Unknown"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Added to Studio</Table.Th>
                        <Table.Td>{describeAddedToStudio(header.origin)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Location</Table.Th>
                        <Table.Td className="studio-technical-text" style={{overflowWrap: "anywhere"}}>{header.projectRoot}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Editable</Table.Th>
                        <Table.Td>{editable ? "Editable — you can change this game in Studio." : "Read-only — this game can't be changed directly in Studio."}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            <PageSection legend="Validation">
                <Text size="sm" c="dimmed" mb="sm">Structural validation checks the project contract. It does not establish mathematical balance or certification.</Text>
                <ValidationDiagnostics view={validation} onRevalidate={onRevalidate} />
            </PageSection>
        </div>
    );
}
