import type {CertificationPackIndex} from "./CertificationPackIndex.js";
import type {CertificationPackFormat, CertificationPackTemplate} from "./CertificationPack.js";

export interface CertificationPackRendering {
    render(manifest: CertificationPackIndex, format: CertificationPackFormat, template?: CertificationPackTemplate, signal?: AbortSignal): Promise<string | Buffer>;
}
