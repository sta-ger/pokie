/** Lifecycle controls for a certification publication. */
export type CertificationEvidenceBundleBuildOptions = {
    readonly signal?: AbortSignal;
};

export class CertificationEvidenceBundleBuildCancelledError extends Error {
    constructor() {
        super("Certification evidence bundle build was cancelled.");
        this.name = "CertificationEvidenceBundleBuildCancelledError";
    }
}
