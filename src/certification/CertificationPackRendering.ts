import type {CertificationPackManifest} from "./CertificationPackManifest.js";
import type {CertificationPackFormat, CertificationPackTemplate} from "./CertificationPack.js";

export interface CertificationPackRendering {
    render(manifest: CertificationPackManifest, format: CertificationPackFormat, template?: CertificationPackTemplate, signal?: AbortSignal): Promise<string | Buffer>;
}
