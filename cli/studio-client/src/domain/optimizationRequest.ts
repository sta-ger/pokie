import type {GameModelPaytableRow, GameModelProjection, StudioOptimizationRequest} from "../api/types";

export type OptimizationTarget = StudioOptimizationRequest["targets"][number];
export type OptimizationPolicy = StudioOptimizationRequest["policy"];
export type OptimizationTunable = OptimizationPolicy["tunables"][number];

export type OptimizationMetricOption = {
    metric: OptimizationTarget["metric"];
    unit: OptimizationTarget["unit"];
    label: string;
    scale: number;
    valueSuffix: string;
    toleranceSuffix: string;
    defaultValue: number;
    defaultTolerance: number;
    step: number;
};

// The four targets a paytable author reaches for first. Distribution and feature-frequency targets remain
// available through the expert JSON policy because they need a bucket/event identity this compact form
// cannot collect honestly.
export const OPTIMIZATION_METRICS: readonly OptimizationMetricOption[] = [
    {metric: "rtp", unit: "ratio", label: "RTP", scale: 100, valueSuffix: "%", toleranceSuffix: "pp", defaultValue: 95, defaultTolerance: 0.5, step: 0.01},
    {metric: "hitFrequency", unit: "ratio", label: "Hit frequency", scale: 100, valueSuffix: "%", toleranceSuffix: "pp", defaultValue: 25, defaultTolerance: 1, step: 0.01},
    {metric: "volatility", unit: "standardDeviation", label: "Volatility (std. deviation)", scale: 1, valueSuffix: "", toleranceSuffix: "", defaultValue: 3, defaultTolerance: 0.1, step: 0.01},
    {metric: "maxWin", unit: "betMultiple", label: "Max win (× bet)", scale: 1, valueSuffix: "× bet", toleranceSuffix: "× bet", defaultValue: 100, defaultTolerance: 5, step: 0.1},
];

export function findOptimizationMetric(target: OptimizationTarget): OptimizationMetricOption | undefined {
    return OPTIMIZATION_METRICS.find((option) => option.metric === target.metric && option.unit === target.unit);
}

export function defaultTargetForMetric(option: OptimizationMetricOption): OptimizationTarget {
    return {
        metric: option.metric,
        unit: option.unit,
        value: option.defaultValue / option.scale,
        tolerance: {kind: "absolute", value: option.defaultTolerance / option.scale},
    };
}

export function metricDisplayValue(target: OptimizationTarget, option: OptimizationMetricOption): number {
    return target.value * option.scale;
}

export function metricDisplayTolerance(target: OptimizationTarget, option: OptimizationMetricOption): number {
    return (target.tolerance?.value ?? 0) * option.scale;
}

const escapePointerToken = (value: string): string => value.replace(/~/g, "~0").replace(/\//g, "~1");
const unescapePointerToken = (value: string): string => value.replace(/~1/g, "/").replace(/~0/g, "~");

export function paytablePath(row: Pick<GameModelPaytableRow, "symbolId" | "matchCount">): string {
    return `/paytable/${escapePointerToken(row.symbolId)}/${escapePointerToken(String(row.matchCount))}`;
}

export function parsePaytablePath(path: string): {symbolId: string; matchCount: number} | undefined {
    const parts = path.split("/");
    if (parts.length !== 4 || parts[0] !== "" || parts[1] !== "paytable") return undefined;
    const matchCount = Number(parts[3]);
    if (!Number.isSafeInteger(matchCount)) return undefined;
    return {symbolId: unescapePointerToken(parts[2]), matchCount};
}

export function paytableRows(model: GameModelProjection | undefined): GameModelPaytableRow[] {
    return model?.paytable.status === "available" ? model.paytable.data : [];
}

export function paytableRowForPath(model: GameModelProjection | undefined, path: string): GameModelPaytableRow | undefined {
    const parsed = parsePaytablePath(path);
    if (parsed === undefined) return undefined;
    return paytableRows(model).find((row) => row.symbolId === parsed.symbolId && row.matchCount === parsed.matchCount);
}

export function describeTunablePath(path: string): string {
    const parsed = parsePaytablePath(path);
    if (parsed !== undefined) return `${parsed.symbolId} × ${parsed.matchCount} payout`;
    return path;
}

/** Five nearby paytable values; decimal payouts keep a finer step instead of silently rounding. */
export function suggestedPaytableValues(current?: number): number[] {
    if (current === undefined || !Number.isFinite(current)) return [1, 2, 3];
    const step = Number.isInteger(current) ? 1 : 0.5;
    const round = (value: number): number => Number(value.toFixed(6));
    return [...new Set([current - 2 * step, current - step, current, current + step, current + 2 * step]
        .map(round)
        .filter((value) => value >= 0))];
}

export function suggestedTunableValues(path: string, model: GameModelProjection | undefined): number[] {
    return suggestedPaytableValues(paytableRowForPath(model, path)?.payout);
}

export function formatTunableValues(values: readonly (number | string)[]): string {
    return values.join(", ");
}

export function parseTunableValues(text: string): {values?: number[]; error?: string} {
    const tokens = text.split(/[\s,]+/).filter((token) => token.length > 0);
    if (tokens.length === 0) return {error: "Enter at least one candidate value."};
    if (tokens.length > 10_000) return {error: "Keep the candidate list to 10,000 values or fewer."};
    const values: number[] = [];
    for (const token of tokens) {
        const value = Number(token);
        if (!Number.isFinite(value)) return {error: `"${token}" is not a finite number.`};
        if (!values.includes(value)) values.push(value);
    }
    return {values};
}

export function optimizationDomainSize(policy: OptimizationPolicy): number {
    let size = 1;
    for (const tunable of policy.tunables) {
        size *= tunable.values.length;
        if (!Number.isSafeInteger(size)) return Number.MAX_SAFE_INTEGER;
    }
    return size;
}

function defaultMode(model: GameModelProjection | undefined): string {
    if (model?.betsAndModes.status === "available" && model.betsAndModes.data.betModes.length > 0) {
        const modes = model.betsAndModes.data.betModes;
        return (modes.find((mode) => mode.isDefault) ?? modes[0]).id;
    }
    return "base";
}

export function buildDefaultOptimizationRequest(model?: GameModelProjection): StudioOptimizationRequest {
    const first = paytableRows(model)[0];
    const path = first === undefined ? "/paytable/A/3" : paytablePath(first);
    const values = suggestedPaytableValues(first?.payout);
    return {
        targets: [defaultTargetForMetric(OPTIMIZATION_METRICS[0])],
        policy: {
            strategy: "exact-finite-v1",
            seed: "optimization-1",
            budget: values.length,
            maxOutcomes: 100_000,
            mode: defaultMode(model),
            stake: 1,
            scope: "paid-entry",
            tunables: [{path, values}],
            locks: [],
        },
    };
}
