import {
    computeFairnessCommitment,
    computeFairnessServerSeedCommitment,
    FairnessCommitment,
    FairnessRoundProofBuildError,
    FairnessRoundProofBuilder,
    FairnessRoundProofBuilding,
    FairnessRoundProofVerifier,
    FairnessRoundProofVerifying,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
} from "pokie";
import fs from "fs";
import {resolveProjectDirectory} from "../outcomeLibrary/resolveProjectDirectory.js";
import type {StudioFairnessConfigureView} from "./StudioFairnessConfigureView.js";
import type {StudioFairnessGenerateView} from "./StudioFairnessGenerateView.js";
import type {StudioFairnessVerifyView} from "./StudioFairnessVerifyView.js";
import type {ValidatedFairnessConfigureRequest} from "./validateFairnessConfigureRequest.js";
import type {ValidatedFairnessGenerateRequest} from "./validateFairnessGenerateRequest.js";
import type {ValidatedFairnessVerifyRequest} from "./validateFairnessVerifyRequest.js";

// The Provably Fair tab, built directly on top of pokie's own commit-reveal services (see
// docs/provably-fair.md) -- this class never computes a hash, draws an outcome, or re-implements the
// three-artifact commit-reveal contract itself; it only resolves a request's bundle path against the
// active project's root and shapes each service call's result into a view.
export class StudioFairnessService {
    private readonly reader: OutcomeLibraryBundleReading<string>;
    private readonly proofBuilder: FairnessRoundProofBuilding;
    private readonly proofVerifier: FairnessRoundProofVerifying;
    private readonly realpath: (resolvedPath: string) => string;

    constructor(
        reader: OutcomeLibraryBundleReading<string> = new OutcomeLibraryBundleReader<string>(),
        proofBuilder: FairnessRoundProofBuilding = new FairnessRoundProofBuilder(),
        proofVerifier: FairnessRoundProofVerifying = new FairnessRoundProofVerifier(),
        realpath: (resolvedPath: string) => string = (resolvedPath) => fs.realpathSync(resolvedPath),
    ) {
        this.reader = reader;
        this.proofBuilder = proofBuilder;
        this.proofVerifier = proofVerifier;
        this.realpath = realpath;
    }

    // Computes both commit-reveal artifacts a real round would publish in sequence -- the server seed
    // commitment (publishable before clientSeed/nonce are even solicited) and the full commitment
    // (publishable before the outcome is drawn) -- from the live bundle's own libraryId/libraryHash for
    // the requested mode, so Configure never lets a stale/guessed library identity slip into a commitment.
    public async configure(projectRoot: string, request: ValidatedFairnessConfigureRequest): Promise<StudioFairnessConfigureView> {
        const resolved = resolveProjectDirectory(projectRoot, request.bundleDir, this.realpath);
        if (resolved.status === "error") {
            return {status: "load-error", error: resolved.message};
        }

        let libraryId: string;
        let libraryHash: string;
        try {
            const manifest = await this.reader.readManifest(resolved.resolvedPath);
            const mode = manifest.modes.find((candidate) => candidate.modeName === request.modeName);
            if (mode === undefined) {
                return {status: "load-error", error: `Mode "${request.modeName}" was not found in bundle "${request.bundleDir}".`};
            }
            libraryId = mode.libraryId;
            libraryHash = mode.libraryHash;
        } catch (error) {
            return {status: "load-error", error: `Could not read bundle "${request.bundleDir}": ${error instanceof Error ? error.message : String(error)}`};
        }

        try {
            const serverSeedCommitment = computeFairnessServerSeedCommitment({serverSeed: request.serverSeed});
            const commitment = computeFairnessCommitment({
                serverSeedCommitment,
                clientSeed: request.clientSeed,
                nonce: request.nonce,
                libraryId,
                libraryHash,
                modeName: request.modeName,
            });
            return {status: "ok", serverSeedCommitment, commitment};
        } catch (error) {
            return {status: "invalid", message: error instanceof Error ? error.message : String(error)};
        }
    }

    public async generateProof(projectRoot: string, request: ValidatedFairnessGenerateRequest): Promise<StudioFairnessGenerateView> {
        const resolved = resolveProjectDirectory(projectRoot, request.bundleDir, this.realpath);
        if (resolved.status === "error") {
            return {status: "load-error", error: resolved.message};
        }

        try {
            // Cast, not a re-validation: FairnessRoundProofBuilder.build always runs
            // FairnessCommitmentValidator against this value before using it (see its own doc comment),
            // so a malformed request-supplied commitment still surfaces as a diagnosable build-error
            // below, never as a silent type mismatch.
            const proof = await this.proofBuilder.build(request.commitment as FairnessCommitment, request.serverSeed, resolved.resolvedPath);
            return {status: "ok", proof};
        } catch (error) {
            if (error instanceof FairnessRoundProofBuildError) {
                return {status: "build-error", code: error.getCode(), message: error.message};
            }
            return {
                status: "load-error",
                error: `Could not generate a Provably Fair round proof from "${request.bundleDir}": ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    public async verify(projectRoot: string, request: ValidatedFairnessVerifyRequest): Promise<StudioFairnessVerifyView> {
        let resolvedSourceBundleDir: string | undefined;
        if (request.sourceBundleDir !== undefined) {
            const resolved = resolveProjectDirectory(projectRoot, request.sourceBundleDir, this.realpath);
            if (resolved.status === "error") {
                return {status: "load-error", error: resolved.message};
            }
            resolvedSourceBundleDir = resolved.resolvedPath;
        }

        const issues = await this.proofVerifier.verify(request.proof, {commitment: request.commitment, sourceBundleDir: resolvedSourceBundleDir});
        return {
            status: "ok",
            errors: issues.filter((issue) => issue.severity === "error"),
            warnings: issues.filter((issue) => issue.severity !== "error"),
        };
    }
}
