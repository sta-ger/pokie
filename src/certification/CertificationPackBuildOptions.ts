import type {CertificationPackInputs, CertificationPackOutput} from "./CertificationPack.js";
/** Lifecycle controls for a certification publication. */
export type CertificationPackBuildOptions = {
    readonly dossier?: CertificationPackInputs;
    readonly output?: CertificationPackOutput;
    readonly onStage?: (stage: string) => void;
    readonly signal?: AbortSignal;
    /** Called after each fully verified sample is retained in staging. */
    readonly onSample?: (completed: number, total: number) => void;
};

export class CertificationPackBuildCancelledError extends Error {
    constructor() {
        super("Certification evidence bundle build was cancelled.");
        this.name = "CertificationPackBuildCancelledError";
    }
}
