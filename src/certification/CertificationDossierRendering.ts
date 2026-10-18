import type {CertificationEvidenceBundleManifest} from "./CertificationEvidenceBundleManifest.js";
import type {CertificationDossierFormat, CertificationDossierTemplate} from "./CertificationDossier.js";

export interface CertificationDossierRendering {
    render(manifest: CertificationEvidenceBundleManifest, format: CertificationDossierFormat, template?: CertificationDossierTemplate, signal?: AbortSignal): Promise<string | Buffer>;
}
