import {deepFreeze} from "../internal/deepFreeze.js";
import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import {computeFairnessIndexHash} from "./computeFairnessIndexHash.js";
import type {FairnessCommitment} from "./FairnessCommitment.js";
import {FairnessRoundProofBuildError} from "./FairnessRoundProofBuildError.js";
import type {FairnessRoundProofBuilding} from "./FairnessRoundProofBuilding.js";
import {FAIRNESS_ROUND_PROOF_SCHEMA_VERSION, type FairnessRoundProof} from "./FairnessRoundProof.js";
import {HmacFairnessRandomSource} from "./internal/HmacFairnessRandomSource.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

// The one place a FairnessRoundProof is built — always from an already-issued FairnessCommitment plus the now-
// revealed serverSeed that commitment's own serverSeedHash committed to, drawn against a live source Outcome
// Library Bundle. Fails fast (FairnessRoundProofBuildError) rather than ever returning a proof whose own
// serverSeed doesn't match its commitment, or whose commitment no longer matches the live bundle's own
// libraryId/libraryHash — the same "assume the commitment is genuine, reject a genuine surprise" discipline
// OutcomeLibraryBundleReader itself has toward an already-validated bundle.
export class FairnessRoundProofBuilder implements FairnessRoundProofBuilding {
    private readonly reader: OutcomeLibraryBundleReading;
    private readonly randomSourceFactory: (serverSeed: string, clientSeed: string, nonce: number) => WeightedOutcomeRandomSource;

    constructor(
        reader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        randomSourceFactory: (
            serverSeed: string,
            clientSeed: string,
            nonce: number,
        ) => WeightedOutcomeRandomSource = (serverSeed, clientSeed, nonce) => new HmacFairnessRandomSource(serverSeed, clientSeed, nonce),
    ) {
        this.reader = reader;
        this.randomSourceFactory = randomSourceFactory;
    }

    public async build(commitment: FairnessCommitment, serverSeed: string, sourceBundleDir: string): Promise<FairnessRoundProof> {
        const serverSeedHash = sha256OfBytes(serverSeed);
        if (serverSeedHash !== commitment.serverSeedHash) {
            throw new FairnessRoundProofBuildError(
                "fairness-round-proof-reveal-seed-mismatch",
                `the revealed serverSeed hashes to "${serverSeedHash}", not this commitment's own recorded serverSeedHash "${commitment.serverSeedHash}".`,
            );
        }

        const index = await this.reader.readModeIndex(sourceBundleDir, commitment.modeName);
        if (index.libraryId !== commitment.libraryId || index.libraryHash !== commitment.libraryHash) {
            throw new FairnessRoundProofBuildError(
                "fairness-round-proof-library-mismatch",
                `mode "${commitment.modeName}" in "${sourceBundleDir}" has libraryId/libraryHash "${index.libraryId}"/"${index.libraryHash}", not this commitment's own recorded "${commitment.libraryId}"/"${commitment.libraryHash}".`,
            );
        }

        const randomSource = this.randomSourceFactory(serverSeed, commitment.clientSeed, commitment.nonce);
        const outcome = await this.reader.drawOutcome(sourceBundleDir, commitment.modeName, randomSource);
        const entry = index.entries.find((candidate) => candidate.id === outcome.id);
        if (entry === undefined) {
            // Unreachable given OutcomeLibraryBundleReading's own contract (drawOutcome always selects one of
            // this same index's own entries) — a defensive backstop, not the primary place this is enforced.
            throw new FairnessRoundProofBuildError(
                "fairness-round-proof-outcome-not-indexed",
                `drew outcome "${outcome.id}" from mode "${commitment.modeName}", but it is not present in that mode's own index.`,
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
            indexHash: computeFairnessIndexHash(index),
            outcomeId: outcome.id,
            weight: outcome.weight,
            recordHash: entry.recordHash,
            revealedAt: new Date().toISOString(),
        });
    }
}
