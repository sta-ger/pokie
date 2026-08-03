import {Badge, Button, Group, Table, Text} from "@mantine/core";
import type {StudioProjectOrigin} from "../../api/types";
import {
    BLUEPRINT_BUILD_CAPABILITY,
    describeCapability,
    PROJECT_TYPE_LABEL,
    type InspectionResultView,
    type NextActionView,
    type ProjectHeaderView,
    type ProjectValidationView,
    type ProvenanceView,
} from "../../domain/interpret/ProjectDashboard";
import {describeProjectActionError} from "../../domain/projectActionError";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
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

const NEXT_ACTION_TONE: Record<NextActionView["kind"], "info" | "success" | "warning"> = {
    validate: "info",
    validating: "info",
    "validation-failed": "warning",
    "fix-validation": "warning",
    simulate: "info",
    "simulation-running": "info",
    "view-report": "success",
};

// The generated-file/build-info detail (blueprint hash, source path, pokie version, every generated
// file) -- never promoted above the fold (see this module's own doc comment on OverviewTab): a
// AdvancedDisclosure a user can open, not a table shown by default alongside the project's own
// identity.
function ProvenanceDetail({provenance}: {provenance: ProvenanceView}) {
    if (provenance.status === "not-generated") {
        return <Text size="sm">This package was not built via &quot;pokie build&quot; (no build-info found).</Text>;
    }
    if (provenance.status === "error") {
        return <ErrorState message={provenance.message} />;
    }
    return (
        <Table withRowBorders={false}>
            <Table.Tbody>
                <Table.Tr>
                    <Table.Th>Blueprint hash</Table.Th>
                    <Table.Td style={{overflowWrap: "anywhere"}}>{provenance.blueprintHash}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                    <Table.Th>Source</Table.Th>
                    <Table.Td style={{overflowWrap: "anywhere"}}>{provenance.source}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                    <Table.Th>pokie version</Table.Th>
                    <Table.Td>{provenance.pokieVersion}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                    <Table.Th>Generated at</Table.Th>
                    <Table.Td>{provenance.generatedAt}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                    <Table.Th>Generated files</Table.Th>
                    <Table.Td style={{overflowWrap: "anywhere"}}>{provenance.files.join(", ")}</Table.Td>
                </Table.Tr>
            </Table.Tbody>
        </Table>
    );
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

// The Project Dashboard's landing section -- a calm summary of what this project *is* (type, origin,
// location, editable-or-read-only, its capabilities) and what state it's currently in (automatic
// validation diagnostics, the next recommended action), rather than a promotion of build/generated-file
// mechanics. Package/build-info detail from Inspect is still reachable, just tucked behind an
// AdvancedDisclosure -- present for anyone who wants it, never the first thing this tab shows.
export function OverviewTab({
    header,
    inspection,
    validation,
    onRevalidate,
    nextAction,
    onNextAction,
    onConfigureGameModel,
    onReinspect,
}: {
    header: Extract<ProjectHeaderView, {status: "loaded"}>;
    inspection: InspectionResultView;
    validation: ProjectValidationView;
    onRevalidate: () => void;
    nextAction: NextActionView;
    onNextAction: () => void;
    onConfigureGameModel?: () => void;
    onReinspect: () => void;
}) {
    const editable = header.capabilities.includes(BLUEPRINT_BUILD_CAPABILITY);

    return (
        <div>
            <NextStepCallout
                title={nextAction.title}
                description={nextAction.description}
                actionLabel={nextAction.actionLabel}
                onAction={onNextAction}
                tone={NEXT_ACTION_TONE[nextAction.kind]}
            />
            {onConfigureGameModel && (
                <QuickActions>
                    <Button variant="default" onClick={onConfigureGameModel}>
                        Configure Game Model
                    </Button>
                </QuickActions>
            )}

            <Table withRowBorders={false} mb="md" mt="md">
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
                        <Table.Th>Type</Table.Th>
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
                        <Table.Td>
                            {editable
                                ? "Editable — this project's Blueprint source can be changed from Game Model."
                                : "Read-only — this project's source isn't directly editable in Studio."}
                        </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Capabilities</Table.Th>
                        <Table.Td>
                            {header.capabilities.length === 0 ? (
                                "—"
                            ) : (
                                <Group gap={4}>
                                    {header.capabilities.map((capability) => (
                                        <Badge key={capability} variant="light" size="sm">
                                            {describeCapability(capability)}
                                        </Badge>
                                    ))}
                                </Group>
                            )}
                        </Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            <PageSection legend="Validation">
                <ValidationDiagnostics view={validation} onRevalidate={onRevalidate} />
            </PageSection>

            <PageSection legend="Metadata">
                {inspection.status === "loading" && <LoadingState label="Inspecting…" />}
                {inspection.status === "error" && (
                    <ErrorState message={describeProjectActionError("The project inspection", inspection.message)} />
                )}
                {inspection.status === "loaded" && (
                    <div>
                        <Table withRowBorders={false} mb="sm">
                            <Table.Tbody>
                                <Table.Tr>
                                    <Table.Th>Package name</Table.Th>
                                    <Table.Td>{inspection.packageName ?? "—"}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Package version</Table.Th>
                                    <Table.Td>{inspection.packageVersion ?? "—"}</Table.Td>
                                </Table.Tr>
                            </Table.Tbody>
                        </Table>
                        <AdvancedDisclosure detail="build provenance">
                            <ProvenanceDetail provenance={inspection.provenance} />
                        </AdvancedDisclosure>
                    </div>
                )}
                <QuickActions>
                    <Button variant="default" size="xs" onClick={onReinspect} loading={inspection.status === "loading"}>
                        Re-run Inspect
                    </Button>
                </QuickActions>
            </PageSection>
        </div>
    );
}
