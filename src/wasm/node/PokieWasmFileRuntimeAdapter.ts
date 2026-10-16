import {buildLogicalRoundArtifact} from "../../artifact/buildLogicalRoundArtifact.js";
import {PokieJsonRoundArtifactProjector} from "../../artifact/PokieJsonRoundArtifactProjector.js";
import fs from "fs";
import {ProjectTargetResolver} from "../../project/ProjectTargetResolver.js";
import {readWasmComponentManifest} from "../../project/readWasmComponentManifest.js";
import {instantiatePokieWasm} from "../PokieWasmRuntime.js";
import type {PokieWasmHost, PokieWasmRuntime} from "../PokieWasmRuntimeApi.js";

/** Node-only file adapter; portable WASM runtime modules never import this. */
export async function loadPokieWasmFileRuntime(filePath: string, host: PokieWasmHost): Promise<PokieWasmRuntime> {
    const project = await new ProjectTargetResolver().resolve(filePath);
    if (project?.type !== "wasm") throw new Error(`"${filePath}" is not a recognized POKIE WASM artifact.`);
    const manifestRead = await readWasmComponentManifest(project);
    if (!manifestRead.supported || manifestRead.manifest.artifact === undefined) {
        throw new Error("This WASM component is inspection-only and cannot be loaded as a canonical POKIE runtime.");
    }
    return instantiatePokieWasm(new Uint8Array(await fs.promises.readFile(project.rootPath)), manifestRead.manifest, host);
}

/** Project retained observations; never execute, infer wins or manufacture feature evidence. */
export function projectPokieWasmRoundArtifact(
    round: import("../PokieWasmRuntimeApi.js").PokieWasmRound,
    provenance: import("../../artifact/RoundArtifact.js").RoundArtifact["provenance"],
    fallbackRoundId: string,
    declaredCapabilities?: readonly string[],
): import("../../artifact/RoundArtifactJson.js").RoundArtifactJson {
    const logical = round.logicalRound;
    const last = logical?.subrounds[logical.subrounds.length - 1];
    const steps = last?.artifacts;
    if (logical && last && steps?.length) {
        let artifact: import("../../artifact/RoundArtifact.js").RoundArtifact = {
            schemaVersion: 1, roundId: logical.id, provenance, betMode: logical.mode ?? "base", stake: last.stake, totalWin: last.win,
            payoutMultiplier: last.stake > 0 ? last.win / last.stake : 0, screen: steps[steps.length - 1].screen,
            steps: [...steps], wins: steps.flatMap(step => step.wins), featureEvents: steps.flatMap(step => step.featureEvents ?? []),
            ...(steps[steps.length - 1].sequenceSelections ? {sequenceSelections: steps[steps.length - 1].sequenceSelections} : {}),
            ...(steps[steps.length - 1].geometry ? {geometry: steps[steps.length - 1].geometry, generatedScreen: steps[steps.length - 1].generatedScreen} : {}),
        };
        const subrounds = new Map<number, import("../../runtime/LogicalRound.js").LogicalSubround>();
        for (const delivery of round.deliveries ?? [round]) for (const subround of delivery.logicalRound?.subrounds ?? []) subrounds.set(subround.index, subround);
        if (logical.status === "completed" && subrounds.size === logical.cursor && subrounds.has(0)) artifact = buildLogicalRoundArtifact({...logical, subrounds: [...subrounds.values()]}, artifact);
        return new PokieJsonRoundArtifactProjector().project(artifact);
    }
    const detailBoundary = "The portable runtime settles total payout but does not expose per-win or feature-event details.";
    return new PokieJsonRoundArtifactProjector().project({schemaVersion: 1, roundId: fallbackRoundId, provenance, betMode: "wasm", stake: round.stake,
        totalWin: round.payout, payoutMultiplier: round.stake > 0 ? round.payout / round.stake : 0, screen: round.screen.map(reel => [...reel]),
        steps: [{index: 0, screen: round.screen.map(reel => [...reel]), totalWin: round.payout, wins: [], debug: {reelStops: [...round.stops], detailBoundary}}],
        wins: [], debug: {reelStops: [...round.stops], ...(declaredCapabilities ? {declaredCapabilities: [...declaredCapabilities]} : {}), detailBoundary}});
}
