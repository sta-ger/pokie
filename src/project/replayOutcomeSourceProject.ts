import {PreGeneratedRoundReplayer} from "../pregenerated/PreGeneratedRoundReplayer.js";
import type {PreGeneratedRoundReplayDescriptor} from "../pregenerated/PreGeneratedRoundReplayDescriptor.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import {computeWeightedOutcomeLibraryHash} from "../weightedoutcome/computeWeightedOutcomeLibraryHash.js";
import {OUTCOME_SOURCE_REPLAY_OPERATION} from "./PokieOperation.js";
import type {PokieProject} from "./PokieProject.js";
import type {UnsupportedProjectOperationDiagnostic} from "./UnsupportedProjectOperationDiagnostic.js";
import {describeUnsupportedProjectOperation} from "./describeUnsupportedProjectOperation.js";

export type OutcomeSourceReplayResult =
    | {readonly supported: true; readonly replay: PreGeneratedRoundReplayDescriptor}
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
): Promise<OutcomeSourceReplayResult> {
    const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_SOURCE_REPLAY_OPERATION);
    if (diagnostic !== undefined) {
        return {supported: false, diagnostic};
    }

    const library = await new OutcomeLibraryBundleReader().readLibrary(project.rootPath, modeName);
    const libraryHash = computeWeightedOutcomeLibraryHash(library);
    const replay = new PreGeneratedRoundReplayer().replay({library, libraryHash, seed, round});
    return {supported: true, replay};
}
