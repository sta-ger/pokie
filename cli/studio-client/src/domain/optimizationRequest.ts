import {formatAnalysisNumber} from "../../../../src/internal/formatAnalysisNumber";
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
    {metric: "volatility", unit: "standardDeviation", label: "Volatility (std. deviation, bet units)", scale: 1, valueSuffix: "", toleranceSuffix: "", defaultValue: 3, defaultTolerance: 0.1, step: 0.01},
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

// Format a ratio/standard-deviation/bet-multiple in the same unit the compact form edits. Unknown
// metrics keep their raw value rather than being silently multiplied by an unrelated scale.
export function formatOptimizationMetricValue(target: OptimizationTarget, value: number, digits = 4): string {
    const option = findOptimizationMetric(target);
    if (option === undefined) return formatAnalysisNumber(value, digits);
    return `${formatAnalysisNumber(value * option.scale, digits)}${option.valueSuffix}`;
}

export function formatOptimizationTolerance(target: OptimizationTarget, value: number, digits = 4): string {
    const option = findOptimizationMetric(target);
    if (option === undefined) return formatAnalysisNumber(value, digits);
    return `${formatAnalysisNumber(value * option.scale, digits)}${option.toleranceSuffix}`;
}

/** A distance below the displayed precision is zero, not scientific notation in a human sentence. */
export function formatOptimizationDistance(target: OptimizationTarget, distance: number, digits = 4): string {
    return formatOptimizationMetricValue(target, Math.abs(distance) < 1e-9 ? 0 : distance, digits);
}

export type OptimizationEvaluationLike = {
    readonly measured?: readonly (number | string)[];
    readonly parameters?: Readonly<Record<string, unknown>>;
};

/** The evaluated candidate closest to the first target's requested value, if any candidate was measured. */
export function nearestOptimizationCandidate<T extends OptimizationEvaluationLike>(
    target: OptimizationTarget,
    evaluations: readonly T[],
): {readonly evaluation: T; readonly index: number; readonly measured: number; readonly distance: number} | undefined {
    let best: {evaluation: T; index: number; measured: number; distance: number} | undefined;
    evaluations.forEach((evaluation, index) => {
        const raw = evaluation.measured?.[0];
        let measured = Number.NaN;
        if (typeof raw === "number") measured = raw;
        else if (typeof raw === "string") measured = Number(raw);
        if (!Number.isFinite(measured)) return;
        const distance = Math.abs(measured - target.value);
        if (best === undefined || distance < best.distance) best = {evaluation, index, measured, distance};
    });
    return best;
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

export function freeGamesAwardPath(count: number | string): string {
    return `/mechanics/freeGames/awardsByCount/${escapePointerToken(String(count))}`;
}

export function parseFreeGamesAwardPath(path: string): string | undefined {
    const parts = path.split("/");
    if (parts.length !== 5 || parts[0] !== "" || parts[1] !== "mechanics" || parts[2] !== "freeGames" || parts[3] !== "awardsByCount") return undefined;
    return unescapePointerToken(parts[4]);
}

export function freeGamesAwards(model: GameModelProjection | undefined): {count: string; current: number}[] {
    if (model?.mechanics.status !== "available") return [];
    const awards = model.mechanics.data.freeGames?.awardsByCount;
    if (awards === undefined) return [];
    return Object.entries(awards)
        .map(([count, current]) => ({count, current}))
        .sort((left, right) => Number(left.count) - Number(right.count) || left.count.localeCompare(right.count));
}

export function hasFreeGames(model: GameModelProjection | undefined): boolean {
    return freeGamesAwards(model).length > 0;
}

/** Every numeric authored field the compact Studio form can offer without a JSON pointer. */
export function optimizationTunablePaths(model: GameModelProjection | undefined): string[] {
    return [
        ...paytableRows(model).map(paytablePath),
        ...freeGamesAwards(model).map((award) => freeGamesAwardPath(award.count)),
    ];
}

export function tunableCurrentValue(path: string, model: GameModelProjection | undefined): number | undefined {
    const freeGamesCount = parseFreeGamesAwardPath(path);
    if (freeGamesCount !== undefined) {
        return freeGamesAwards(model).find((award) => award.count === freeGamesCount)?.current;
    }
    return paytableRowForPath(model, path)?.payout;
}

export function optimizationScopeLabel(scope: OptimizationPolicy["scope"]): string {
    if (scope === "logical-round") return "Whole paid round (incl. free games)";
    if (scope === "native-outcomes") return "Native outcomes";
    return "Paid spin";
}

/**
 * A design with free games has two legitimate RTP readings. A request that still targets paid-entry
 * RTP after a feature was added is valid, but it is almost never the number a producer means by
 * "the game's RTP" -- recommend the whole-round scope instead of silently keeping the stale choice.
 */
export function recommendsWholeRoundScope(
    scope: OptimizationPolicy["scope"],
    freeGamesConfigured: boolean,
): boolean {
    return freeGamesConfigured && scope === "paid-entry";
}

export function optimizationTargetLabel(target: OptimizationTarget, scope: OptimizationPolicy["scope"]): string {
    const option = findOptimizationMetric(target);
    if (target.metric === "rtp") {
        if (scope === "logical-round") return "Total RTP (paid + free games)";
        if (scope === "native-outcomes") return "RTP (native outcomes)";
        return "Paid-spin RTP";
    }
    return option?.label ?? target.metric;
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
    if (parsed !== undefined) return `${parsed.symbolId}, ${parsed.matchCount} symbols payout`;
    const freeGamesCount = parseFreeGamesAwardPath(path);
    if (freeGamesCount !== undefined) return `${freeGamesCount} scatters → free games`;
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
    return suggestedPaytableValues(tunableCurrentValue(path, model));
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
            // Free games make paid-spin and whole-round RTP different numbers. Default to the number
            // a player experiences; the compact form still exposes the paid-spin scope explicitly.
            scope: hasFreeGames(model) ? "logical-round" : "paid-entry",
            tunables: [{path, values}],
            locks: [],
        },
    };
}
