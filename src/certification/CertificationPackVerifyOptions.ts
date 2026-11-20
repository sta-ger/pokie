import type {CertificationPackInputs} from "./CertificationPack.js";
// "sourceLibraryDir" is where the live source Outcome Library Bundle actually is — it must always be given
// explicitly by the caller (or, on the CLI, via "--source <folder>"). A certification/evidence bundle's own
// manifest.sourceLibraryDir is recorded for *informational* purposes only (see
// CertificationPackIndex.sourceLibraryDir's own doc comment) and is never read or trusted here — a
// hand-crafted or tampered manifest could point that field anywhere, so verification never follows it. Without
// this option, CertificationPackVerifying.verify reports a diagnostic and reads nothing outside
// certDir; there is deliberately no fallback.
export type CertificationPackVerifyOptions = {
    readonly templateFile?: string;
    readonly pack?: CertificationPackInputs;
    readonly signal?: AbortSignal;
    readonly sourceLibraryDir: string;
};
