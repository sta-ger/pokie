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

export type PublicRoundArtifact<T extends string | number = string> = Pick<RoundArtifact<T>, "roundId" | "stake" | "betMode" | "totalWin" | "payoutMultiplier" | "screen" | "featureEvents"> & {
    readonly steps: readonly PublicRoundStep<T>[];
    readonly wins: readonly RoundArtifactWin<T>[];
};
export type PublicRoundStep<T extends string | number = string> = Pick<RoundStepArtifact<T>, "index" | "screen" | "totalWin" | "wins" | "featureEvents"> & {readonly visibleRowCoverage?: readonly number[]};

/** Presentation only. Canonical artifacts and their hashes keep all generated/evaluated evidence. */
export class PublicRoundArtifactProjector<T extends string | number = string> implements RoundArtifactProjector<T, PublicRoundArtifact<T>> {
    public project(artifact: RoundArtifact<T>): PublicRoundArtifact<T> {
        if (artifact.geometry || artifact.steps.some(step => step.geometry)) {
            const issues = new RoundArtifactValidator<T>().validate(artifact);
            if (issues.length) throw new Error(issues.map(issue => issue.message).join("; "));
        }
        const steps = artifact.steps.map(projectPublicRoundStep);
        const result = {roundId: artifact.roundId, stake: artifact.stake, betMode: artifact.betMode, totalWin: artifact.totalWin,
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
        const publicWin = {type: win.type, id: win.id, symbolId: (win.symbolId ?? null) as T, winAmount: win.winAmount, winningPositions: win.winningPositions,
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
    return deepFreeze(toCanonicalJson({index: step.index, screen: step.screen, totalWin: step.totalWin, wins,
        ...(step.featureEvents ? {featureEvents: step.featureEvents.map(projectPublicFeatureEvent)} : {}),
        ...(projection ? {visibleRowCoverage: projection.getVisibleCoverage()} : {})}) as unknown as PublicRoundStep<T>);
}

/** Generic public event markers expose type and supported counters, never arbitrary audit data. */
export function projectPublicFeatureEvent(event: RoundArtifactFeatureEvent): RoundArtifactFeatureEvent {
    const count = event.data?.count;
    return {type: event.type, ...(typeof count === "number" && Number.isFinite(count) && count >= 0 ? {data: {count}} : {})};
}
