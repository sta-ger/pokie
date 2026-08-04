import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import {SimulationAccumulator} from "../simulation/SimulationAccumulator.js";
import type {SimulationStatistics} from "../simulation/SimulationStatistics.js";
import {OutcomeLibraryBundleOutcomeSource} from "../weightedoutcome/bundle/OutcomeLibraryBundleOutcomeSource.js";
import {OUTCOME_SOURCE_SIMULATE_OPERATION} from "./PokieOperation.js";
import type {PokieProject} from "./PokieProject.js";
import type {UnsupportedProjectOperationDiagnostic} from "./UnsupportedProjectOperationDiagnostic.js";
import {describeUnsupportedProjectOperation} from "./describeUnsupportedProjectOperation.js";

// What simulateOutcomeSourceProject reports: the same rounds/hitCount/rtp/maxWin/... a "pokie sim" run against a
// loadable game package reports (see SimulationAccumulator.getStatistics), plus the drawn library's own identity
// -- never a PokieGameManifest, since a resolved "outcomeLibrary" project has no loadable game behind it to ask
// for one (see this module's own doc comment on why sampling never touches loadPokieGame).
export type OutcomeSourceSimulationReport = {
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly modeName: string;
    readonly requestedRounds: number;
    readonly seed?: string;
    readonly durationMs: number;
    readonly statistics: SimulationStatistics;
};

export type OutcomeSourceSimulationResult =
    | {readonly supported: true; readonly report: OutcomeSourceSimulationReport}
    | {readonly supported: false; readonly diagnostic: UnsupportedProjectOperationDiagnostic};

// Runs a real sampling simulation against a resolved "outcomeLibrary" project's own mode: `rounds` independent
// draws through OutcomeLibraryBundleOutcomeSource -- the exact same selector/session path
// PreGeneratedSpinCommandHandler/sampleOutcomeSourceProject already draw through -- accumulated into ordinary
// SimulationAccumulator statistics, never a freshly regenerated game-model simulation (ParallelSimulationRunner/
// loadPokieGame). Each draw's own artifact.stake/artifact.totalWin feeds the accumulator exactly the way
// AggregateSimulationRunner.run() feeds its own nominalBet/payout per round. Any project lacking
// OUTCOME_SOURCE_SAMPLE_CAPABILITY -- a "stakeAdapter" export has no draw contract, see that capability's own doc
// comment -- returns the ordinary capability diagnostic instead of throwing or drawing anything, same as
// sampleOutcomeSourceProject/replayOutcomeSourceProject.
export async function simulateOutcomeSourceProject(
    project: PokieProject,
    modeName: string,
    rounds: number,
    randomSource: WeightedOutcomeRandomSource,
    seed?: string,
): Promise<OutcomeSourceSimulationResult> {
    const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_SOURCE_SIMULATE_OPERATION);
    if (diagnostic !== undefined) {
        return {supported: false, diagnostic};
    }

    const outcomeSource = new OutcomeLibraryBundleOutcomeSource(project.rootPath, modeName);
    const accumulator = new SimulationAccumulator();
    let libraryId = "";
    let libraryHash = "";
    const startedAt = Date.now();
    for (let round = 0; round < rounds; round++) {
        const selection = await outcomeSource.drawOutcome(randomSource);
        libraryId = selection.libraryId;
        libraryHash = selection.libraryHash;
        accumulator.addRound(selection.outcome.artifact.stake, selection.outcome.artifact.totalWin);
    }

    return {
        supported: true,
        report: {
            libraryId,
            libraryHash,
            modeName,
            requestedRounds: rounds,
            seed,
            durationMs: Date.now() - startedAt,
            statistics: accumulator.getStatistics(),
        },
    };
}
