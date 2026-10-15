import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import {analyticsEnvelope, type FeatureAnalyticsObservation} from "./FeatureAnalytics.js";
/** Artifacts flatten their steps. Read that one level; events alone cannot prove lifecycle. */
export function artifactAnalyticsObservation(artifact: RoundArtifact, modelId: string): FeatureAnalyticsObservation {
    return {
        envelope: analyticsEnvelope(modelId, false, true),
        source: "outcome-library",
        logicalEntry: false,
        logicalCompletion: false,
        carriedSubround: false,
        cascadeSteps: 0,
        mode: artifact.betMode,
        features: [],
        components: artifact.wins.map((c) => ({
            type: c.type,
            id: c.id,
            symbol: c.symbolId === null ? null : String(c.symbolId),
            amount: c.winAmount,
            partition: c.type === "jackpot" ? "jackpot" : "unavailable",
        })),
    };
}
