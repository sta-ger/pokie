/** Versioned plain-data analytics. Samples are accepted mathematical plays, never deliveries. */
export const FEATURE_ANALYTICS_POLICY = "accepted-subround-v1;duration=executed-feature-subrounds;bins=0,10,100;top=10-desc-with-multiplicity";
export const FEATURE_NAMES = ["freeGames", "holdAndWin", "respins", "weightedBonus", "collection", "cascade", "modifiers"] as const;
export type AnalyticsFeature = (typeof FEATURE_NAMES)[number];
export type AnalyticsEnvelope = {
    schemaVersion: 1;
    eventVersion: 1;
    modelId: string | null;
    policy: string;
    lifecycle: boolean;
    components: boolean;
    supportedFeatures: AnalyticsFeature[];
};
export type AnalyticsComponent = {type: string; id: string; symbol: string | null; amount: number; partition: "base" | "feature" | "jackpot" | "unavailable"};
export type AnalyticsFeatureEvent = {
    feature: AnalyticsFeature;
    entry?: boolean;
    entryExecuted?: boolean;
    retrigger?: boolean;
    granted?: number;
    completion?: {duration: number; win: number};
    excludedCompletion?: boolean;
};
export type FeatureAnalyticsObservation = {
    envelope: AnalyticsEnvelope;
    source: string;
    position?: number;
    activeKnownFeatures?: AnalyticsFeature[];
    activeCarriedFeatures?: AnalyticsFeature[];
    logicalEntry: boolean;
    logicalCompletion: boolean;
    carriedSubround: boolean;
    cascadeSteps: number;
    mode?: string;
    components?: AnalyticsComponent[];
    features: AnalyticsFeatureEvent[];
};
export type FeatureAnalyticsCounters = {
    entries: number;
    entrySubrounds: number;
    retriggers: number;
    grants: number;
    completions: number;
    excludedCompletions: number;
    durationSum: number;
    winSum: number;
    durationHistogram: number[];
    winHistogram: number[];
};
export type FeatureAnalyticsSnapshot = {
    envelope: AnalyticsEnvelope;
    subrounds: number;
    paidEntries: number;
    logicalEntries: number;
    logicalCompletions: number;
    carriedSubrounds: number;
    cascadeSteps: number;
    totalStake: number;
    totalWin: number;
    deadSpins: number;
    maxWin: number;
    maxWinCount: number;
    topWins: number[];
    partition: {base: number; feature: number; jackpot: number; unavailable: number};
    betModes: Record<string, number>;
    components: Record<string, {type: string; id: string; symbol: string | null; occurrences: number; samples: number; amount: number}>;
    hits: {symbol: Record<string, number>; line: Record<string, number>; scatter: Record<string, number>};
    features: Record<AnalyticsFeature, FeatureAnalyticsCounters>;
    /** At most 64 independent trajectories. No per-round or per-feature identities. */
    sources: Record<string, Record<AnalyticsFeature, {entries: number; completions: number; lastPosition: number; endKnown: boolean; endCarried: boolean}>>;
};
export type AnalyticsRatio = {numerator: number; denominator: number; value: number};
export type FeatureAnalytics = Omit<FeatureAnalyticsSnapshot, "sources"> & {
    unit: "accepted-subround";
    zeroConvention: "zero-denominator-yields-zero";
    deadSpinRate: AnalyticsRatio;
    maxWinRate: AnalyticsRatio;
    maxWinContribution: AnalyticsRatio;
    topWinContribution: AnalyticsRatio;
    contribution: Record<keyof FeatureAnalyticsSnapshot["partition"], {rtp: AnalyticsRatio; payoutShare: AnalyticsRatio}>;
    betModeContribution: Record<string, {rtp: AnalyticsRatio; payoutShare: AnalyticsRatio}>;
    hitRates: Record<"symbol" | "line" | "scatter", Record<string, AnalyticsRatio>>;
    lifecycle: Record<
        AnalyticsFeature,
        {
            entryPerPaidRound: AnalyticsRatio;
            entryPerLogicalRound: AnalyticsRatio;
            retriggerPerEntry: AnalyticsRatio;
            averageDuration: AnalyticsRatio;
            averageWin: AnalyticsRatio;
            incomplete: number;
            carriedCompletions: number;
            carriedIncomplete: number;
        }
    >;
};
export function analyticsEnvelope(
    modelId: string | null = null,
    lifecycle = false,
    components = false,
    supportedFeatures: AnalyticsFeature[] = lifecycle ? [...FEATURE_NAMES] : [],
): AnalyticsEnvelope {
    return {schemaVersion: 1, eventVersion: 1, modelId, policy: FEATURE_ANALYTICS_POLICY, lifecycle, components, supportedFeatures};
}
const featureRecord = <T>(create: () => T): Record<AnalyticsFeature, T> =>
    Object.fromEntries(FEATURE_NAMES.map((name) => [name, create()])) as Record<AnalyticsFeature, T>;
export function emptyFeatureAnalytics(envelope = analyticsEnvelope()): FeatureAnalyticsSnapshot {
    return {
        envelope: {...envelope},
        subrounds: 0,
        paidEntries: 0,
        logicalEntries: 0,
        logicalCompletions: 0,
        carriedSubrounds: 0,
        cascadeSteps: 0,
        totalStake: 0,
        totalWin: 0,
        deadSpins: 0,
        maxWin: 0,
        maxWinCount: 0,
        topWins: [],
        partition: {base: 0, feature: 0, jackpot: 0, unavailable: 0},
        betModes: {},
        components: {},
        hits: {symbol: {}, line: {}, scatter: {}},
        sources: {},
        features: featureRecord(() => ({
            entries: 0,
            entrySubrounds: 0,
            retriggers: 0,
            grants: 0,
            completions: 0,
            excludedCompletions: 0,
            durationSum: 0,
            winSum: 0,
            durationHistogram: [0, 0, 0, 0],
            winHistogram: [0, 0, 0, 0],
        })),
    };
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const count = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
const finite = (n: number): boolean => Number.isFinite(n) && n >= 0;
// Validation allows accumulated floating-point addition error; stored amounts are never rounded.
const close = (a: number, b: number, operations = 1): boolean =>
    Math.abs(a - b) <= Number.EPSILON * Math.max(32, operations * 4) * Math.max(Number.MIN_VALUE, Math.abs(a), Math.abs(b));
function bucket(n: number): number {
    if (n === 0) return 0;
    if (n < 10) return 1;
    if (n < 100) return 2;
    return 3;
}
function boundedKey(key: string): void {
    if (!key || key.length > 1024) throw new Error("Invalid analytics dimension key.");
}
function increment(record: Record<string, number>, key: string, value: number): void {
    boundedKey(key);
    Reflect.defineProperty(record, key, {
        value: (Reflect.getOwnPropertyDescriptor(record, key) !== undefined ? record[key] : 0) + value,
        enumerable: true,
        writable: true,
        configurable: true,
    });
}
function checkDimensions(s: FeatureAnalyticsSnapshot): void {
    if (
        Object.keys(s.sources).length > 64 ||
        Object.keys(s.betModes).length > 128 ||
        Object.keys(s.components).length > 512 ||
        Object.values(s.hits).some((r) => Object.keys(r).length > 512)
    ) throw new Error("Analytics model dimension/trajectory bound exceeded (64 trajectories, 128 modes, 512 components/hits).");
}
function requireKeys(value: unknown, keys: readonly string[]): void {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).length !== keys.length ||
        keys.some((key) => Reflect.getOwnPropertyDescriptor(value, key) === undefined)
    ) throw new Error("Invalid analytics plain-data schema fields.");
}
export function validateFeatureAnalytics(s: FeatureAnalyticsSnapshot): void {
    requireKeys(s, [
        "envelope",
        "subrounds",
        "paidEntries",
        "logicalEntries",
        "logicalCompletions",
        "carriedSubrounds",
        "cascadeSteps",
        "totalStake",
        "totalWin",
        "deadSpins",
        "maxWin",
        "maxWinCount",
        "topWins",
        "partition",
        "betModes",
        "components",
        "hits",
        "features",
        "sources",
    ]);
    requireKeys(s.envelope, ["schemaVersion", "eventVersion", "modelId", "policy", "lifecycle", "components", "supportedFeatures"]);
    requireKeys(s.partition, ["base", "feature", "jackpot", "unavailable"]);
    requireKeys(s.features, FEATURE_NAMES);
    requireKeys(s.hits, ["symbol", "line", "scatter"]);
    for (const [key, source] of Object.entries(s.sources)) {
        boundedKey(key);
        requireKeys(source, FEATURE_NAMES);
        for (const f of Object.values(source)) requireKeys(f, ["entries", "completions", "lastPosition", "endKnown", "endCarried"]);
    }
    for (const f of Object.values(s.features)) requireKeys(f, [
        "entries",
        "entrySubrounds",
        "retriggers",
        "grants",
        "completions",
        "excludedCompletions",
        "durationSum",
        "winSum",
        "durationHistogram",
        "winHistogram",
    ]);
    for (const [key, c] of Object.entries(s.components)) {
        boundedKey(key);
        requireKeys(c, ["type", "id", "symbol", "occurrences", "samples", "amount"]);
        if (key !== JSON.stringify([c.type, c.id, c.symbol])) throw new Error("Invalid analytics component identity.");
    }

    if (
        !s ||
        s.envelope?.schemaVersion !== 1 ||
        s.envelope.eventVersion !== 1 ||
        s.envelope.policy !== FEATURE_ANALYTICS_POLICY ||
        !(s.envelope.modelId === null || (typeof s.envelope.modelId === "string" && s.envelope.modelId.length > 0 && s.envelope.modelId.length <= 1024)) ||
        typeof s.envelope.lifecycle !== "boolean" ||
        typeof s.envelope.components !== "boolean" ||
        !Array.isArray(s.envelope.supportedFeatures) ||
        JSON.stringify(s.envelope.supportedFeatures) !== JSON.stringify(FEATURE_NAMES.filter((name) => s.envelope.supportedFeatures.includes(name)))
    ) throw new Error("Incompatible analytics model/schema/metric policy envelope.");
    const counters = [s.subrounds, s.paidEntries, s.logicalEntries, s.logicalCompletions, s.carriedSubrounds, s.cascadeSteps, s.deadSpins, s.maxWinCount];
    if (
        !counters.every(count) ||
        s.paidEntries > s.subrounds ||
        s.logicalEntries > s.subrounds ||
        s.logicalCompletions > s.subrounds ||
        s.carriedSubrounds > s.subrounds ||
        s.deadSpins > s.subrounds ||
        s.maxWinCount > s.subrounds ||
        (s.maxWin === 0 && s.maxWinCount !== s.subrounds) ||
        ![s.totalStake, s.totalWin, s.maxWin, ...Object.values(s.partition), ...Object.values(s.betModes)].every(finite)
    ) throw new Error("Invalid analytics counts/totals.");
    if (!Array.isArray(s.topWins)) throw new Error("Invalid analytics top-win array.");
    if (s.maxWin > 0 && s.maxWinCount > s.subrounds - s.deadSpins) throw new Error("Invalid analytics maximum occurrence count.");
    if (
        !close(
            Object.values(s.partition).reduce((a, b) => a + b, 0),
            s.totalWin,
            s.subrounds,
        ) ||
        s.maxWin > s.totalWin ||
        s.topWins.length > 10 ||
        !Array.from(s.topWins).every((n, i) => finite(n) && n > 0 && n <= s.maxWin && (i === 0 || n <= s.topWins[i - 1])) ||
        s.topWins.length !== Math.min(10, s.subrounds - s.deadSpins) ||
        (s.maxWin > 0 && (s.maxWinCount === 0 || s.topWins[0] !== s.maxWin))
    ) throw new Error("Invalid analytics payout conservation/top-win state.");
    for (const name of FEATURE_NAMES) {
        const f = s.features[name];
        if (
            !f ||
            ![
                f.entries,
                f.entrySubrounds,
                f.retriggers,
                f.grants,
                f.completions,
                f.excludedCompletions,
                f.durationSum,
                ...f.durationHistogram,
                ...f.winHistogram,
            ].every(count) ||
            !finite(f.winSum) ||
            f.entrySubrounds > f.entries ||
            f.entries + f.retriggers > s.subrounds ||
            f.completions + f.excludedCompletions > s.subrounds ||
            f.durationHistogram.length !== 4 ||
            f.winHistogram.length !== 4 ||
            f.durationHistogram.reduce((a, b) => a + b, 0) !== f.completions ||
            f.winHistogram.reduce((a, b) => a + b, 0) !== f.completions
        ) throw new Error(`Invalid analytics lifecycle counters for ${name}.`);
        for (const field of ["entries", "completions"] as const) if (Object.values(s.sources).reduce((sum, source) => sum + source[name][field], 0) !== f[field]) throw new Error(`Inconsistent analytics source ${field}.`);
    }
    for (const source of Object.values(s.sources)) for (const f of Object.values(source)) if (
        ![f.entries, f.completions, f.lastPosition].every(count) ||
                typeof f.endKnown !== "boolean" ||
                typeof f.endCarried !== "boolean" ||
                (f.endKnown && f.endCarried)
    ) throw new Error("Invalid analytics source counters.");
    for (const group of Object.values(s.hits)) for (const [key, n] of Object.entries(group)) {
        boundedKey(key);
        if (!count(n) || n > s.subrounds) throw new Error("Invalid analytics hit count.");
    }
    for (const c of Object.values(s.components)) if (!count(c.occurrences) || !count(c.samples) || c.samples > s.subrounds || c.samples > c.occurrences || !finite(c.amount)) throw new Error("Invalid analytics component aggregate.");
    checkDimensions(s);
}
export function mergeFeatureAnalytics(a: FeatureAnalyticsSnapshot | undefined, b: FeatureAnalyticsSnapshot | undefined): FeatureAnalyticsSnapshot | undefined {
    if (!b) {
        if (a) validateFeatureAnalytics(a);
        return a && clone(a);
    }
    validateFeatureAnalytics(b);
    if (!a) return clone(b);
    validateFeatureAnalytics(a);
    if ((Object.keys(a.envelope) as Array<keyof AnalyticsEnvelope>).some((key) => JSON.stringify(a.envelope[key]) !== JSON.stringify(b.envelope[key]))) throw new Error("Incompatible analytics model/schema/metric policy provenance; missing identity cannot match known identity.");
    const s = clone(a);
    for (const field of [
        "subrounds",
        "paidEntries",
        "logicalEntries",
        "logicalCompletions",
        "carriedSubrounds",
        "cascadeSteps",
        "totalStake",
        "totalWin",
        "deadSpins",
    ] as const) s[field] += b[field];
    if (b.maxWin > s.maxWin) {
        s.maxWin = b.maxWin;
        s.maxWinCount = b.maxWinCount;
    } else if (b.maxWin === s.maxWin) s.maxWinCount += b.maxWinCount;
    s.topWins = [...s.topWins, ...b.topWins].sort((x, y) => y - x).slice(0, 10);
    for (const k of Object.keys(s.partition) as Array<keyof typeof s.partition>) s.partition[k] += b.partition[k];
    for (const [k, n] of Object.entries(b.betModes)) increment(s.betModes, k, n);
    for (const kind of ["symbol", "line", "scatter"] as const) for (const [k, n] of Object.entries(b.hits[kind])) increment(s.hits[kind], k, n);
    for (const [k, v] of Object.entries(b.components)) {
        const old = Reflect.getOwnPropertyDescriptor(s.components, k) !== undefined ? s.components[k] : {...v, samples: 0, occurrences: 0, amount: 0};
        Reflect.defineProperty(s.components, k, {
            value: {...v, samples: old.samples + v.samples, occurrences: old.occurrences + v.occurrences, amount: old.amount + v.amount},
            enumerable: true,
            configurable: true,
            writable: true,
        });
    }
    for (const name of FEATURE_NAMES) {
        const f = s.features[name],
            g = b.features[name];
        for (const key of ["entries", "entrySubrounds", "retriggers", "grants", "completions", "excludedCompletions", "durationSum", "winSum"] as const) f[key] += g[key];
        f.durationHistogram = f.durationHistogram.map((n, i) => n + g.durationHistogram[i]);
        f.winHistogram = f.winHistogram.map((n, i) => n + g.winHistogram[i]);
    }
    for (const [key, source] of Object.entries(b.sources)) {
        boundedKey(key);
        const target =
            Reflect.getOwnPropertyDescriptor(s.sources, key) !== undefined
                ? s.sources[key]
                : featureRecord(() => ({entries: 0, completions: 0, lastPosition: 0, endKnown: false, endCarried: false}));
        for (const name of FEATURE_NAMES) {
            target[name].entries += source[name].entries;
            target[name].completions += source[name].completions;
            if (source[name].lastPosition >= target[name].lastPosition) {
                target[name].lastPosition = source[name].lastPosition;
                target[name].endKnown = source[name].endKnown;
                target[name].endCarried = source[name].endCarried;
            }
        }
        Reflect.defineProperty(s.sources, key, {value: target, enumerable: true, configurable: true, writable: true});
    }
    validateFeatureAnalytics(s);
    return s;
}
export function observeFeatureAnalytics(stake: number, win: number, observation?: FeatureAnalyticsObservation): FeatureAnalyticsSnapshot {
    if (![stake, win].every(finite)) throw new Error("Analytics requires finite non-negative stake/win.");
    if (
        observation &&
        (![observation.logicalEntry, observation.logicalCompletion, observation.carriedSubround].every((value) => typeof value === "boolean") ||
            !count(observation.cascadeSteps) ||
            typeof observation.source !== "string" ||
            (observation.mode !== undefined && typeof observation.mode !== "string"))
    ) throw new Error("Invalid analytics observation envelope.");
    if (
        observation &&
        [observation.activeKnownFeatures, observation.activeCarriedFeatures].some(
            (names) =>
                names !== undefined &&
                (!Array.isArray(names) || new Set(names).size !== names.length || Array.from(names).some((name) => !FEATURE_NAMES.includes(name))),
        )
    ) throw new Error("Invalid analytics active feature evidence.");
    if (observation && observation.components !== undefined && !Array.isArray(observation.components)) throw new Error("Invalid analytics component list.");
    const s = emptyFeatureAnalytics(observation?.envelope);
    s.subrounds = 1;
    s.paidEntries = stake > 0 ? 1 : 0;
    s.totalStake = stake;
    s.totalWin = win;
    s.deadSpins = win === 0 ? 1 : 0;
    s.maxWin = win;
    s.maxWinCount = 1;
    s.topWins = win > 0 ? [win] : [];
    if (!observation) {
        s.partition.unavailable = win;
        return s;
    }
    s.logicalEntries = +observation.logicalEntry;
    s.logicalCompletions = +observation.logicalCompletion;
    s.carriedSubrounds = +observation.carriedSubround;
    s.cascadeSteps = observation.cascadeSteps;
    if (observation.mode) increment(s.betModes, observation.mode, win);
    const hits = {symbol: new Set<string>(), line: new Set<string>(), scatter: new Set<string>()};
    let componentTotal = 0;
    for (const c of observation.components ?? []) {
        if (
            !c ||
            typeof c.type !== "string" ||
            typeof c.id !== "string" ||
            !(c.symbol === null || typeof c.symbol === "string") ||
            !finite(c.amount) ||
            !["base", "feature", "jackpot", "unavailable"].includes(c.partition)
        ) throw new Error("Invalid analytics monetary component.");
        const key = JSON.stringify([c.type, c.id, c.symbol]);
        boundedKey(key);
        componentTotal += c.amount;
        s.partition[c.partition] += c.amount;
        const old = s.components[key];
        s.components[key] = {
            type: c.type,
            id: c.id,
            symbol: c.symbol,
            occurrences: (old?.occurrences ?? 0) + 1,
            samples: 1,
            amount: (old?.amount ?? 0) + c.amount,
        };
        // A zero-paying canonical component still records a hit; landed display symbols do not.
        if (c.symbol !== null) hits.symbol.add(c.symbol);
        if (c.type === "line") hits.line.add(c.id);
        if (c.type === "scatter") hits.scatter.add(c.symbol ?? c.id);
    }
    if (!close(componentTotal, win) && observation.components !== undefined) throw new Error("Analytics canonical components do not conserve accepted win.");
    if (observation.components === undefined) s.partition.unavailable = win;
    for (const kind of ["symbol", "line", "scatter"] as const) for (const key of hits[kind]) increment(s.hits[kind], key, 1);
    boundedKey(observation.source);
    Reflect.defineProperty(s.sources, observation.source, {
        value: featureRecord(() => ({entries: 0, completions: 0, lastPosition: 0, endKnown: false, endCarried: false})),
        enumerable: true,
        configurable: true,
        writable: true,
    });
    if (!Array.isArray(observation.features)) throw new Error("Invalid analytics lifecycle event list.");
    const lifecycleSeen = new Set<string>();
    for (const event of observation.features) {
        if (
            !event ||
            [event.entry, event.entryExecuted, event.retrigger, event.excludedCompletion].some((flag) => flag !== undefined && typeof flag !== "boolean") ||
            (event.granted !== undefined && !count(event.granted))
        ) throw new Error("Invalid analytics lifecycle event fields.");
        if (event.completion !== undefined) requireKeys(event.completion, ["duration", "win"]);

        if (!s.envelope.supportedFeatures.includes(event.feature) || lifecycleSeen.has(event.feature) || !count(event.granted ?? 0)) throw new Error("Invalid/repeated analytics lifecycle observation.");
        lifecycleSeen.add(event.feature);
        const f = s.features[event.feature];
        f.entries = event.entry ? 1 : 0;
        f.entrySubrounds = event.entryExecuted ? 1 : 0;
        if (event.entryExecuted && !event.entry) throw new Error("Invalid analytics entry execution.");
        f.retriggers = event.retrigger ? 1 : 0;
        f.grants = event.granted ?? 0;
        f.excludedCompletions = event.excludedCompletion ? 1 : 0;
        if ((event.entry && event.retrigger) || (event.completion && event.excludedCompletion)) throw new Error("Inconsistent analytics lifecycle observation.");
        if (event.completion) {
            if (!count(event.completion.duration) || !finite(event.completion.win)) throw new Error("Invalid analytics feature completion.");
            f.completions = 1;
            f.durationSum = event.completion.duration;
            f.winSum = event.completion.win;
            f.durationHistogram[bucket(f.durationSum)]++;
            f.winHistogram[bucket(f.winSum)]++;
        }
        s.sources[observation.source][event.feature].entries = f.entries;
        s.sources[observation.source][event.feature].completions = f.completions;
    }
    if (!count(observation.position ?? 0)) throw new Error("Invalid analytics source position.");
    for (const name of FEATURE_NAMES) {
        const f = s.sources[observation.source][name];
        f.lastPosition = observation.position ?? 0;
        f.endKnown = observation.activeKnownFeatures?.includes(name) ?? false;
        f.endCarried = observation.activeCarriedFeatures?.includes(name) ?? false;
    }
    validateFeatureAnalytics(s);
    return s;
}
export function featureAnalyticsStatistics(snapshot: FeatureAnalyticsSnapshot): FeatureAnalytics {
    const {sources, ...s} = clone(snapshot);
    const ratio = (numerator: number, denominator: number): AnalyticsRatio => ({numerator, denominator, value: denominator > 0 ? numerator / denominator : 0});
    const contribution = (amount: number) => ({rtp: ratio(amount, s.totalStake), payoutShare: ratio(amount, s.totalWin)});
    return {
        ...s,
        unit: "accepted-subround",
        zeroConvention: "zero-denominator-yields-zero",
        deadSpinRate: ratio(s.deadSpins, s.subrounds),
        maxWinRate: ratio(s.maxWinCount, s.subrounds),
        maxWinContribution: ratio(s.maxWin * s.maxWinCount, s.totalWin),
        topWinContribution: ratio(
            s.topWins.reduce((a, b) => a + b, 0),
            s.totalWin,
        ),
        contribution: Object.fromEntries(Object.entries(s.partition).map(([key, n]) => [key, contribution(n)])) as FeatureAnalytics["contribution"],
        betModeContribution: Object.fromEntries(Object.entries(s.betModes).map(([key, n]) => [key, contribution(n)])),
        hitRates: Object.fromEntries(
            Object.entries(s.hits).map(([kind, group]) => [kind, Object.fromEntries(Object.entries(group).map(([key, n]) => [key, ratio(n, s.subrounds)]))]),
        ) as FeatureAnalytics["hitRates"],
        lifecycle: Object.fromEntries(
            FEATURE_NAMES.map((name) => {
                const f = s.features[name];
                return [
                    name,
                    {
                        entryPerPaidRound: ratio(f.entries, s.paidEntries),
                        entryPerLogicalRound: ratio(f.entries, s.logicalEntries),
                        retriggerPerEntry: ratio(f.retriggers, f.entries),
                        averageDuration: ratio(f.durationSum, f.completions),
                        averageWin: ratio(f.winSum, f.completions),
                        incomplete: Object.values(sources).reduce(
                            (sum, source) => sum + Math.max(source[name].endKnown ? 1 : 0, source[name].entries - source[name].completions, 0),
                            0,
                        ),
                        carriedIncomplete: Object.values(sources).reduce(
                            (sum, source) => sum + (source[name].endCarried || (source[name].endKnown && source[name].entries === 0) ? 1 : 0),
                            0,
                        ),
                        carriedCompletions: Object.values(sources).reduce(
                            (sum, source) => sum + Math.max(0, source[name].completions - source[name].entries),
                            0,
                        ),
                    },
                ];
            }),
        ) as FeatureAnalytics["lifecycle"],
    };
}
