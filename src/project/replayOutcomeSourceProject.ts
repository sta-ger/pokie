import {PreGeneratedRoundReplayer} from "../pregenerated/PreGeneratedRoundReplayer.js";
import type {PreGeneratedRoundReplayDescriptor} from "../pregenerated/PreGeneratedRoundReplayDescriptor.js";
import {ReplayRecorder} from "../replay/ReplayRecorder.js";
import type {ReplayDescriptor} from "../replay/ReplayDescriptor.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import {computeWeightedOutcomeLibraryHash} from "../weightedoutcome/computeWeightedOutcomeLibraryHash.js";
import {OUTCOME_SOURCE_REPLAY_OPERATION} from "./PokieOperation.js";
import type {PokieProject} from "./PokieProject.js";
import type {UnsupportedProjectOperationDiagnostic} from "./UnsupportedProjectOperationDiagnostic.js";
import {describeUnsupportedProjectOperation} from "./describeUnsupportedProjectOperation.js";

export type OutcomeSourceReplayResult =
    | {readonly supported: true; readonly replay: PreGeneratedRoundReplayDescriptor; readonly descriptor: ReplayDescriptor}
    | {readonly supported: false; readonly diagnostic: UnsupportedProjectOperationDiagnostic};

// Reproduces exactly which outcome a resolved "outcomeLibrary" project's own (seed, round) drew, via
// PreGeneratedRoundReplayer -- the same deterministic reconstruction PokieDevServer's own pre-generated
// session route agrees with (see PokieDevServerPreGenerated.test.ts's "agrees with PreGeneratedRoundReplayer's
// pure reconstruction" case), never a freshly regenerated game-model replay (ReplayRecorder/loadPokieGame).
// Loads the mode's full WeightedOutcomeLibrary (via OutcomeLibraryBundleReading.readLibrary) since
// PreGeneratedRoundReplayer's own deterministic selection needs the whole weighted set in memory to walk, unlike
// sampleOutcomeSourceProject's single-index-read draw. Any project lacking OUTCOME_SOURCE_SAMPLE_CAPABILITY -- a
// "stakeAdapter" export has no draw contract, see that capability's own doc comment -- returns the ordinary
// capability diagnostic instead of throwing, same as sampleOutcomeSourceProject, and never reads a bundle at all.
export async function replayOutcomeSourceProject(
    project: PokieProject,
    modeName: string,
    seed: string,
    round: number,
    recorded?: PreGeneratedRoundReplayDescriptor,
): Promise<OutcomeSourceReplayResult> {
    const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_SOURCE_REPLAY_OPERATION);
    if (diagnostic !== undefined) {
        return {supported: false, diagnostic};
    }

    if (typeof seed !== "string" || seed.trim().length === 0) {
        throw new Error("Cannot exactly replay an outcome-library round without a non-empty seed. Restore the original session seed and retry.");
    }
    if (typeof modeName !== "string" || modeName.trim().length === 0) {
        throw new Error("Cannot exactly replay an outcome-library round without a mode. Open the original bundle and use its recorded mode.");
    }
    if (!Number.isInteger(round) || round < 1) {
        throw new Error(`Cannot exactly replay outcome-library round ${round}; round must be a positive integer.`);
    }

    const reader = new OutcomeLibraryBundleReader();
    const library = await reader.readLibrary(project.rootPath, modeName);
    const libraryHash = computeWeightedOutcomeLibraryHash(library);
    if (recorded !== undefined) {
        const mismatches = [
            ["library id", recorded.libraryId, library.libraryId],
            ["library hash", recorded.libraryHash, libraryHash],
            ["mode", recorded.modeName, modeName],
            ["seed", recorded.seed, seed],
            ["round", String(recorded.round), String(round)],
        ].filter(([, recordedValue, currentValue]) => recordedValue !== currentValue);
        if (mismatches.length > 0) {
            throw new Error(
                `Replay provenance does not match the current input (${mismatches.map(([field, oldValue, currentValue]) => `${field}: recorded "${oldValue}", current "${currentValue}"`).join("; ")}). ` +
                    "Restore/open the original game and outcome-library artifact before requesting exact replay.",
            );
        }
    }
    const replay = new PreGeneratedRoundReplayer().replay({library, libraryHash, modeName, seed, round});
    const outcome = library.outcomes.find((candidate) => candidate.id === replay.outcomeId);
    if (outcome === undefined) {
        throw new Error(`Replayed outcome "${replay.outcomeId}" was not present in outcome library "${replay.libraryId}".`);
    }
    if (recorded !== undefined && (recorded.outcomeId !== replay.outcomeId || recorded.totalWin !== replay.totalWin)) {
        throw new Error(
            `Replay result does not match the recorded artifact (recorded outcome "${recorded.outcomeId}"/win ${recorded.totalWin}, current outcome "${replay.outcomeId}"/win ${replay.totalWin}). Restore the recorded bundle before exact replay.`,
        );
    }
    const manifest = await reader.readManifest(project.rootPath);
    // This is intentionally a descriptor record, not a second selection: PreGeneratedRoundReplayer above
    // is the only selector invocation, and ReplayRecorder merely normalizes that settled provenance for
    // the canonical replay product surface.
    const descriptor = new ReplayRecorder().recordPreGenerated({
        sessionId: `outcome-source:${replay.libraryId}:${seed}:${round}`,
        game: manifest.game,
        replay,
        totalBet: outcome.artifact.stake,
        screen: outcome.artifact.screen.map((row) => [...row]),
    });
    return {supported: true, replay, descriptor};
}
