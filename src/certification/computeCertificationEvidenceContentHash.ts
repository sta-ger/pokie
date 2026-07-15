import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {CertificationEvidenceBundleManifest} from "./CertificationEvidenceBundleManifest.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

export type CertificationEvidenceContentHashInput = Omit<CertificationEvidenceBundleManifest, "generatedAt" | "sourceBundleDir" | "evidenceContentHash">;

// Deterministic identity for a certification/evidence bundle's own CONTENT — every genuinely meaningful field
// (schemaVersion, pokieVersion, game/configHash/artifactPokieVersion, the source bundle's own manifest hash,
// every mode's own hash/metrics/sample-file hash, and the source bundle's own deep-validation *issues*) folded
// into one sha256, deliberately excluding the fields that vary purely with *when*/*where* this bundle was built
// rather than *what* it says: "generatedAt", "sourceBundleDir", and "deepValidation.ranAt" (a timestamp, same
// reasoning as generatedAt — deliberately read as "deepValidationIssues" here, never the wrapping object with
// its own ranAt). Two certifications built from the exact same source-bundle snapshot with the exact same
// modes/seeds/sampleCounts always produce the exact same evidenceContentHash, however far apart in time or
// wherever on disk they were built or verified from — this is the "same evidence" identity a rebuild-for-
// portability (a fresh copy, a different generatedAt) should never invalidate.
//
// CertificationEvidenceBundleBuilder computes this once, over a draft manifest that doesn't carry
// evidenceContentHash yet, to set the field; CertificationEvidenceBundleValidator recomputes it over an
// already-complete, already-parsed manifest (which does carry generatedAt/sourceBundleDir/evidenceContentHash)
// to check it as a self-consistency invariant — safe either way, since only the fields named above are ever
// read off "manifest".
export function computeCertificationEvidenceContentHash(manifest: CertificationEvidenceContentHashInput): string {
    const basis = {
        schemaVersion: manifest.schemaVersion,
        generatedBy: manifest.generatedBy,
        pokieVersion: manifest.pokieVersion,
        game: manifest.game,
        ...(manifest.configHash !== undefined ? {configHash: manifest.configHash} : {}),
        artifactPokieVersion: manifest.artifactPokieVersion,
        sourceBundleManifestHash: manifest.sourceBundleManifestHash,
        modes: manifest.modes,
        deepValidationIssues: manifest.deepValidation.issues,
        files: manifest.files,
    };
    return sha256OfBytes(JSON.stringify(toCanonicalJson(basis)));
}
