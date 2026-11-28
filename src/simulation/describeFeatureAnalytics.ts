import {FEATURE_NAMES, type FeatureAnalytics, type AnalyticsRatio} from "./FeatureAnalytics.js";

/** Shared text projection used by CLI, saved reports and the rendered Studio report. */
export function describeFeatureAnalytics(a?: FeatureAnalytics): string[] {
    if (!a) return ["Feature analytics unavailable (older report or no canonical observations)."];
    const ratio = (r: AnalyticsRatio) => `${r.numerator} / ${r.denominator} = ${
        typeof r.value === "number" && Number.isFinite(r.value) ? Number(r.value.toPrecision(6)) : r.value
    }`;
    const lines = [
        `Feature analytics: accepted-spin sampling; zero denominator yields 0. Model: ${a.envelope.modelId ?? "unavailable"}; schema ${a.envelope.schemaVersion}.`,
        `Paid entries: ${a.paidEntries}; all entries: ${a.logicalEntries}; completed paid rounds: ${a.logicalCompletions}; accepted spins: ${a.subrounds}; mathematical cascade steps: ${a.cascadeSteps}; carried-in spins: ${a.carriedSubrounds}.`,
        `Dead spins (zero-win spins): ${ratio(a.deadSpinRate)}.`,
        `Largest single-spin win observed (currency amount; not the whole-paid-round or theoretical maximum): ${a.maxWin}; occurrence / accepted spins: ${ratio(a.maxWinRate)}; maximum single-spin payout share: ${ratio(a.maxWinContribution)}.`,
        `Top 10 positive single-spin wins (descending; ties occupy slots): [${a.topWins.join(", ")}]; single-spin payout share: ${ratio(a.topWinContribution)}.`,
    ];
    if (!a.envelope.lifecycle) lines.push("Feature status unavailable: entry/exit evidence absent; event presence is not duration.");
    else for (const name of FEATURE_NAMES) {
        if (!a.envelope.supportedFeatures.includes(name)) {
            lines.push(`${name}: status unavailable or feature not configured.`);
            continue;
        }
        const f = a.features[name],
            r = a.lifecycle[name];
        if (f.entries === 0) lines.push(`${name}: configured and supported, no entries observed; zero is not evidence of absence or precise feature RTP.`);
        lines.push(
            `${name}: entries / paid rounds: ${ratio(r.entryPerPaidRound)}; entries / logical entries: ${ratio(
                r.entryPerLogicalRound,
            )}; retriggers / feature entries: ${ratio(r.retriggerPerEntry)}; grants: ${f.grants}; executed feature plays on entry: ${
                f.entrySubrounds
            }; executed plays in completed features: ${f.durationSum}; completions: ${f.completions}; incomplete: ${r.incomplete}; carried-in incomplete: ${r.carriedIncomplete}; carried completions: ${r.carriedCompletions}; excluded restored completions: ${
                f.excludedCompletions
            }.`,
            `${name}: duration (executed feature spins; triggering entry counted only if it executes the feature) / completions: ${ratio(
                r.averageDuration,
            )}; bonus win / completions: ${ratio(r.averageWin)}; duration distribution [0,(0,10),[10,100),100+]: [${
                f.durationHistogram
            }]; win distribution (currency amounts; bins [0,(0,10),[10,100),100+]; completed features only): [${f.winHistogram}].`,
        );
    }
    lines.push("Feature wins can overlap; do not sum them as additive payouts. Base/feature/jackpot/unavailable partitions are additive; bet modes are a separate dimension.");
    for (const [name, c] of Object.entries(a.contribution)) lines.push(`${name}: RTP contribution / actual charged stake: ${ratio(c.rtp)}; payout share / total win: ${ratio(c.payoutShare)}.`);
    for (const [name, c] of Object.entries(a.betModeContribution)) lines.push(
        `Bet mode ${name} (separate attribution dimension): RTP contribution / actual charged stake: ${ratio(c.rtp)}; payout share / total win: ${ratio(
            c.payoutShare,
        )}.`,
    );
    if (!a.envelope.components) lines.push("Symbol/line/scatter hits unavailable.");
    else {
        for (const [kind, group] of Object.entries(a.hitRates)) {
            const label = kind === "scatter" ? "scatter win hits" : `${kind} hits`;
            if (!Object.keys(group).length) lines.push(`${label} / accepted spins: 0 / ${a.subrounds} = 0.`);
            for (const [id, r] of Object.entries(group)) lines.push(`${label} ${id} / accepted spins (deduplicated): ${ratio(r)}.`);
        }
        const componentLabel = (c: (typeof a.components)[string]): string => {
            const symbol = c.symbol ?? c.id;
            if (c.type === "line" && (/^[0-9]+$/).test(c.id)) return `Line ${Number(c.id) + 1}${c.symbol === null ? "" : ` · ${c.symbol}`}`;
            if (c.type === "symbol") return `Symbol ${symbol}`;
            if (c.type === "scatter") return `Scatter ${symbol}`;
            return `${c.type} ${c.id}`;
        };
        for (const c of Object.values(a.components)) lines.push(`${componentLabel(c)}: samples ${c.samples}; occurrences ${c.occurrences}; amount ${c.amount}.`);
    }
    return lines;
}
