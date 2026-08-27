import {Button, Table, Text} from "@mantine/core";
import type {StudioProjectOrigin} from "../../api/types";
import {
    BLUEPRINT_BUILD_CAPABILITY,
    PROJECT_TYPE_LABEL,
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

function describeOrigin(origin: StudioProjectOrigin | undefined): string {
    if (origin === "managed") {
        return "Managed";
    }
    if (origin === "external") {
        return "Registered";
    }
    return "Unknown";
}

// Validation's own diagnostics, folded into Overview instead of a separate "Validate" section --
// ProjectDashboardPage runs this automatically once a project finishes loading (and again on demand
// via `onRevalidate`), so a visitor sees the project's current health without an extra click. Mirrors
// the removed ValidationTab's own rendering, minus its own standalone "Run Validate" entry point (this
// one lives inline, next to everything else Overview already reports).
function ValidationDiagnostics({view, onRevalidate}: {view: ProjectValidationView; onRevalidate: () => void}) {
    return (
        <div>
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
                </div>
            )}
            <QuickActions>
                <Button variant="default" size="xs" onClick={onRevalidate} loading={view.status === "loading"}>
                    Re-check project
                </Button>
            </QuickActions>
        </div>
    );
}

// The Project Dashboard's landing section starts with a concrete, non-wizard workflow for a playable
// project, then reports what that project *is* (id/name/version, type, origin, location,
// editable-or-read-only, its capabilities) and its current validation state. A resolved Project can be
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
                    description="Open Play to spin a real round and find a win or free-games feature. Use Game Model to edit the saved layout, symbols, reels, paytable, and bets; then use Simulation to estimate RTP and Replay to inspect a selected round. In Build/Export, generate an outcome library before exporting it for Stake Engine."
                    actionLabel="Open Play"
                    onAction={onOpenPlay}
                />
            )}
            <Table withRowBorders={false} mb="md">
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
                        <Table.Td>{header.type ? PROJECT_TYPE_LABEL[header.type] : "Unknown"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Origin</Table.Th>
                        <Table.Td>{describeOrigin(header.origin)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Location</Table.Th>
                        <Table.Td style={{overflowWrap: "anywhere"}}>{header.projectRoot}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Editable</Table.Th>
                        <Table.Td>{editable ? "Editable — you can change this game in Studio." : "Read-only — this game can't be changed directly in Studio."}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            <PageSection legend="Validation">
                <ValidationDiagnostics view={validation} onRevalidate={onRevalidate} />
            </PageSection>
        </div>
    );
}
