import {Progress, Text} from "@mantine/core";
import {payoutHistogramRows} from "../../../../../src/reporting/payoutHistogramPresentation";

// The one human-facing chart the simulation report was missing: payout buckets, not a raw JSON
// histogram buried in advanced details. It is a presentation-only view over the report's own counts
// (no simulation math is recomputed here).
export function PayoutHistogramChart({histogram}: {histogram?: Record<string, number>}) {
    const rows = payoutHistogramRows(histogram);
    if (rows.length === 0) return null;
    return (
        <section aria-label="Payout distribution chart" className="studio-payout-histogram">
            <Text component="h3" size="sm" fw={600} mb={4}>Payout distribution</Text>
            <Text size="xs" c="dimmed" mb="sm">Share of the sampled rounds in each payout bucket (× bet).</Text>
            <div style={{display: "grid", gridTemplateColumns: "7rem 1fr 4.5rem", gap: "0.4rem 0.6rem", alignItems: "center"}}>
                {rows.map((row) => (
                    <div key={row.bucket} style={{display: "contents"}}>
                        <Text size="xs">{row.label}</Text>
                        <Progress value={row.share * 100} size="md" radius="xs" aria-label={`${row.label}: ${(row.share * 100).toFixed(2)}%`} />
                        <Text size="xs" ta="right">{(row.share * 100).toFixed(2)}%</Text>
                    </div>
                ))}
            </div>
        </section>
    );
}
