import type {CertificationPackIndex, ValidationIssue} from "@fromstan/pokie";

// Mirrors CertificationPackBuilder.buildFromBundle's own "no partial bundle" contract exactly:
// `manifest` is present iff `errors` is empty. Never re-derived here -- every field comes straight off
// the real CertificationPackIndex the builder produced.
export type StudioCertificationBuildView =
    | {
          readonly status: "ok";
          readonly fileHashes?: Readonly<Record<string, string>>;
          readonly preparationNotice?: string;
          readonly index: CertificationPackIndex;
          readonly files: readonly string[];
          readonly warnings: readonly ValidationIssue[];
      }
    | {readonly status: "error"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]}
    | {readonly status: "load-error"; readonly error: string};
