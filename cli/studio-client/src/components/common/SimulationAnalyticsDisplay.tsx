import {Table, Text} from "@mantine/core";
import type {ReactNode} from "react";
import {FEATURE_NAMES, type AnalyticsRatio, type FeatureAnalytics} from "../../../../../src/simulation/FeatureAnalytics";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {PageSection} from "./PageSection";

// Ratios are persisted observations, not estimates to recompute in the browser.
const ratio = (r: AnalyticsRatio): string => `${r.numerator} / ${r.denominator} = ${r.value}`;

function AnalyticsTable({label, headers, rows}: {label: string; headers: string[]; rows: ReactNode[][]}) {
    return <Table.ScrollContainer minWidth={480}>
        <Table aria-label={label} striped highlightOnHover>
            <Table.Thead><Table.Tr>{headers.map(header => <Table.Th key={header} scope="col">{header}</Table.Th>)}</Table.Tr></Table.Thead>
            <Table.Tbody>{rows.map((row, index) => <Table.Tr key={index}>{row.map((cell, column) => column === 0
                ? <Table.Th key={column} scope="row">{cell}</Table.Th>
                : <Table.Td key={column}>{cell}</Table.Td>)}</Table.Tr>)}</Table.Tbody>
        </Table>
    </Table.ScrollContainer>;
}

export function SimulationAnalyticsDisplay({analytics: a}: {analytics?: FeatureAnalytics}) {
    if (!a) return <PageSection legend="Feature analytics"><Text size="sm">Feature analytics unavailable (older report or no canonical observations).</Text></PageSection>;
    const supported = FEATURE_NAMES.filter(name => a.envelope.supportedFeatures.includes(name));
    return <PageSection legend="Feature analytics">
        <Text size="sm" mb="sm">Accepted-subround sampling. Ratios show numerator / denominator = value; zero denominator yields 0.</Text>
        <AnalyticsTable label="Analytics population" headers={["Population", "Count"]} rows={[
            ["Paid entries", a.paidEntries], ["Logical entries", a.logicalEntries], ["Completed logical rounds", a.logicalCompletions],
            ["Accepted subrounds", a.subrounds], ["Mathematical cascade steps", a.cascadeSteps], ["Carried-in subrounds", a.carriedSubrounds],
        ]} />
        <Text fw={600} mt="md">Feature lifecycle</Text>
        {!a.envelope.lifecycle ? <Text size="sm">Feature lifecycle unavailable: canonical entry/exit evidence absent; event presence is not duration.</Text>
            : <>
                <AnalyticsTable label="Feature lifecycle summary" headers={["Feature", "Entries / paid rounds", "Completions", "Incomplete", "Mean duration (plays)", "Mean bonus win (currency)"]}
                    rows={supported.map(name => [name, ratio(a.lifecycle[name].entryPerPaidRound), a.features[name].completions,
                        a.lifecycle[name].incomplete, ratio(a.lifecycle[name].averageDuration), ratio(a.lifecycle[name].averageWin)])} />
                {supported.filter(name => a.features[name].entries === 0).map(name => <Text size="sm" key={name}>{name}: configured and supported, no entries observed; zero is not evidence of absence or precise feature RTP.</Text>)}
                {supported.length === 0 && <Text size="sm">No configured features support lifecycle observations.</Text>}
                <Text size="sm">Lifecycle unavailable or feature not configured: {FEATURE_NAMES.filter(name => !supported.includes(name)).join(", ") || "none"}.</Text>
            </>}
        <Text size="sm" mt="md">Feature lifecycle wins can overlap; do not sum them as additive payouts. Base/feature/jackpot/unavailable partitions are additive; bet modes are a separate dimension.</Text>
        <AnalyticsTable label="Payout attribution" headers={["Partition", "RTP contribution / actual charged stake", "Payout share / total win"]}
            rows={Object.entries(a.contribution).map(([name, c]) => [name, ratio(c.rtp), ratio(c.payoutShare)])} />
        <AdvancedDisclosure label="win and feature details">
            <AnalyticsTable label="Observed wins" headers={["Metric", "Observed value"]} rows={[
                ["Dead spins (zero-win subrounds) / subrounds", ratio(a.deadSpinRate)],
                ["Exact maximum observed win (currency; not theoretical maximum)", a.maxWin],
                ["Maximum occurrences / subrounds", ratio(a.maxWinRate)], ["Maximum payout share", ratio(a.maxWinContribution)],
                ["Top 10 positive subround wins (descending; ties occupy slots)", a.topWins.join(", ") || "none"],
                ["Top wins payout share", ratio(a.topWinContribution)],
            ]} />
            {a.envelope.lifecycle && supported.map(name => {
                const f = a.features[name],
                    r = a.lifecycle[name];
                return <PageSection key={name} legend={name}>
                    <AnalyticsTable label={`${name} lifecycle details`} headers={["Metric", "Observation"]} rows={[
                        ["Entries / logical entries", ratio(r.entryPerLogicalRound)], ["Retriggers / feature entries", ratio(r.retriggerPerEntry)],
                        ["Grants", f.grants], ["Executed feature plays on entry", f.entrySubrounds], ["Executed plays in completed features", f.durationSum],
                        ["Carried-in incomplete", r.carriedIncomplete], ["Carried completions", r.carriedCompletions], ["Excluded restored completions", f.excludedCompletions],
                    ]} />
                    <Text size="sm">Duration counts executed feature subrounds; triggering entry counts only if it executes the feature. Distributions include completed features only.</Text>
                    <AnalyticsTable label={`${name} distributions`} headers={["Bucket", "Duration (plays)", "Win (currency)"]}
                        rows={["0", "(0,10)", "[10,100)", "[100,infinity)"].map((bin, i) => [bin, f.durationHistogram[i], f.winHistogram[i]])} />
                </PageSection>;
            })}
            <Text fw={600} mt="md">Bet modes — separate attribution dimension</Text>
            <AnalyticsTable label="Bet mode attribution" headers={["Mode", "RTP contribution / actual charged stake", "Payout share / total win"]}
                rows={Object.entries(a.betModeContribution).map(([name, c]) => [name, ratio(c.rtp), ratio(c.payoutShare)])} />
            {Object.keys(a.betModeContribution).length === 0 && <Text size="sm">No bet mode attribution observed.</Text>}
        </AdvancedDisclosure>
        <AdvancedDisclosure label="canonical hits and components">
            {!a.envelope.components ? <Text size="sm">Canonical symbol/line/scatter hits unavailable.</Text> : <>
                <Text size="sm">Hits are deduplicated within each accepted subround; landed display symbols are not canonical hits.</Text>
                <AnalyticsTable label="Canonical hit rates" headers={["Kind", "ID", "Hits / accepted subrounds"]}
                    rows={Object.entries(a.hitRates).flatMap(([kind, group]) => Object.keys(group).length
                        ? Object.entries(group).map(([id, r]) => [kind, id, ratio(r)]) : [[kind, "No hits", `0 / ${a.subrounds} = 0`]])} />
                <AnalyticsTable label="Component statistics" headers={["Type", "ID", "Symbol", "Samples", "Occurrences", "Amount (currency)"]}
                    rows={Object.values(a.components).map(c => [c.type, c.id, c.symbol ?? "none", c.samples, c.occurrences, c.amount])} />
                {Object.keys(a.components).length === 0 && <Text size="sm">No canonical components observed.</Text>}
            </>}
        </AdvancedDisclosure>
        <AdvancedDisclosure label="analytics provenance">
            <AnalyticsTable label="Analytics provenance" headers={["Field", "Value"]} rows={[
                ["Model", a.envelope.modelId ?? "unavailable"], ["Schema", a.envelope.schemaVersion], ["Policy", a.envelope.policy],
            ]} />
        </AdvancedDisclosure>
    </PageSection>;
}
