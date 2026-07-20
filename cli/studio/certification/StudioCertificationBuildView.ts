import type {CertificationEvidenceBundleManifest, ValidationIssue} from "pokie";

// Mirrors CertificationEvidenceBundleBuilder.buildFromBundle's own "no partial bundle" contract exactly:
// `manifest` is present iff `errors` is empty. Never re-derived here -- every field comes straight off
// the real CertificationEvidenceBundleManifest the builder produced.
export type StudioCertificationBuildView =
    | {
          readonly status: "ok";
          readonly manifest: CertificationEvidenceBundleManifest;
          readonly files: readonly string[];
          readonly warnings: readonly ValidationIssue[];
      }
    | {readonly status: "error"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]}
    | {readonly status: "load-error"; readonly error: string};
