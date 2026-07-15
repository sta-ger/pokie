import crypto from "crypto";

// The one "sha256:<hex>" formatter every hash in this bundle format shares (recordHash recomputation,
// samplesHash, sourceBundleManifestHash, evidenceContentHash) — never a second, differently-derived digest
// convention.
export function sha256OfBytes(bytes: string | Buffer): string {
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}
