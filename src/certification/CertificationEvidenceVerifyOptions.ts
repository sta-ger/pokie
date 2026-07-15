// "sourceBundleDir" overrides the manifest's own recorded sourceBundleDir — the source Outcome Library Bundle a
// certification/evidence bundle was built from may have moved (a different machine, a different checkout)
// since "pokie certification build" ran, so a verifier is never forced to trust a path stamped into the
// evidence itself.
export type CertificationEvidenceVerifyOptions = {
    readonly sourceBundleDir?: string;
};
