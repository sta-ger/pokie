import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import {deriveDeterministicSeed} from "../pregenerated/internal/deriveDeterministicSeed.js";
import {SeededWeightedOutcomeRandomSource} from "../pregenerated/SeededWeightedOutcomeRandomSource.js";
import type {PreGeneratedRoundReplayDescriptor} from "../pregenerated/PreGeneratedRoundReplayDescriptor.js";
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
    // The last real sampled round makes a seeded simulation directly replayable, without exposing
    // its nondeterministic report duration as part of the comparison contract.
    readonly lastReplay?: PreGeneratedRoundReplayDescriptor;
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
    if (seed !== undefined && seed.trim().length === 0) {
        throw new Error("Cannot exactly simulate an outcome-library round with a blank seed. Provide a non-empty seed, or omit it for a best-effort secure simulation.");
    }

    const outcomeSource = new OutcomeLibraryBundleOutcomeSource(project.rootPath, modeName);
    const accumulator = new SimulationAccumulator();
    let libraryId = "";
    let libraryHash = "";
    let lastReplay: PreGeneratedRoundReplayDescriptor | undefined;
    const startedAt = Date.now();
    for (let round = 0; round < rounds; round++) {
        const replayRound = round + 1;
        const roundRandomSource = seed === undefined ? randomSource : new SeededWeightedOutcomeRandomSource(deriveDeterministicSeed(seed, replayRound));
        const selection = await outcomeSource.drawOutcome(roundRandomSource);
        libraryId = selection.libraryId;
        libraryHash = selection.libraryHash;
        accumulator.addRound(selection.outcome.artifact.stake, selection.outcome.artifact.totalWin);
        if (seed !== undefined) {
            lastReplay = {
                game: selection.outcome.artifact.provenance.game,
                libraryId: selection.libraryId,
                libraryHash: selection.libraryHash,
                modeName,
                selectionAlgorithm: "derived-round-seed-v1",
                seed,
                round: replayRound,
                outcomeId: selection.outcome.id,
                weight: selection.outcome.weight,
                totalWin: selection.outcome.artifact.totalWin,
                payoutMultiplier: selection.outcome.artifact.payoutMultiplier,
                stake: selection.outcome.artifact.stake,
                screen: selection.outcome.artifact.screen.map((row) => [...row]),
                artifact: selection.outcome.artifact,
                timestamp: startedAt,
                durationMs: Date.now() - startedAt,
            };
        }
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
            ...(lastReplay === undefined ? {} : {lastReplay}),
        },
    };
}
