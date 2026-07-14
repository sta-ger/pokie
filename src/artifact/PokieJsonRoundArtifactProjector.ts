import {computeRoundArtifactHash} from "./computeRoundArtifactHash.js";
import type {RoundArtifact} from "./RoundArtifact.js";
import type {RoundArtifactFeatureEvent} from "./RoundArtifactFeatureEvent.js";
import type {RoundArtifactJson} from "./RoundArtifactJson.js";
import type {RoundArtifactProjector} from "./RoundArtifactProjector.js";
import type {RoundArtifactProvenance} from "./RoundArtifactProvenance.js";
import type {RoundArtifactWin} from "./RoundArtifactWin.js";
import type {RoundStepArtifact} from "./RoundStepArtifact.js";

// The standard POKIE projector: turns a RoundArtifact into a plain, JSON-safe object with a fixed field order
// (independent of whatever order the source RoundArtifact happened to be built/passed in) and stamps it with
// its own content hash (see computeRoundArtifactHash — hashed over the *input* artifact, so the hash is exactly
// what any other projection of the same content would also produce).
export class PokieJsonRoundArtifactProjector<T extends string | number | symbol = string>
implements RoundArtifactProjector<T, RoundArtifactJson<T>> {
    public project(artifact: RoundArtifact<T>): RoundArtifactJson<T> {
        return {
            schemaVersion: artifact.schemaVersion,
            roundId: artifact.roundId,
            provenance: projectProvenance(artifact.provenance),
            betMode: artifact.betMode,
            stake: artifact.stake,
            totalWin: artifact.totalWin,
            payoutMultiplier: artifact.payoutMultiplier,
            screen: artifact.screen.map((reel) => [...reel]),
            steps: artifact.steps.map((step) => projectStep(step)),
            wins: artifact.wins.map((win) => projectWin(win)),
            ...(artifact.featureEvents !== undefined ? {featureEvents: projectFeatureEvents(artifact.featureEvents)} : {}),
            ...(artifact.debug !== undefined ? {debug: {...artifact.debug}} : {}),
            hash: computeRoundArtifactHash(artifact),
        };
    }
}

function projectProvenance(provenance: RoundArtifactProvenance): RoundArtifactProvenance {
    return {
        game: {...provenance.game},
        pokieVersion: provenance.pokieVersion,
        ...(provenance.configHash !== undefined ? {configHash: provenance.configHash} : {}),
    };
}

function projectStep<T extends string | number | symbol>(step: RoundStepArtifact<T>): RoundStepArtifact<T> {
    return {
        index: step.index,
        screen: step.screen.map((reel) => [...reel]),
        totalWin: step.totalWin,
        wins: step.wins.map((win) => projectWin(win)),
        ...(step.featureEvents !== undefined ? {featureEvents: projectFeatureEvents(step.featureEvents)} : {}),
        ...(step.debug !== undefined ? {debug: {...step.debug}} : {}),
    };
}

function projectWin<T extends string | number | symbol>(win: RoundArtifactWin<T>): RoundArtifactWin<T> {
    return {
        type: win.type,
        id: win.id,
        symbolId: win.symbolId,
        winAmount: win.winAmount,
        winningPositions: win.winningPositions.map((position) => [...position]),
        multiplierBreakdown: win.multiplierBreakdown.map((breakdown) => ({
            ...breakdown,
            positions: breakdown.positions.map((position) => [...position]),
            values: [...breakdown.values],
        })),
        metadata: {...win.metadata},
    };
}

function projectFeatureEvents(events: RoundArtifactFeatureEvent[]): RoundArtifactFeatureEvent[] {
    return events.map((event) => ({...event, ...(event.data !== undefined ? {data: {...event.data}} : {})}));
}
