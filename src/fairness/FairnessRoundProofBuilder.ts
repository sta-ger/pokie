import {deepFreeze} from "../internal/deepFreeze.js";
import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import {computeFairnessCommitmentHash} from "./computeFairnessCommitmentHash.js";
import type {FairnessCommitment} from "./FairnessCommitment.js";
import {FairnessCommitmentValidator} from "./FairnessCommitmentValidator.js";
import type {FairnessCommitmentValidating} from "./FairnessCommitmentValidating.js";
import {FairnessRoundProofBuildError} from "./FairnessRoundProofBuildError.js";
import type {FairnessRoundProofBuilding} from "./FairnessRoundProofBuilding.js";
import {FAIRNESS_ROUND_PROOF_SCHEMA_VERSION, type FairnessRoundProof} from "./FairnessRoundProof.js";
import {FairnessBundleDriftError} from "./internal/FairnessBundleDriftError.js";
import {drawPinnedFairnessOutcome} from "./internal/drawPinnedFairnessOutcome.js";
import {HmacFairnessRandomSource} from "./internal/HmacFairnessRandomSource.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

// The one place a FairnessRoundProof is built — always from an already-issued, freshly-validated
// FairnessCommitment plus the now-revealed serverSeed that commitment's own serverSeedHash committed to, drawn
// against one pinned snapshot of a live source Outcome Library Bundle (see drawPinnedFairnessOutcome). Fails
// fast (FairnessRoundProofBuildError) rather than ever returning a proof for: a commitment that doesn't validate
// on its own (FairnessCommitmentValidating — the same strict check FairnessRoundProofVerifying later re-applies
// to whatever commitment it's given), a serverSeed that doesn't match its commitment, a live bundle whose mode no
// longer matches the commitment's own pinned libraryId/libraryHash, or a bundle that drifted between reading its
// index and reading the outcome selected against it.
export class FairnessRoundProofBuilder implements FairnessRoundProofBuilding {
    private readonly commitmentValidator: FairnessCommitmentValidating;
    private readonly reader: OutcomeLibraryBundleReading;
    private readonly randomSourceFactory: (serverSeed: string, clientSeed: string, nonce: number) => WeightedOutcomeRandomSource;

    constructor(
        commitmentValidator: FairnessCommitmentValidating = new FairnessCommitmentValidator(),
        reader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        randomSourceFactory: (
            serverSeed: string,
            clientSeed: string,
            nonce: number,
        ) => WeightedOutcomeRandomSource = (serverSeed, clientSeed, nonce) => new HmacFairnessRandomSource(serverSeed, clientSeed, nonce),
    ) {
        this.commitmentValidator = commitmentValidator;
        this.reader = reader;
        this.randomSourceFactory = randomSourceFactory;
    }

    public async build(commitment: FairnessCommitment, serverSeed: string, sourceBundleDir: string): Promise<FairnessRoundProof> {
        const commitmentIssues = this.commitmentValidator.validate(commitment);
        if (commitmentIssues.some((issue) => issue.severity === "error")) {
            throw new FairnessRoundProofBuildError(
                "fairness-round-proof-commitment-invalid",
                `the given commitment does not validate: ${commitmentIssues.map((issue) => issue.code).join(", ")}.`,
            );
        }

        const serverSeedHash = sha256OfBytes(serverSeed);
        if (serverSeedHash !== commitment.serverSeedHash) {
            throw new FairnessRoundProofBuildError(
                "fairness-round-proof-reveal-seed-mismatch",
                `the revealed serverSeed hashes to "${serverSeedHash}", not this commitment's own recorded serverSeedHash "${commitment.serverSeedHash}".`,
            );
        }

        const randomSource = this.randomSourceFactory(serverSeed, commitment.clientSeed, commitment.nonce);
        let draw;
        try {
            draw = await drawPinnedFairnessOutcome(this.reader, sourceBundleDir, commitment.modeName, randomSource);
        } catch (error) {
            if (error instanceof FairnessBundleDriftError) {
                throw new FairnessRoundProofBuildError("fairness-round-proof-bundle-drift", error.message);
            }
            throw error;
        }

        if (draw.index.libraryId !== commitment.libraryId || draw.index.libraryHash !== commitment.libraryHash) {
            throw new FairnessRoundProofBuildError(
                "fairness-round-proof-library-mismatch",
                `mode "${commitment.modeName}" in "${sourceBundleDir}" has libraryId/libraryHash "${draw.index.libraryId}"/"${draw.index.libraryHash}", not this commitment's own recorded "${commitment.libraryId}"/"${commitment.libraryHash}".`,
            );
        }

        return deepFreeze({
            schemaVersion: FAIRNESS_ROUND_PROOF_SCHEMA_VERSION,
            algorithmVersion: commitment.algorithmVersion,
            serverSeed,
            serverSeedHash,
            clientSeed: commitment.clientSeed,
            nonce: commitment.nonce,
            libraryId: commitment.libraryId,
            libraryHash: commitment.libraryHash,
            modeName: commitment.modeName,
            indexHash: draw.indexHash,
            outcomeId: draw.outcome.id,
            weight: draw.outcome.weight,
            recordHash: draw.entry.recordHash,
            commitmentHash: computeFairnessCommitmentHash(commitment),
            revealedAt: new Date().toISOString(),
        });
    }
}
