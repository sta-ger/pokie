import type {ValidationIssue} from "../validation/ValidationIssue.js";

// Self-consistency validation of a certification/evidence bundle directory *by itself* — never needs the
// source Outcome Library Bundle it was built from (that cross-check, against a still-available source bundle,
// is CertificationEvidenceBundleVerifying's own job, and is composed on top of this one — see
// CertificationEvidenceBundleVerifier). This is the "is this directory internally what it claims to be" check:
// does manifest.json parse and match its own schema, does every mode's samples file hash to what the manifest
// recorded, does every embedded RoundArtifact still hash to its own recorded artifactHash.
export interface CertificationEvidenceBundleValidating {
    validate(certDir: string): Promise<ValidationIssue[]>;
}
