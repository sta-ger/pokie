/** Lifecycle controls for a certification publication. */
export type CertificationEvidenceBundleBuildOptions = {
    readonly signal?: AbortSignal;
    /** Called after each fully verified sample is retained in staging. */
    readonly onSample?: (completed: number, total: number) => void;
};

export class CertificationEvidenceBundleBuildCancelledError extends Error {
    constructor() {
        super("Certification evidence bundle build was cancelled.");
        this.name = "CertificationEvidenceBundleBuildCancelledError";
    }
}
