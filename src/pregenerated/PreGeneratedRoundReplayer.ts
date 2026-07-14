import {deriveDeterministicSeed} from "./internal/deriveDeterministicSeed.js";
import type {PreGeneratedRoundReplayDescriptor} from "./PreGeneratedRoundReplayDescriptor.js";
import type {PreGeneratedRoundReplayOptions} from "./PreGeneratedRoundReplayOptions.js";
import type {PreGeneratedRoundReplaying} from "./PreGeneratedRoundReplaying.js";
import {SeededWeightedOutcomeRandomSource} from "./SeededWeightedOutcomeRandomSource.js";
import {WeightedOutcomeSelector} from "./WeightedOutcomeSelector.js";

// Reproduces exactly which outcome a given (seed, round) drew from a WeightedOutcomeLibrary, with no
// wallet/session/idempotency side effects — the pre-generated counterpart to replay/ReplayRecorder,
// which best-effort replays a *live* session round by round since there's no seek-to-round primitive
// there. Here reproduction is exact, not best-effort: PreGeneratedSpinCommandHandler derives each
// round's numeric seed via the same deriveDeterministicSeed() this class uses, so replaying
// (seed, round) against the same library always reproduces the identical draw the server made when
// that round was originally served.
export class PreGeneratedRoundReplayer implements PreGeneratedRoundReplaying {
    private readonly selector = new WeightedOutcomeSelector();

    public replay<T extends string | number = string>(
        options: PreGeneratedRoundReplayOptions<T>,
    ): PreGeneratedRoundReplayDescriptor {
        const {library, libraryHash, seed, round} = options;
        if (!Number.isInteger(round) || round < 1) {
            throw new Error(`round must be a positive integer, got ${round}.`);
        }

        const startedAt = Date.now();
        const randomSource = new SeededWeightedOutcomeRandomSource(deriveDeterministicSeed(seed, round));
        const outcome = this.selector.select(library, randomSource);
        const durationMs = Date.now() - startedAt;

        return {
            libraryId: library.libraryId,
            libraryHash,
            seed,
            round,
            outcomeId: outcome.id,
            weight: outcome.weight,
            totalWin: outcome.artifact.totalWin,
            payoutMultiplier: outcome.artifact.payoutMultiplier,
            timestamp: startedAt,
            durationMs,
        };
    }
}
