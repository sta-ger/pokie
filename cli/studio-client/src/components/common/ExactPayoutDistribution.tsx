import {Button, Table, Text} from "@mantine/core";
import {useState} from "react";
import {formatAnalysisNumber} from "../../../../../src/internal/formatAnalysisNumber";
import {AdvancedDisclosure} from "./AdvancedDisclosure";

type PayoutBucket = {
    readonly payoutMultiplier: number;
    readonly probability: number | string;
};

const INITIAL_ROWS = 12;

/**
 * Exact payout probability mass function. Distinct multipliers are never binned, so the table is the
 * complete distribution rather than a sampled histogram (see WeightedOutcomeLibraryAnalysis's own
 * payoutDistribution contract). Shared by Overview's exact-math card and an opened Outcome Library's
 * canonical analysis.
 */
export function ExactPayoutDistribution({buckets, label = "payout distribution"}: {buckets?: readonly PayoutBucket[]; label?: string}) {
    const [expanded, setExpanded] = useState(false);
    if (buckets === undefined || buckets.length === 0) return null;
    const visible = expanded ? buckets : buckets.slice(0, INITIAL_ROWS);
    const totalProbability = buckets.reduce((sum, bucket) => sum + Number(bucket.probability), 0);
    return (
        <AdvancedDisclosure label={label}>
            <Text size="sm" c="dimmed" mb="xs">
                Exact probability mass function: one row per distinct payout multiplier, never a sampled histogram.
                Probabilities sum to {formatAnalysisNumber(totalProbability * 100, 4)}%.
            </Text>
            <Table withRowBorders={false} aria-label="Exact payout distribution">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Payout (× bet)</Table.Th>
                        <Table.Th>Probability</Table.Th>
                        <Table.Th>1 in</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {visible.map((bucket) => {
                        const probability = Number(bucket.probability);
                        return (
                            <Table.Tr key={bucket.payoutMultiplier}>
                                <Table.Td>{formatAnalysisNumber(bucket.payoutMultiplier, 4)}</Table.Td>
                                <Table.Td>{formatAnalysisNumber(probability * 100, 4)}%</Table.Td>
                                <Table.Td>{Number.isFinite(probability) && probability > 0 ? Math.round(1 / probability).toLocaleString("en-US") : "—"}</Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
            {buckets.length > INITIAL_ROWS && (
                <Button variant="subtle" size="xs" mt="xs" onClick={() => setExpanded((value) => !value)}>
                    {expanded ? "Show fewer" : `Show all ${buckets.length} payouts`}
                </Button>
            )}
        </AdvancedDisclosure>
    );
}
