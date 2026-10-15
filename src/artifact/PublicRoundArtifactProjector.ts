import type {JsonObject, JsonValue} from "../json/JsonValue.js";
import type {RoundArtifactFeatureEvent} from "./RoundArtifactFeatureEvent.js";
import {RoundArtifactValidator} from "./RoundArtifactValidator.js";
import type {RoundArtifactProjector} from "./RoundArtifactProjector.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import {projectVisiblePayline, projectVisiblePositions} from "../session/videoslot/coordinates/projectVisibleWinData.js";
import type {RoundArtifact} from "./RoundArtifact.js";
import type {RoundArtifactWin} from "./RoundArtifactWin.js";
import type {RoundStepArtifact} from "./RoundStepArtifact.js";
import {validateArtifactCoordinates} from "./validateArtifactCoordinates.js";

export type PublicRoundArtifact<T extends string | number = string> = Pick<RoundArtifact<T>, "roundId" | "stake" | "betMode" | "totalWin" | "payoutMultiplier" | "screen" | "sequenceSelections" | "featureEvents"> & {
    readonly steps: readonly PublicRoundStep<T>[];
    readonly wins: readonly RoundArtifactWin<T>[];
};
export type PublicRoundStep<T extends string | number = string> = Pick<RoundStepArtifact<T>, "index" | "screen" | "totalWin" | "wins" | "featureEvents"> & {readonly visibleRowCoverage?: readonly number[]};

/** Presentation only. Canonical artifacts and their hashes keep all generated/evaluated evidence. */
export class PublicRoundArtifactProjector<T extends string | number = string> implements RoundArtifactProjector<T, PublicRoundArtifact<T>> {
    public project(artifact: RoundArtifact<T>): PublicRoundArtifact<T> {
        if (artifact.sequenceSelections || artifact.geometry || artifact.steps.some(step => step.geometry)) {
            const issues = new RoundArtifactValidator<T>().validate(artifact);
            if (issues.length) throw new Error(issues.map(issue => issue.message).join("; "));
        }
        const steps = artifact.steps.map(projectPublicRoundStep);
        const result = {...(artifact.sequenceSelections ? {sequenceSelections: artifact.sequenceSelections} : {}), roundId: artifact.roundId, stake: artifact.stake, betMode: artifact.betMode, totalWin: artifact.totalWin,
            payoutMultiplier: artifact.payoutMultiplier, screen: artifact.screen, steps, wins: steps.flatMap(step => step.wins),
            ...(artifact.featureEvents ? {featureEvents: artifact.featureEvents.map(projectPublicFeatureEvent)} : {})};
        return deepFreeze(toCanonicalJson(result) as unknown as PublicRoundArtifact<T>);
    }
}

export function projectPublicRoundStep<T extends string | number>(step: RoundStepArtifact<T>): PublicRoundStep<T> {
    validateArtifactCoordinates(step);
    const projection = step.geometry ? new ScreenProjection(step.geometry) : undefined;
    const wins = step.wins.map(win => {
        const metadata = Object.fromEntries(Object.entries(win.metadata).filter(([key]) => ["definition", "symbolsPositions", "wildSymbolsPositions", "lineId", "count", "pattern", "poolId", "stakeEngineImportSynthetic"].includes(key)));
        const publicWin = {type: win.type, id: win.id, symbolId: win.symbolId ?? null, winAmount: win.winAmount, winningPositions: win.winningPositions,
            multiplierBreakdown: win.multiplierBreakdown.map(item => ({source: item.source, positions: item.positions, values: item.values, combinedMultiplier: item.combinedMultiplier})), metadata};
        if (!projection) return publicWin;
        if (win.type === "line" && Array.isArray(metadata.definition)) {
            const definition = projectVisiblePayline(metadata.definition as number[], projection);
            if (definition) metadata.definition = definition;
            else {
                Reflect.deleteProperty(metadata, "definition");
            }
        }
        if (win.type !== "line" && Array.isArray(metadata.symbolsPositions)) {
            metadata.symbolsPositions = projectVisiblePositions(metadata.symbolsPositions as number[][], projection);
        }
        return {...publicWin, metadata, winningPositions: projectVisiblePositions(win.winningPositions, projection),
            multiplierBreakdown: publicWin.multiplierBreakdown.map(item => ({...item, positions: projectVisiblePositions(item.positions, projection)}))};
    });
    return deepFreeze(toCanonicalJson({...(step.sequenceSelections ? {sequenceSelections: step.sequenceSelections} : {}), index: step.index, screen: step.screen, totalWin: step.totalWin, wins,
        ...(step.featureEvents ? {featureEvents: step.featureEvents.map(projectPublicFeatureEvent)} : {}),
        ...(projection ? {visibleRowCoverage: projection.getVisibleCoverage()} : {})}) as unknown as PublicRoundStep<T>);
}

/** Public mechanic observations are an explicit allowlist, including nested fields. */
export function projectPublicFeatureEvent(event: RoundArtifactFeatureEvent): RoundArtifactFeatureEvent {
    const source = event.data ?? {};
    const data: Record<string, JsonValue> = {};
    const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
    if (finite(source.count)) data.count = source.count;
    if (event.type === "screenModifiers") {
        if (source.space === "evaluated") data.space = source.space;
        const position = (value: JsonValue | undefined): value is number[] => Array.isArray(value) && value.length === 2 && value.every(n => finite(n) && Number.isSafeInteger(n));
        if (Array.isArray(source.rules)) data.rules = source.rules.flatMap(rule => isJsonObject(rule) && typeof rule.id === "string" && Array.isArray(rule.positions) ? [{id: rule.id, positions: rule.positions.filter(position).map(p => [...p])}] : []);
        if (Array.isArray(source.sticky)) data.sticky = source.sticky.flatMap(cell => isJsonObject(cell) && typeof cell.ruleId === "string" && position(cell.position) && (typeof cell.symbol === "string" || finite(cell.symbol)) && finite(cell.factor) && finite(cell.remaining) && Number.isSafeInteger(cell.remaining) ? [{ruleId: cell.ruleId, position: [...cell.position], symbol: cell.symbol, factor: cell.factor, remaining: cell.remaining}] : []);
    }
    if (event.type === "chargedBetMode" && typeof source.id === "string") data.id = source.id;
    if (event.type === "holdAndWin") {
        if (typeof source.active === "boolean") data.active = source.active;
        for (const key of ["respinsRemaining", "payout"]) if (finite(source[key])) data[key] = source[key];
        if (Array.isArray(source.locks)) data.locks = source.locks.flatMap(raw => {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
            const {position, symbolId, effect} = raw;
            if (!Array.isArray(position) || position.length !== 2 || !position.every(n => finite(n) && Number.isSafeInteger(n)) ||
                (typeof symbolId !== "string" && typeof symbolId !== "number") || !effect || typeof effect !== "object" || Array.isArray(effect)) return [];
            let publicEffect: JsonObject | undefined;
            if (effect.kind === "value" && finite(effect.amount)) publicEffect = {kind: "value", amount: effect.amount};
            if (effect.kind === "multiplier" && finite(effect.factor)) publicEffect = {kind: "multiplier", factor: effect.factor};
            return publicEffect ? [{position: [...position], symbolId, effect: publicEffect}] : [];
        });
    }
    if (event.type === "jackpot") {
        if (Array.isArray(source.pools)) data.pools = source.pools.flatMap(pool => pool && typeof pool === "object" && !Array.isArray(pool) && typeof pool.id === "string" && finite(pool.value) ? [{id: pool.id, value: pool.value}] : []);
        const award = source.award;
        if (isJsonObject(award) && typeof award.poolId === "string" && finite(award.amount)) data.award = {poolId: award.poolId, amount: award.amount};
        const statistics = source.statistics;
        if (isJsonObject(statistics)) data.statistics = Object.fromEntries(Object.entries(statistics).flatMap(([id, stats]) => {
            if (!isJsonObject(stats) || !finite(stats.awardCount) || !finite(stats.totalAwarded) || !finite(stats.totalContributed)) return [];
            return [[id, {awardCount: stats.awardCount, totalAwarded: stats.totalAwarded, totalContributed: stats.totalContributed}]];
        }));
    }
    return {type: event.type, ...(Object.keys(data).length ? {data} : {})};
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
