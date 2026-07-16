import {Button, Table, Text} from "@mantine/core";
import type {InspectionResultView, ProvenanceView} from "../../domain/interpret/ProjectDashboard";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

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
                        <Table.Td>{provenance.blueprintHash}</Table.Td>
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
                        <Table.Td>{provenance.files.join(", ")}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>
        </div>
    );
}

export function OverviewTab({
    header,
    inspection,
    onReinspect,
    onValidate,
}: {
    header: {id: string; version: string; projectRoot: string};
    inspection: InspectionResultView;
    onReinspect: () => void;
    onValidate: () => void;
}) {
    return (
        <div>
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
                        <Table.Th>Package root</Table.Th>
                        <Table.Td>{header.projectRoot}</Table.Td>
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
                                    <Table.Td>{inspection.packageRoot}</Table.Td>
                                </Table.Tr>
                            </Table.Tbody>
                        </Table>
                        <ProvenancePanel provenance={inspection.provenance} />
                    </div>
                )}
                <QuickActions>
                    <Button variant="default" onClick={onReinspect}>
                        Re-run Inspect
                    </Button>
                </QuickActions>
            </PageSection>

            <QuickActions>
                <Button variant="default" onClick={onValidate}>
                    Validate
                </Button>
            </QuickActions>
        </div>
    );
}
