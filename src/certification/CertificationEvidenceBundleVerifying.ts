import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {CertificationEvidenceVerifyOptions} from "./CertificationEvidenceVerifyOptions.js";

// Cross-checks a certification/evidence bundle against the *live* source Outcome Library Bundle it was built
// from — the check CertificationEvidenceBundleValidating deliberately can't do on its own, since that one never
// needs the (possibly much larger, possibly no-longer-reachable) source bundle at all. Composes
// CertificationEvidenceBundleValidating's own self-consistency check first (a structurally broken evidence
// bundle can't be meaningfully cross-checked against anything), then detects drift/tampering in four places: the
// evidence bundle's own manifest fields, the source bundle's own on-disk files, its recorded metrics, and each
// individually sampled RoundArtifact.
export interface CertificationEvidenceBundleVerifying {
    verify(certDir: string, options?: CertificationEvidenceVerifyOptions): Promise<ValidationIssue[]>;
}
