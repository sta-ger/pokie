import {FEATURE_NAMES, type FeatureAnalytics, type AnalyticsRatio} from "./FeatureAnalytics.js";

/** Shared text projection used by CLI, saved reports and the rendered Studio report. */
export function describeFeatureAnalytics(a?: FeatureAnalytics): string[] {
    if (!a) return ["Feature analytics unavailable (older report or no canonical observations)."];
    const ratio = (r: AnalyticsRatio) => `${r.numerator} / ${r.denominator} = ${r.value}`;
    const lines = [
        `Feature analytics: accepted-subround sampling; zero denominator yields 0. Model: ${a.envelope.modelId ?? "unavailable"}; schema ${
            a.envelope.schemaVersion
        }; policy ${a.envelope.policy}.`,
        `Paid entries: ${a.paidEntries}; all logical entries: ${a.logicalEntries}; completed logical rounds: ${a.logicalCompletions}; accepted subrounds: ${a.subrounds}; mathematical cascade steps: ${a.cascadeSteps}; carried-in subrounds: ${a.carriedSubrounds}.`,
        `Dead spins (zero-win subrounds): ${ratio(a.deadSpinRate)}.`,
        `Exact maximum observed win (currency amount; not theoretical game maximum): ${a.maxWin}; occurrence / subrounds: ${ratio(a.maxWinRate)}; maximum payout share: ${ratio(a.maxWinContribution)}.`,
        `Top 10 positive subround wins (descending, ties occupy slots): [${a.topWins.join(", ")}]; payout share: ${ratio(a.topWinContribution)}.`,
    ];
    if (!a.envelope.lifecycle) lines.push("Feature lifecycle unavailable: canonical entry/exit evidence absent; event presence is not duration.");
    else for (const name of FEATURE_NAMES) {
        if (!a.envelope.supportedFeatures.includes(name)) {
            lines.push(`${name}: lifecycle unavailable or feature not configured.`);
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
            `${name}: duration (executed feature subrounds; triggering entry counted only if it executes the feature) / completions: ${ratio(
                r.averageDuration,
            )}; bonus win / completions: ${ratio(r.averageWin)}; duration distribution [0,(0,10),[10,100),100+]: [${
                f.durationHistogram
            }]; win distribution (currency amounts; bins [0,(0,10),[10,100),100+]; completed features only): [${f.winHistogram}].`,
        );
    }
    lines.push("Feature lifecycle wins can overlap; do not sum them as additive payouts. Base/feature/jackpot/unavailable partitions are additive; bet modes are a separate dimension.");
    for (const [name, c] of Object.entries(a.contribution)) lines.push(`${name}: RTP contribution / actual charged stake: ${ratio(c.rtp)}; payout share / total win: ${ratio(c.payoutShare)}.`);
    for (const [name, c] of Object.entries(a.betModeContribution)) lines.push(
        `Bet mode ${name} (separate attribution dimension): RTP contribution / actual charged stake: ${ratio(c.rtp)}; payout share / total win: ${ratio(
            c.payoutShare,
        )}.`,
    );
    if (!a.envelope.components) lines.push("Canonical symbol/line/scatter hits unavailable.");
    else {
        for (const [kind, group] of Object.entries(a.hitRates)) {
            if (!Object.keys(group).length) lines.push(`${kind} hits / accepted subrounds: 0 / ${a.subrounds} = 0.`);
            for (const [id, r] of Object.entries(group)) lines.push(`${kind} ${id} hits / accepted subrounds (deduplicated): ${ratio(r)}.`);
        }
        for (const c of Object.values(a.components)) lines.push(`Component ${c.type}/${c.id}/${c.symbol ?? "none"}: samples ${c.samples}; occurrences ${c.occurrences}; amount ${c.amount}.`);
    }
    return lines;
}
