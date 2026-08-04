import type {PreGeneratedOutcomeSelection} from "../pregenerated/PreGeneratedOutcomeSelection.js";
import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import {OutcomeLibraryBundleOutcomeSource} from "../weightedoutcome/bundle/OutcomeLibraryBundleOutcomeSource.js";
import {OUTCOME_SOURCE_SAMPLE_OPERATION} from "./PokieOperation.js";
import type {PokieProject} from "./PokieProject.js";
import type {UnsupportedProjectOperationDiagnostic} from "./UnsupportedProjectOperationDiagnostic.js";
import {describeUnsupportedProjectOperation} from "./describeUnsupportedProjectOperation.js";

export type OutcomeSourceSampleResult<T extends string | number = string> =
    | {readonly supported: true; readonly selection: PreGeneratedOutcomeSelection<T>}
    | {readonly supported: false; readonly diagnostic: UnsupportedProjectOperationDiagnostic};

// Draws exactly one outcome from a resolved "outcomeLibrary" project's own mode, through the same
// selector/session/server path PreGeneratedSpinCommandHandler/PreGeneratedRoundReplayer already use --
// OutcomeLibraryBundleOutcomeSource itself wraps WeightedOutcomeSelector's own cumulative-weight walk over the
// mode's own index -- never a freshly regenerated game-model draw (see CanonicalOutcomeSourceDescriptor's own
// doc comment on OUTCOME_SOURCE_SAMPLE_CAPABILITY for why). Any project lacking that capability -- a
// "stakeAdapter" export has no PreGeneratedOutcomeSourcing-style draw contract, see that capability's own doc
// comment -- returns the ordinary capability diagnostic instead of throwing, since "this project simply can't
// be sampled" is an expected, honest outcome here, not a bug.
export async function sampleOutcomeSourceProject<T extends string | number = string>(
    project: PokieProject,
    modeName: string,
    randomSource: WeightedOutcomeRandomSource,
): Promise<OutcomeSourceSampleResult<T>> {
    const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_SOURCE_SAMPLE_OPERATION);
    if (diagnostic !== undefined) {
        return {supported: false, diagnostic};
    }

    const outcomeSource = new OutcomeLibraryBundleOutcomeSource<T>(project.rootPath, modeName);
    const selection = await outcomeSource.drawOutcome(randomSource);
    return {supported: true, selection};
}
