import {Button, Table, Text} from "@mantine/core";
import type {InspectionResultView, NextActionView, ProvenanceView} from "../../domain/interpret/ProjectDashboard";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {NextStepCallout} from "../common/NextStepCallout";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

const NEXT_ACTION_TONE: Record<NextActionView["kind"], "info" | "success" | "warning"> = {
    validate: "info",
    validating: "info",
    "validation-failed": "warning",
    "fix-validation": "warning",
    simulate: "info",
    "simulation-running": "info",
    "view-report": "success",
};

function ProvenancePanel({provenance}: {provenance: ProvenanceView}) {
    if (provenance.status === "not-generated") {
        return <Text size="sm">This package was not built via &quot;pokie build&quot; (no build-info found).</Text>;
    }
    if (provenance.status === "error") {
        return <ErrorState message={provenance.message} />;
    }
    return (
        <div>
            <Text size="sm" mb="xs">
                Built via &quot;pokie build&quot;.
            </Text>
            <Table withRowBorders={false}>
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>Blueprint hash</Table.Th>
                        <Table.Td style={{overflowWrap: "anywhere"}}>{provenance.blueprintHash}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Source</Table.Th>
                        <Table.Td>{provenance.source}</Table.Td>
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
        </div>
    );
}

export function OverviewTab({
    header,
    inspection,
    nextAction,
    onNextAction,
    onConfigureGameModel,
    onReinspect,
}: {
    header: {id: string; version: string; projectRoot: string};
    inspection: InspectionResultView;
    nextAction: NextActionView;
    onNextAction: () => void;
    onConfigureGameModel?: () => void;
    onReinspect: () => void;
}) {
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
                        <Table.Th>Package root</Table.Th>
                        <Table.Td style={{overflowWrap: "anywhere"}}>{header.projectRoot}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            <PageSection legend="Inspect">
                {inspection.status === "loading" && <LoadingState label="Inspecting…" />}
                {inspection.status === "error" && <ErrorState message={inspection.message} />}
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
                                <Table.Tr>
                                    <Table.Th>Package root</Table.Th>
                                    <Table.Td style={{overflowWrap: "anywhere"}}>{inspection.packageRoot}</Table.Td>
                                </Table.Tr>
                            </Table.Tbody>
                        </Table>
                        <ProvenancePanel provenance={inspection.provenance} />
                    </div>
                )}
                <QuickActions>
                    <Button variant="default" onClick={onReinspect} loading={inspection.status === "loading"}>
                        Re-run Inspect
                    </Button>
                </QuickActions>
            </PageSection>
        </div>
    );
}
