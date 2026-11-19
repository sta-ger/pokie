import type {CertificationPackInputs} from "./CertificationPack.js";
// "sourceBundleDir" is where the live source Outcome Library Bundle actually is — it must always be given
// explicitly by the caller (or, on the CLI, via "--source <bundleDir>"). A certification/evidence bundle's own
// manifest.sourceBundleDir is recorded for *informational* purposes only (see
// CertificationPackManifest.sourceBundleDir's own doc comment) and is never read or trusted here — a
// hand-crafted or tampered manifest could point that field anywhere, so verification never follows it. Without
// this option, CertificationPackVerifying.verify reports a diagnostic and reads nothing outside
// certDir; there is deliberately no fallback.
export type CertificationPackVerifyOptions = {
    readonly templateFile?: string;
    readonly pack?: CertificationPackInputs;
    readonly signal?: AbortSignal;
    readonly sourceBundleDir: string;
};
