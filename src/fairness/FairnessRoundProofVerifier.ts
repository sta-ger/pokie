import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {OutcomeLibraryBundleModeIndex} from "../weightedoutcome/bundle/OutcomeLibraryBundleModeIndex.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import {computeFairnessIndexHash} from "./computeFairnessIndexHash.js";
import type {FairnessRoundProof} from "./FairnessRoundProof.js";
import {FairnessRoundProofValidator} from "./FairnessRoundProofValidator.js";
import type {FairnessRoundProofValidating} from "./FairnessRoundProofValidating.js";
import type {FairnessVerifyOptions, FairnessRoundProofVerifying} from "./FairnessRoundProofVerifying.js";
import {HmacFairnessRandomSource} from "./internal/HmacFairnessRandomSource.js";

// Never throws — every fallible step (reading the live mode index, redrawing against it) is individually
// guarded, and a top-level try/catch is the final safety net, same "never throw, return diagnostics" contract
// CertificationEvidenceBundleVerifier itself follows.
export class FairnessRoundProofVerifier implements FairnessRoundProofVerifying {
    private readonly validator: FairnessRoundProofValidating;
    private readonly reader: OutcomeLibraryBundleReading;
    private readonly randomSourceFactory: (serverSeed: string, clientSeed: string, nonce: number) => WeightedOutcomeRandomSource;

    constructor(
        validator: FairnessRoundProofValidating = new FairnessRoundProofValidator(),
        reader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        randomSourceFactory: (
            serverSeed: string,
            clientSeed: string,
            nonce: number,
        ) => WeightedOutcomeRandomSource = (serverSeed, clientSeed, nonce) => new HmacFairnessRandomSource(serverSeed, clientSeed, nonce),
    ) {
        this.validator = validator;
        this.reader = reader;
        this.randomSourceFactory = randomSourceFactory;
    }

    public async verify(candidate: unknown, options?: FairnessVerifyOptions): Promise<ValidationIssue[]> {
        try {
            return await this.verifyInternal(candidate, options);
        } catch (error) {
            return [
                {
                    code: "fairness-verify-malformed",
                    severity: "error",
                    message: `this fairness proof could not be verified: ${error instanceof Error ? error.message : String(error)}.`,
                },
            ];
        }
    }

    private async verifyInternal(candidate: unknown, options: FairnessVerifyOptions | undefined): Promise<ValidationIssue[]> {
        const structuralIssues = this.validator.validate(candidate);
        // A proof this malformed (bad shape, unsupported schema/algorithm, or a seed that doesn't match its own
        // commitment) can't be meaningfully cross-checked against anything — a well-formed nonce/seed pair is a
        // precondition for constructing the HMAC byte stream at all, so this short-circuits rather than
        // attempting a partial live cross-check, mirroring CertificationEvidenceBundleVerifier's own
        // MANIFEST_UNREADABLE_CODES short-circuit.
        if (structuralIssues.some((issue) => issue.severity === "error")) {
            return structuralIssues;
        }
        const proof = candidate as FairnessRoundProof;

        if (options?.sourceBundleDir === undefined) {
            return [
                ...structuralIssues,
                {
                    code: "fairness-verify-source-bundle-dir-required",
                    severity: "error",
                    message:
                        "no sourceBundleDir was given — pass an explicit {sourceBundleDir} " +
                        '(or "--source <bundleDir>" on the CLI) to cross-check against the live source bundle.',
                },
            ];
        }
        const sourceBundleDir = options.sourceBundleDir;

        const issues: ValidationIssue[] = [...structuralIssues];

        let liveIndex: OutcomeLibraryBundleModeIndex;
        try {
            liveIndex = await this.reader.readModeIndex(sourceBundleDir, proof.modeName);
        } catch (error) {
            issues.push({
                code: "fairness-verify-source-bundle-unreadable",
                severity: "error",
                message: `could not read mode "${proof.modeName}"'s own index in "${sourceBundleDir}": ${error instanceof Error ? error.message : String(error)}.`,
            });
            return issues;
        }

        if (liveIndex.libraryId !== proof.libraryId || liveIndex.libraryHash !== proof.libraryHash) {
            issues.push({
                code: "fairness-verify-library-mismatch",
                severity: "error",
                message: `mode "${proof.modeName}" in "${sourceBundleDir}" no longer has this proof's own recorded libraryId/libraryHash — the source bundle has drifted since this round was played.`,
            });
        }

        if (computeFairnessIndexHash(liveIndex) !== proof.indexHash) {
            issues.push({
                code: "fairness-verify-index-hash-mismatch",
                severity: "error",
                message: `mode "${proof.modeName}"'s own index in "${sourceBundleDir}" no longer hashes to this proof's own recorded indexHash — the source bundle has drifted since this round was played.`,
            });
        }

        const liveEntry = liveIndex.entries.find((entry) => entry.id === proof.outcomeId);
        if (liveEntry === undefined) {
            issues.push({
                code: "fairness-verify-outcome-missing",
                severity: "error",
                message: `outcome "${proof.outcomeId}" is no longer present in mode "${proof.modeName}" of "${sourceBundleDir}".`,
            });
        } else if (liveEntry.weight !== proof.weight || liveEntry.recordHash !== proof.recordHash) {
            issues.push({
                code: "fairness-verify-outcome-record-mismatch",
                severity: "error",
                message: `outcome "${proof.outcomeId}" no longer hashes to this proof's own recorded weight/recordHash in "${sourceBundleDir}" — a substituted outcome.`,
            });
        }

        // Reproduces the exact deterministic draw this proof's own revealed serverSeed/clientSeed/nonce
        // produce, against the *live* bundle — via OutcomeLibraryBundleReading.drawOutcome, the same weighted-
        // draw algorithm (and the same byte-range/recordHash verified read) every other bundle-backed draw in
        // this codebase uses. This is what catches an outcome substituted with a different, individually valid,
        // still-existing outcome id: the per-id checks above can't tell that apart from a genuine draw, since a
        // swapped-in id can be perfectly untampered on its own — it's simply not the one this seed would
        // actually have drawn.
        const randomSource = this.randomSourceFactory(proof.serverSeed, proof.clientSeed, proof.nonce);
        try {
            const drawn = await this.reader.drawOutcome(sourceBundleDir, proof.modeName, randomSource);
            if (drawn.id !== proof.outcomeId) {
                issues.push({
                    code: "fairness-verify-selection-mismatch",
                    severity: "error",
                    message: `redrawing this proof's own serverSeed/clientSeed/nonce against "${sourceBundleDir}" deterministically selects outcome "${drawn.id}", not this proof's own recorded "${proof.outcomeId}".`,
                });
            }
        } catch (error) {
            issues.push({
                code: "fairness-verify-source-bundle-outcome-invariant",
                severity: "error",
                message: `redrawing against the live bundle failed: ${error instanceof Error ? error.message : String(error)}.`,
            });
        }

        return issues;
    }
}
