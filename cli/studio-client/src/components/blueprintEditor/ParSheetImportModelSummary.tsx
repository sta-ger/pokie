import {Badge, Table, Text} from "@mantine/core";
import {describeParSheetImportModelSummary} from "../../domain/parSheetImportModelSummary";
import {PageSection} from "../common/PageSection";

type SummaryRow = ReturnType<typeof describeParSheetImportModelSummary>[number];

function SummaryTable({rows, ariaLabel}: {rows: readonly SummaryRow[]; ariaLabel: string}) {
    return (
        <Table.ScrollContainer minWidth={620}>
            <Table aria-label={ariaLabel}>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Model</Table.Th>
                        <Table.Th>Current draft</Table.Th>
                        <Table.Th>Imported PAR</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {rows.map((row) => (
                        <Table.Tr key={row.key}>
                            <Table.Th scope="row">{row.label}</Table.Th>
                            <Table.Td>{row.current}</Table.Td>
                            <Table.Td>
                                <Text span fw={row.changed ? 600 : undefined}>
                                    {row.imported}
                                </Text>
                                {row.changed && (
                                    <Badge size="xs" variant="light" ml={6}>
                                        different
                                    </Badge>
                                )}
                                {row.detail !== undefined && (
                                    <Text size="xs" c="dimmed" mt={4}>
                                        {row.detail}
                                    </Text>
                                )}
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}

export function ParSheetImportModelSummary({current, imported}: {current: unknown; imported: unknown}) {
    const rows = describeParSheetImportModelSummary(current, imported);
    const identityRows = rows.filter((row) => row.kind === "identity");
    const mathRows = rows.filter((row) => row.kind === "math");
    return (
        <PageSection legend="What will replace the current draft">
            <Text size="sm" c="dimmed" mb="xs">
                Values on the left are the draft currently in this editor; values on the right come from the imported
                workbook. Nothing is changed until Apply.
            </Text>
            {identityRows.length > 0 && (
                <>
                    <Text size="xs" c="dimmed" mt="sm" mb={4}>
                        Game identity — not a mathematical difference
                    </Text>
                    <SummaryTable rows={identityRows} ariaLabel="PAR import game identity summary" />
                </>
            )}
            <Text size="xs" c="dimmed" mt="md" mb={4}>
                Mathematical model
            </Text>
            <SummaryTable rows={mathRows} ariaLabel="PAR import mathematical model summary" />
        </PageSection>
    );
}
