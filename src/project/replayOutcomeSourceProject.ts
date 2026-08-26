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
    const mismatches: string[] = [];
    const compare = (field: string, recordedValue: unknown, currentValue: unknown): void => {
        if (recordedValue !== undefined && JSON.stringify(recordedValue) !== JSON.stringify(currentValue)) {
            mismatches.push(`${field}: recorded ${JSON.stringify(recordedValue)}, current ${JSON.stringify(currentValue)}`);
        }
    };
    if (recorded !== undefined) {
        const missingFields = getMissingRecordedExactProvenance(recorded);
        if (missingFields.length > 0) {
            throw new Error(
                `Cannot verify an exact recorded outcome-library replay: the supplied descriptor is missing ${missingFields.join(", ")}. ` +
                    "Use the complete descriptor emitted by a seeded outcome-source round, or omit the recorded descriptor to reconstruct against the currently opened bundle without claiming recorded-result verification.",
            );
        }
        compare("library id", recorded.libraryId, library.libraryId);
        compare("library hash", recorded.libraryHash, libraryHash);
        compare("mode", recorded.modeName, modeName);
        compare("selection algorithm", recorded.selectionAlgorithm, "derived-round-seed-v1");
        compare("seed", recorded.seed, seed);
        compare("round", recorded.round, round);
    }
    const replay = new PreGeneratedRoundReplayer().replay({library, libraryHash, modeName, seed, round});
    const outcome = library.outcomes.find((candidate) => candidate.id === replay.outcomeId);
    if (outcome === undefined) {
        throw new Error(`Replayed outcome "${replay.outcomeId}" was not present in outcome library "${replay.libraryId}".`);
    }
    const manifest = await reader.readManifest(project.rootPath);
    if (recorded !== undefined) {
        compare("game", recorded.game, manifest.game);
        compare("outcome", recorded.outcomeId, replay.outcomeId);
        compare("weight", recorded.weight, replay.weight);
        compare("total win", recorded.totalWin, replay.totalWin);
        compare("payout multiplier", recorded.payoutMultiplier, outcome.artifact.payoutMultiplier);
        compare("stake", recorded.stake, outcome.artifact.stake);
        compare("screen", recorded.screen, outcome.artifact.screen);
        compare("artifact", recorded.artifact, outcome.artifact);
    }
    if (mismatches.length > 0) {
        throw new Error(
            `Replay provenance does not match the current input (${mismatches.join("; ")}). ` +
                "Restore/open the original game and outcome-library artifact before requesting exact replay.",
        );
    }
    const replayWithGame: PreGeneratedRoundReplayDescriptor = {...replay, game: manifest.game};
    // This is intentionally a descriptor record, not a second selection: PreGeneratedRoundReplayer above
    // is the only selector invocation, and ReplayRecorder merely normalizes that settled provenance for
    // the canonical replay product surface.
    const descriptor = new ReplayRecorder().recordPreGenerated({
        sessionId: `outcome-source:${replay.libraryId}:${seed}:${round}`,
        game: manifest.game,
        replay: replayWithGame,
        totalBet: outcome.artifact.stake,
        screen: outcome.artifact.screen.map((row) => [...row]),
    });
    return {supported: true, replay: replayWithGame, descriptor};
}

function getMissingRecordedExactProvenance(recorded: PreGeneratedRoundReplayDescriptor): string[] {
    const missing: string[] = [];
    const hasNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
    const hasFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
    const game = recorded.game;

    if (game === undefined || !hasNonEmptyString(game.id) || !hasNonEmptyString(game.name) || !hasNonEmptyString(game.version)) {
        missing.push("game identity");
    }
    if (!hasNonEmptyString(recorded.libraryId)) {
        missing.push("library id");
    }
    if (!hasNonEmptyString(recorded.libraryHash)) {
        missing.push("library hash");
    }
    if (!hasNonEmptyString(recorded.modeName)) {
        missing.push("mode");
    }
    if (recorded.selectionAlgorithm === undefined) {
        missing.push("selection algorithm");
    }
    if (!hasNonEmptyString(recorded.seed)) {
        missing.push("seed");
    }
    if (!Number.isInteger(recorded.round) || recorded.round < 1) {
        missing.push("round");
    }
    if (!hasNonEmptyString(recorded.outcomeId)) {
        missing.push("outcome id");
    }
    if (!hasFiniteNumber(recorded.weight)) {
        missing.push("weight");
    }
    if (!hasFiniteNumber(recorded.totalWin)) {
        missing.push("total win");
    }
    if (!hasFiniteNumber(recorded.payoutMultiplier)) {
        missing.push("payout multiplier");
    }
    if (!hasFiniteNumber(recorded.stake)) {
        missing.push("stake");
    }
    if (!Array.isArray(recorded.screen)) {
        missing.push("screen");
    }
    if (recorded.artifact === undefined || recorded.artifact === null) {
        missing.push("artifact");
    }
    return missing;
}
