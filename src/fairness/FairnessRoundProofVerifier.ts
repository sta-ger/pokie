import type {WeightedOutcomeRandomSource} from "../pregenerated/WeightedOutcomeRandomSource.js";
import {WeightedOutcomeSelectionError} from "../pregenerated/WeightedOutcomeSelectionError.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {OutcomeLibraryBundleInvariantError} from "../weightedoutcome/bundle/OutcomeLibraryBundleInvariantError.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import {computeFairnessCommitmentHash} from "./computeFairnessCommitmentHash.js";
import type {FairnessCommitment} from "./FairnessCommitment.js";
import {FairnessCommitmentValidator} from "./FairnessCommitmentValidator.js";
import type {FairnessCommitmentValidating} from "./FairnessCommitmentValidating.js";
import type {FairnessRoundProof} from "./FairnessRoundProof.js";
import {FairnessRoundProofValidator} from "./FairnessRoundProofValidator.js";
import type {FairnessRoundProofValidating} from "./FairnessRoundProofValidating.js";
import type {FairnessVerifyOptions, FairnessRoundProofVerifying} from "./FairnessRoundProofVerifying.js";
import {FairnessBundleDriftError} from "./internal/FairnessBundleDriftError.js";
import {drawPinnedFairnessOutcome, type PinnedFairnessDraw} from "./internal/drawPinnedFairnessOutcome.js";
import {FairnessModeIndexInvalidError} from "./internal/FairnessModeIndexInvalidError.js";
import {HmacFairnessRandomSource} from "./internal/HmacFairnessRandomSource.js";

// "as const", not a wider "(keyof FairnessCommitment)[]" annotation: narrows to exactly this literal tuple, so
// "commitment[field] !== proof[field]" below only ever indexes a field genuinely present on both types — this
// repo's own noImplicitAny: false would otherwise silently let a mistaken addition (e.g. "issuedAt", which
// FairnessRoundProof has no matching field for) compile down to an always-true "any !== any" comparison instead
// of a compile error.
const COMMITMENT_FIELDS = ["algorithmVersion", "serverSeedHash", "clientSeed", "nonce", "libraryId", "libraryHash", "modeName"] as const satisfies readonly (keyof FairnessCommitment &
    keyof FairnessRoundProof)[];

// Never throws — every fallible step (reading the live mode index, redrawing against it) is individually
// guarded, and a top-level try/catch is the final safety net, same "never throw, return diagnostics" contract
// CertificationEvidenceBundleVerifier itself follows.
//
// FairnessRoundProofValidator and FairnessCommitmentValidator ALWAYS run — hardcoded, not swappable via
// constructor injection, so a caller can never accidentally (or maliciously) accept a proof/commitment that
// doesn't actually validate by supplying a permissive replacement. "additionalProofValidator"/
// "additionalCommitmentValidator" are the two caller-extensible hooks: custom checks layered ON TOP of the
// mandatory ones, whose own issues are always merged in alongside them — a permissive additional validator that
// always returns [] can never suppress a mandatory issue, only ever fail to add more of its own.
export class FairnessRoundProofVerifier implements FairnessRoundProofVerifying {
    private readonly mandatoryProofValidator: FairnessRoundProofValidating = new FairnessRoundProofValidator();
    private readonly mandatoryCommitmentValidator: FairnessCommitmentValidating = new FairnessCommitmentValidator();
    private readonly reader: OutcomeLibraryBundleReading;
    private readonly randomSourceFactory: (serverSeed: string, clientSeed: string, nonce: number) => WeightedOutcomeRandomSource;
    private readonly additionalProofValidator: FairnessRoundProofValidating | undefined;
    private readonly additionalCommitmentValidator: FairnessCommitmentValidating | undefined;

    constructor(
        reader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        randomSourceFactory: (
            serverSeed: string,
            clientSeed: string,
            nonce: number,
        ) => WeightedOutcomeRandomSource = (serverSeed, clientSeed, nonce) => new HmacFairnessRandomSource(serverSeed, clientSeed, nonce),
        additionalProofValidator: FairnessRoundProofValidating | undefined = undefined,
        additionalCommitmentValidator: FairnessCommitmentValidating | undefined = undefined,
    ) {
        this.reader = reader;
        this.randomSourceFactory = randomSourceFactory;
        this.additionalProofValidator = additionalProofValidator;
        this.additionalCommitmentValidator = additionalCommitmentValidator;
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
        const structuralIssues = [...this.mandatoryProofValidator.validate(candidate), ...(this.additionalProofValidator?.validate(candidate) ?? [])];
        // A proof this malformed (bad shape, unsupported schema/algorithm, or a seed that doesn't match its own
        // commitment) can't be meaningfully cross-checked against anything — short-circuits rather than
        // attempting a partial cross-check, mirroring CertificationEvidenceBundleVerifier's own
        // MANIFEST_UNREADABLE_CODES short-circuit.
        if (structuralIssues.some((issue) => issue.severity === "error")) {
            return structuralIssues;
        }
        const proof = candidate as FairnessRoundProof;

        // Without a commitment, full verification is impossible: a proof's own internal consistency alone can
        // never prove it was genuinely bound to a previously-issued commitment rather than built around a fresh,
        // self-consistent, but entirely unrelated serverSeed/clientSeed/nonce. Checked before sourceBundleDir —
        // and before anything below ever reads a bundle — so a caller who omits it gets a diagnostic without
        // this class touching a bundle at all.
        if (options?.commitment === undefined) {
            return [
                ...structuralIssues,
                {
                    code: "fairness-verify-commitment-required",
                    severity: "error",
                    message:
                        "no commitment was given — full verification is impossible without the original " +
                        'FairnessCommitment this proof claims to have been built from (pass {commitment} or "--commitment ' +
                        '<commitment.json>" on the CLI).',
                },
            ];
        }

        const commitmentIssues = [
            ...this.mandatoryCommitmentValidator.validate(options.commitment),
            ...(this.additionalCommitmentValidator?.validate(options.commitment) ?? []),
        ];
        if (commitmentIssues.some((issue) => issue.severity === "error")) {
            return [
                ...structuralIssues,
                {
                    code: "fairness-verify-commitment-invalid",
                    severity: "error",
                    message: `the given commitment does not validate: ${commitmentIssues.map((issue) => issue.code).join(", ")}.`,
                },
            ];
        }
        const commitment = options.commitment as FairnessCommitment;

        const issues: ValidationIssue[] = [...structuralIssues];

        // Binds this exact proof to this exact commitment — a forged proof built around a fresh, self-consistent
        // serverSeed/serverSeedHash pair (which passes proofValidator.validate above on its own) is caught here,
        // before any bundle is ever touched, since it was never built from — and so never hashes to — the
        // genuine commitment.
        if (computeFairnessCommitmentHash(commitment) !== proof.commitmentHash) {
            issues.push({
                code: "fairness-verify-commitment-hash-mismatch",
                severity: "error",
                message: "this proof's own commitmentHash does not match the given commitment — it was not built from this exact commitment.",
            });
        }

        const mismatchedFields = COMMITMENT_FIELDS.filter((field) => commitment[field] !== proof[field]);
        if (mismatchedFields.length > 0) {
            issues.push({
                code: "fairness-verify-commitment-mismatch",
                severity: "error",
                message: `this proof's own ${mismatchedFields.join("/")} no longer match the given commitment's own recorded values.`,
                details: {fields: mismatchedFields},
            });
        }

        if (options.sourceBundleDir === undefined) {
            return [
                ...issues,
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

        // Reproduces the exact deterministic draw this proof's own revealed serverSeed/clientSeed/nonce produce,
        // against one pinned snapshot of the *live* bundle (see drawPinnedFairnessOutcome — never
        // OutcomeLibraryBundleReading.drawOutcome, which would re-read a fresh index on every call). This is
        // what catches an outcome substituted with a different, individually valid, still-existing outcome id:
        // the per-id checks below can't tell that apart from a genuine draw, since a swapped-in id can be
        // perfectly untampered on its own — it's simply not the one this seed would actually have drawn.
        const randomSource = this.randomSourceFactory(proof.serverSeed, proof.clientSeed, proof.nonce);
        const draw = await this.tryDraw(sourceBundleDir, proof.modeName, randomSource, issues);
        if (draw === undefined) {
            return issues;
        }

        if (draw.index.libraryId !== proof.libraryId || draw.index.libraryHash !== proof.libraryHash) {
            issues.push({
                code: "fairness-verify-library-mismatch",
                severity: "error",
                message: `mode "${proof.modeName}" in "${sourceBundleDir}" no longer has this proof's own recorded libraryId/libraryHash — the source bundle has drifted since this round was played.`,
            });
        }

        if (draw.indexHash !== proof.indexHash) {
            issues.push({
                code: "fairness-verify-index-hash-mismatch",
                severity: "error",
                message: `mode "${proof.modeName}"'s own index in "${sourceBundleDir}" no longer hashes to this proof's own recorded indexHash — the source bundle has drifted since this round was played.`,
            });
        }

        const liveEntry = draw.index.entries.find((entry) => entry.id === proof.outcomeId);
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

        if (draw.outcome.id !== proof.outcomeId) {
            issues.push({
                code: "fairness-verify-selection-mismatch",
                severity: "error",
                message: `redrawing this proof's own serverSeed/clientSeed/nonce against "${sourceBundleDir}" deterministically selects outcome "${draw.outcome.id}", not this proof's own recorded "${proof.outcomeId}".`,
            });
        }

        return issues;
    }

    // Wraps drawPinnedFairnessOutcome, translating its own failure modes into the specific diagnostic each one
    // deserves: bundle drift (the pinned snapshot itself was caught changing mid-draw), an untrustworthy mode
    // index (FairnessModeIndexInvalidError — a malformed/hand-tampered index_<modeName>.json, or a modeName that
    // never should have reached a file read at all), a broken selection/byte-range invariant
    // (OutcomeLibraryBundleInvariantError/WeightedOutcomeSelectionError — the live bundle's own index/outcomes
    // file have drifted out of sync, or an empty/invalid library), or the index simply being unreadable in the
    // first place (a missing bundle/mode, any other I/O failure). Returns undefined — after already pushing the
    // one issue that applies — rather than throwing, so the caller can return early without its own try/catch.
    private async tryDraw(
        sourceBundleDir: string,
        modeName: string,
        randomSource: WeightedOutcomeRandomSource,
        issues: ValidationIssue[],
    ): Promise<PinnedFairnessDraw | undefined> {
        try {
            return await drawPinnedFairnessOutcome(this.reader, sourceBundleDir, modeName, randomSource);
        } catch (error) {
            if (error instanceof FairnessBundleDriftError) {
                issues.push({code: "fairness-verify-bundle-drift", severity: "error", message: error.message});
            } else if (error instanceof FairnessModeIndexInvalidError) {
                issues.push({code: "fairness-verify-mode-index-invalid", severity: "error", message: error.message});
            } else if (error instanceof OutcomeLibraryBundleInvariantError || error instanceof WeightedOutcomeSelectionError) {
                issues.push({
                    code: "fairness-verify-source-bundle-outcome-invariant",
                    severity: "error",
                    message: `redrawing against the live bundle failed: ${error.message}.`,
                });
            } else {
                issues.push({
                    code: "fairness-verify-source-bundle-unreadable",
                    severity: "error",
                    message: `could not read mode "${modeName}"'s own index in "${sourceBundleDir}": ${error instanceof Error ? error.message : String(error)}.`,
                });
            }
            return undefined;
        }
    }
}
