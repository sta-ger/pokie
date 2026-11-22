import {Button, Table, Text} from "@mantine/core";
import {useState} from "react";
import {formatAnalysisNumber} from "../../../../../src/internal/formatAnalysisNumber";
import {AdvancedDisclosure} from "./AdvancedDisclosure";

type PayoutBucket = {
    readonly payoutMultiplier: number;
    readonly probability: number | string;
};

const INITIAL_ROWS = 12;
const EXPAND_BY_DEFAULT_LIMIT = 50;

/** "1 in N" reads badly when N rounds to 1 for a common outcome; keep precision near the mode. */
function formatOneIn(probability: number): string {
    if (!Number.isFinite(probability) || probability <= 0) return "—";
    const inverse = 1 / probability;
    return inverse < 10 ? inverse.toFixed(2) : Math.round(inverse).toLocaleString("en-US");
}

/**
 * Exact payout probability mass function. Distinct multipliers are never binned, so the table is the
 * complete distribution rather than a sampled histogram (see WeightedOutcomeLibraryAnalysis's own
 * payoutDistribution contract). Shared by Overview's exact-math card and an opened Outcome Library's
 * canonical analysis.
 */
export function ExactPayoutDistribution({buckets, label = "payout distribution"}: {buckets?: readonly PayoutBucket[]; label?: string}) {
    const [expanded, setExpanded] = useState(buckets !== undefined && buckets.length <= EXPAND_BY_DEFAULT_LIMIT);
    if (buckets === undefined || buckets.length === 0) return null;
    const visible = expanded ? buckets : buckets.slice(0, INITIAL_ROWS);
    const totalProbability = buckets.reduce((sum, bucket) => sum + Number(bucket.probability), 0);
    const visibleProbability = visible.reduce((sum, bucket) => sum + Number(bucket.probability), 0);
    return (
        <AdvancedDisclosure label={label}>
            <Text size="sm" c="dimmed" mb="xs">
                Exact probability mass function: one row per distinct payout multiplier, never a sampled histogram.
                Probabilities across all {buckets.length} payouts sum to {formatAnalysisNumber(totalProbability * 100, 4)}%.
                {visible.length < buckets.length && ` Showing ${visible.length} of ${buckets.length} rows (visible subtotal ${formatAnalysisNumber(visibleProbability * 100, 4)}%); expand to see every payout.`}
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
                                <Table.Td>{formatOneIn(probability)}</Table.Td>
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
